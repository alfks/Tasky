// `TodoRepository` 계약 스위트 — memory(T-08)·indexeddb(T-10) **두 구현에 같은 테스트**를 돌린다.
// 실행은 구현 쪽 `*.contract.test.ts` 가 `runTodoRepositoryContract(target)` 를 불러서 한다.
//
// ADR-0007 규칙 3 의 (a)~(e)가 필수 케이스다: (a) `Meta` 왕복 동일 · (b) `touch` 후 `rev` +1 ·
// (c) 툼스톤이 `READS` 전 메서드에서 빠짐 · (d) `upsert(plain)` 컴파일 실패 · (e) `READS` 전수 대조.
import { markDeleted, touch } from '@/domain/meta';
import type { Todo } from '@/domain/todo/todo';

import {
  contractDeps,
  contractTodo,
  idsOf,
  CONTRACT_INSTANT,
  type ContractTarget,
} from '@/repositories/contract';
import type { TodoRepository } from '@/repositories/todo-repository';

/** 조회 메서드 이름 — 쓰기(`upsert`)를 뺀 나머지 **전부**. 인터페이스에서 파생되므로 손으로 세지 않는다. */
type ReadName = Exclude<keyof TodoRepository, 'upsert'>;
type ReadCall = (repo: TodoRepository, todo: Todo) => Promise<Todo | Todo[] | undefined>;

/**
 * (e) `READS` 전수 대조 — **배열이 아니라 매핑 타입**이다(ADR-0007 결정 6).
 * 조회 메서드를 인터페이스에 더하고 여기를 안 고치면 `TS1360`(빠진 이름을 지목),
 * 쓰기 메서드를 여기 넣으면 `TS2353` 이다. `satisfies readonly (keyof T)[]` 는 전수성을 보지 않아 쓰지 않는다.
 */
const READS = {
  getById: (repo, todo) => repo.getById(todo.id),
  listByDate: (repo, todo) => repo.listByDate(todo.date),
  listByDateRange: (repo, todo) => repo.listByDateRange(todo.date, todo.date),
  listByCategory: (repo, todo) => repo.listByCategory(todo.categoryId),
  listAll: (repo) => repo.listAll(),
  search: (repo, todo) => repo.search(todo.title, 20),
} satisfies Record<ReadName, ReadCall>;

/** 조회 결과(단건·목록·`undefined`)를 한 모양으로 편다. (c) 가 전 메서드를 같은 방식으로 단언하게 한다. */
function rowsOf(result: Todo | Todo[] | undefined): Todo[] {
  return result === undefined ? [] : Array.isArray(result) ? result : [result];
}

const T1 = '2026-01-16T09:30:00.000Z';
const OTHER_CATEGORY = '20000000-0000-4000-8000-000000000002';

