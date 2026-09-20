// 계약(`dataset-repository.contract.ts` ①)이 **단언하지 않는 축**을 여기서 본다.
//
// 계약은 실패한 `write`·`restore` 뒤에 `readAll()`(전량 스캔)만 확인한다. 그런데 IndexedDB 에서 로우와
// 인덱스는 별개의 저장 구조라, 롤백이 로우만 되돌리고 인덱스에 흔적을 남기면 전량 스캔은 깨끗한데
// 인덱스 조회(`listByDate`·`listByCategory`·복합 인덱스)가 유령 로우를 돌려줄 수 있다. 앱의 조회는
// 대부분 인덱스 경로이므로, 그 축을 보지 않으면 원자성 단언이 화면과 무관해진다.
//
// **이 파일이 고정하지 못하는 것(한계를 먼저 적는다 — ADR-0011 "측정한 것/측정하지 않은 것" 과 같은 정직함):**
// 위 "로우와 인덱스의 괴리" 는 실제 브라우저 엔진의 성질이고 `fake-indexeddb` 로는 **재현할 수 없다**
// (인덱스 조회가 같은 인메모리 레코드에서 파생되므로 로우가 되돌아가면 인덱스도 같이 되돌아간다).
// 여기서 고정하는 것은 "롤백 뒤에 **인덱스 경로의 조회**도 실패 전과 같은 답을 낸다" 까지다.
// 또 실제 회귀(`write` 의 트랜잭션 제거)에서는 83행의 전량 스캔 단언이 **먼저** 트립해서 85~88행의
// 인덱스 단언은 실행되지 않는다(리뷰 실측). 그렇다고 인덱스 단언이 무력한 것은 아니다 — 83행을 지우고
// 같은 교란을 걸면 85행(`listByDate(D2)`, date 인덱스 경로)이 잡는다(리뷰 실측).
//
// 실패 주입은 1단계 검증을 **통과하는** 값으로 한다(객체이고 `id` 가 있다). 구조적 복제가 불가능한
// 함수 필드를 실어 Dexie 가 트랜잭션 안에서 던지게 만든다 — 그래야 검증이 아니라 **롤백**이 시험된다.
import { beforeEach, describe, expect, it } from 'vitest';

import type { DatasetWrite } from '@/domain/dataset';
import type { DateKey } from '@/domain/date/date-key';
import { createMeta, type Meta, type MetaDeps, type Persistable } from '@/domain/meta';
import { SETTINGS_ID, type Settings } from '@/domain/theme/settings';
import type { Todo } from '@/domain/todo/todo';

import type { Repositories } from '@/repositories/container';
import { isRepositoryError } from '@/repositories/repository-error';

import { createStore, liveBy, type Store } from '@/infra/indexeddb/query';
import { createIndexedDbRepositories } from '@/infra/indexeddb/repositories';

const D1 = '2026-01-15' as DateKey;
const D2 = '2026-01-16' as DateKey;
const CAT_A = '20000000-0000-4000-8000-00000000000a';
const CAT_B = '20000000-0000-4000-8000-00000000000b';