export function runTodoRepositoryContract(target: ContractTarget): void {
  describe(`TodoRepository 계약 (${target.name})`, () => {
    let repo: TodoRepository;

    beforeEach(async () => {
      repo = (await target.create()).todos;
    });

    it('(a) Meta 를 왕복해도 값이 그대로다', async () => {
      const todo = contractTodo(contractDeps(), { title: '아침 스트레칭', memo: '5분' });

      await repo.upsert(todo);

      expect(await repo.getById(todo.id)).toEqual({ ...todo });
    });

    it('(b) touch 한 값을 저장하면 rev 가 정확히 +1 되고 updatedAt 이 바뀐다', async () => {
      const todo = contractTodo(contractDeps());
      await repo.upsert(todo);

      await repo.upsert(touch({ ...todo, done: true }, T1));

      const saved = await repo.getById(todo.id);
      expect(saved?.rev).toBe(todo.rev + 1);
      expect(saved?.updatedAt).toBe(T1);
      expect(saved?.done).toBe(true);
    });

    it('(c) 툼스톤은 READS 의 모든 조회 메서드에서 빠진다', async () => {
      const todo = contractTodo(contractDeps());
      const kept = contractTodo(contractDeps({ seed: 9 }), { title: '남는 할 일', order: 1 });
      await repo.upsert(todo);
      await repo.upsert(kept);

      await repo.upsert(markDeleted(todo, T1));

      for (const [name, read] of Object.entries(READS)) {
        const rows = rowsOf(await read(repo, todo));
        expect(idsOf(rows), `${name} 가 툼스톤을 돌려줬다`).not.toContain(todo.id);
      }
      expect(idsOf(await repo.listAll())).toEqual([kept.id]);
    });

    it('(d) 브랜드 없는 값은 저장할 수 없다', async () => {
      const todo = contractTodo(contractDeps());
      await repo.upsert(todo);
      const plain = await repo.getById(todo.id);
      expect(plain).toBeDefined();
      if (plain === undefined) {
        return;
      }

      // @ts-expect-error 조회 결과는 브랜드가 없다 — 그대로 다시 저장하면 컴파일 에러다 (ADR-0007 규칙 3-d, TS2345)
      await repo.upsert(plain);
    });

    it('upsert 는 복사본을 저장한다 — 호출자가 나중에 인자를 변형해도 저장소가 오염되지 않는다', async () => {
      const todo = contractTodo(contractDeps());
      await repo.upsert(todo);

      // indexeddb 는 구조적 복제라 이 변형이 저장된 로우에 닿지 않는다. memory 도 같은 보장이어야 한다.
      const mutable = todo as { title: string };
      mutable.title = '나중에 바뀐 제목';

      expect((await repo.getById(todo.id))?.title).toBe('할 일');
    });

    it('(e) READS 는 인터페이스의 조회 메서드를 하나도 빠뜨리지 않는다', () => {
      // 전수성 판정은 위 satisfies 가 tsc 에서 한다. 여기서는 그 이름들이 실제로 구현에 있는지만 본다.
      for (const name of Object.keys(READS)) {
        expect(repo[name as ReadName]).toBeTypeOf('function');
      }
    });

    it('목록은 order → createdAt → id 순이다', async () => {
      const deps = contractDeps();
      const third = contractTodo(deps, { order: 2 });
      const first = contractTodo(deps, { order: 0 });
      const second = contractTodo(deps, { order: 1 });
      for (const todo of [third, first, second]) {
        await repo.upsert(todo);
      }

      expect(idsOf(await repo.listByDate(first.date))).toEqual([first.id, second.id, third.id]);
    });

    it('order 가 같으면 createdAt → id 로 끊는다', async () => {
      const older = contractTodo(contractDeps({ now: CONTRACT_INSTANT, seed: 2 }));
      const newer = contractTodo(contractDeps({ now: T1, seed: 1 }));
      await repo.upsert(newer);
      await repo.upsert(older);

      expect(idsOf(await repo.listAll())).toEqual([older.id, newer.id]);
    });

    it('listByDate 는 그 날짜만 돌려준다', async () => {
      const deps = contractDeps();
      const today = contractTodo(deps);
      const tomorrow = contractTodo(deps, { date: '2026-01-16' });
      await repo.upsert(today);
      await repo.upsert(tomorrow);

      expect(idsOf(await repo.listByDate(today.date))).toEqual([today.id]);
    });

    it('listByDateRange 는 양끝을 포함한다', async () => {
      const deps = contractDeps();
      const before = contractTodo(deps, { date: '2026-01-14' });
      const from = contractTodo(deps, { date: '2026-01-15' });
      const to = contractTodo(deps, { date: '2026-01-16' });
      const after = contractTodo(deps, { date: '2026-01-17' });
      for (const todo of [before, from, to, after]) {
        await repo.upsert(todo);
      }

      const rows = await repo.listByDateRange('2026-01-15', '2026-01-16');
      expect(idsOf(rows).sort()).toEqual([from.id, to.id].sort());
    });

    it('listByCategory 는 그 카테고리만 돌려준다', async () => {
      const deps = contractDeps();
      const mine = contractTodo(deps);
      const other = contractTodo(deps, { categoryId: OTHER_CATEGORY });
      await repo.upsert(mine);
      await repo.upsert(other);

      expect(idsOf(await repo.listByCategory(mine.categoryId))).toEqual([mine.id]);
    });

    it('search 는 제목만 대소문자 무시로 부분 일치한다 (shortcuts R9)', async () => {
      const deps = contractDeps();
      const hit = contractTodo(deps, { title: 'Yoga 하기' });
      const memoOnly = contractTodo(deps, { title: '장보기', memo: 'yoga 매트' });
      await repo.upsert(hit);
      await repo.upsert(memoOnly);

      expect(idsOf(await repo.search('YOGA', 20))).toEqual([hit.id]);
    });

    it('search 는 날짜 내림차순 → 미완료 우선으로 정렬하고 limit 을 지킨다', async () => {
      const deps = contractDeps();
      const oldOne = contractTodo(deps, { title: '검색어', date: '2026-01-14' });
      const doneToday = contractTodo(deps, { title: '검색어', done: true, order: 0 });
      const openToday = contractTodo(deps, { title: '검색어', order: 1 });
      for (const todo of [oldOne, doneToday, openToday]) {
        await repo.upsert(todo);
      }

      expect(idsOf(await repo.search('검색어', 20))).toEqual([
        openToday.id,
        doneToday.id,
        oldOne.id,
      ]);
      expect(idsOf(await repo.search('검색어', 2))).toEqual([openToday.id, doneToday.id]);
    });

    it('없는 id 는 undefined 다', async () => {
      expect(await repo.getById('f0000000-0000-4000-8000-000000009999')).toBeUndefined();
    });
  });
}