let seq = 0;
const deps: MetaDeps = {
  now: () => '2026-01-15T00:00:00.000Z',
  id: () => `f0000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
};

const todoOf = (fields: Partial<Omit<Todo, keyof Meta>>): Persistable<Todo> =>
  createMeta<Todo>(deps, {
    categoryId: CAT_A,
    date: D1,
    title: '기존 할 일',
    done: false,
    order: 0,
    ...fields,
  });

const settingsOf = (): Persistable<Settings> =>
  createMeta<Settings>(deps, { id: SETTINGS_ID, theme: 'system', accentColor: '#000' });

/** 1단계 검증은 통과하지만 구조적 복제가 불가능한 로우. Dexie 가 트랜잭션 안에서 던진다. */
function uncloneableTodo(): Persistable<Todo> {
  const todo = todoOf({ date: D2, categoryId: CAT_B, title: '복제 불가' });
  return { ...todo, title: (() => 'boom') as unknown as string } as Persistable<Todo>;
}

/** 테스트마다 이름이 다른 DB — 계약 테스트와 같은 방식의 격리다(`query.ts` 의 `createStore` 주석). */
let bundle = 0;
const freshStore = (): Store => createStore(`tasky-atomicity-${++bundle}`);

describe('IndexedDB 트랜잭션 롤백 뒤의 인덱스 상태 (계약이 보지 않는 축)', () => {
  let store: Store;
  let repos: Repositories;
  let existing: Persistable<Todo>;

  beforeEach(async () => {
    seq = 0;
    store = freshStore();
    repos = createIndexedDbRepositories(store);
    existing = todoOf({});
    await repos.todos.upsert(existing);
    await repos.settings.upsert(settingsOf());
  });

  it('실패한 write 뒤에는 인덱스 조회에도 유령 로우가 없다', async () => {
    const ahead = todoOf({ date: D2, categoryId: CAT_B, title: '앞선 쓰기', order: 1 });

    await expect(
      repos.dataset.write([
        { table: 'todos', entity: ahead },
        { table: 'todos', entity: uncloneableTodo() },
      ]),
    ).rejects.toThrow();

    // 전량 스캔(계약이 보는 축)
    expect((await repos.dataset.readAll()).todos.map((t) => t.id)).toEqual([existing.id]);
    // 인덱스 경로(계약이 보지 않는 축) — 셋 다 실패 전 상태여야 한다.
    expect(await repos.todos.listByDate(D2)).toEqual([]);
    expect(await repos.todos.listByCategory(CAT_B)).toEqual([]);
    expect(await liveBy(store.todos, '[date+categoryId]', [D2, CAT_B])).toEqual([]);
    expect((await repos.todos.listByDateRange(D1, D2)).map((t) => t.id)).toEqual([existing.id]);
  });

  it('실패한 restore 는 비우기까지 되돌린다 — 로우도 인덱스도 실패 전 그대로다', async () => {
    await expect(
      repos.dataset.restore({
        todos: [todoOf({ date: D2, categoryId: CAT_B, order: 5 }), uncloneableTodo()],
        categories: [],
        focusSessions: [],
        settings: settingsOf(),
        ddays: [],
        diaryEntries: [],
        routines: [],
      }),
    ).rejects.toThrow();

    expect((await repos.todos.listByDate(D1)).map((t) => t.id)).toEqual([existing.id]);
    expect((await repos.todos.listByCategory(CAT_A)).map((t) => t.id)).toEqual([existing.id]);
    expect(await repos.todos.listByDate(D2)).toEqual([]);
    expect(await liveBy(store.todos, '[date+categoryId]', [D1, CAT_A])).toHaveLength(1);
  });

  it('실패한 트랜잭션 뒤에도 저장소는 계속 쓸 수 있다 — DB 가 잠기지 않는다', async () => {
    await expect(
      repos.dataset.write([{ table: 'todos', entity: uncloneableTodo() }]),
    ).rejects.toThrow();

    const next = todoOf({ date: D2, order: 2, title: '다음 쓰기' });
    await repos.dataset.write([{ table: 'todos', entity: next }]);

    expect((await repos.todos.listByDate(D2)).map((t) => t.id)).toEqual([next.id]);
  });
});

describe('dataset.write 1단계 검증의 값 (계약이 보지 않는 축: 에러 타입)', () => {
  // 실측(구현자·리뷰어 각각): 이 검증 본문을 통째로 지워도 계약 55건이 **전부 통과한다**(Dexie 가
  // `put(불량값)` 에서 던지고 트랜잭션이 롤백하므로 "변화 0" 이 그대로 성립한다). 즉 **계약은 이 검증을
  // 강제하지 않는다.** 검증이 사는 이유는 아래 둘뿐이고, 그래서 그 둘을 여기서 단언한다 — 단언하지
  // 않으면 검증은 지워도 아무도 모르는 죽은 코드다.
  //   (1) 저장소 밖으로 나가는 실패가 Dexie 내부 에러가 아니라 `RepositoryError` 다(UI 가 code 로 분기한다).
  //   (2) 에러 detail 에 제목·메모 같은 사용자 데이터가 실리지 않고 `table=…` 만 실린다.
  // 검증이 트랜잭션 **밖**이라는 것은 위 둘과 다른 축이다(안으로 옮겨도 (1)·(2)는 성립한다 — 리뷰 실측).
  // 그 축은 이 describe 마지막의 스파이 1건이 따로 고정한다.
  let repos: Repositories;

  beforeEach(() => {
    seq = 0;
    repos = createIndexedDbRepositories(freshStore());
  });

  const broken = (entity: unknown): DatasetWrite =>
    ({ table: 'todos', entity }) as unknown as DatasetWrite;

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['객체가 아닌 값', '투두'],
    ['id 가 없는 객체', { title: '할 일' }],
    ['id 가 빈 문자열', { id: '', title: '할 일' }],
  ])('불량 entity(%s)는 RepositoryError(DATASET_WRITE_INVALID) 로 나온다', async (_l, entity) => {
    const error: unknown = await repos.dataset.write([broken(entity)]).catch((e: unknown) => e);

    expect(isRepositoryError(error)).toBe(true);
    expect(isRepositoryError(error) ? error.code : error).toBe('DATASET_WRITE_INVALID');
  });

  it('계약에 없는 테이블도 같은 코드로 나온다', async () => {
    const write = { table: '없는테이블', entity: todoOf({}) } as unknown as DatasetWrite;

    const error: unknown = await repos.dataset.write([write]).catch((e: unknown) => e);

    expect(isRepositoryError(error) ? error.code : error).toBe('DATASET_WRITE_INVALID');
  });

  it('에러 메시지에 엔티티 본문(제목·메모)이 실리지 않는다', async () => {
    const secret = '비밀 제목 12345';
    const write = broken({ title: secret, memo: secret });

    const error: unknown = await repos.dataset.write([write]).catch((e: unknown) => e);

    expect(isRepositoryError(error)).toBe(true);
    expect(String(error)).not.toContain(secret);
    expect(isRepositoryError(error) ? (error.detail ?? '') : '').toContain('table=todos');
  });

  it('검증에서 걸린 write 는 트랜잭션을 한 번도 열지 않는다 (2단계 구조의 "트랜잭션 밖" 축)', async () => {
    // 위 단언들은 검증이 트랜잭션 **안**에 있어도 전부 통과한다 — 이 축을 구별하는 것은 이 1건뿐이다.
    const base = freshStore();
    let opened = 0;
    const spied: Store = {
      ...base,
      transaction: (run) => {
        opened += 1;
        return base.transaction(run);
      },
    };
    const spiedRepos = createIndexedDbRepositories(spied);

    await expect(
      spiedRepos.dataset.write([{ table: 'todos', entity: todoOf({}) }, broken(null)]),
      // 계약의 `rejectsWithCode` 와 같은 수준 — 이 자리는 검증이 던지는 자리라 code 까지 정해져 있다.
      // (위 세 자리는 Dexie 의 복제 불가 에러를 기대하는 자리라 `toThrow()` 가 맞다.)
    ).rejects.toSatisfy(
      (error: unknown) => isRepositoryError(error) && error.code === 'DATASET_WRITE_INVALID',
      "RepositoryError('DATASET_WRITE_INVALID') 가 아니다",
    );

    expect(opened, '검증 실패인데 트랜잭션이 열렸다 — 검증이 트랜잭션 안으로 들어갔다').toBe(0);
    // 대조군: 정상 쓰기는 실제로 트랜잭션을 연다(스파이가 항상 0 을 세는 게 아니다).
    await spiedRepos.dataset.write([{ table: 'todos', entity: todoOf({}) }]);
    expect(opened).toBe(1);
  });
});
