// `DatasetRepository` 계약 스위트 — memory·indexeddb 공용 (ADR-0009, TECH_PLAN §6 ①~⑤).
// ① write 원자성(중간 실패 주입 → 변화 0) ② restore 왕복 ③ readAll 이 툼스톤을 **포함** ④ 병합 손실 0
// ⑤ `restore(readAll 결과)` 컴파일 실패.
//
// `DatasetRepository` 는 엔티티 레포지토리가 아니므로 `READS` 전수 대조의 대상이 아니다(ADR-0007 규칙 2).
import type { DatasetWrite } from '@/domain/dataset';
import type { Dday } from '@/domain/dday/dday';
import type { DiaryEntry } from '@/domain/diary/diary-entry';
import { createMeta, markDeleted, type MetaDeps, type Persistable } from '@/domain/meta';
import type { Routine } from '@/domain/routine/routine';
import { SETTINGS_ID } from '@/domain/theme/settings';

import type { Repositories } from '@/repositories/container';
import {
  contractCategory,
  contractDeps,
  contractFocusSession,
  contractSettings,
  contractTodo,
  idsOf,
  CONTRACT_CATEGORY_ID,
  CONTRACT_DATE,
  type ContractTarget,
} from '@/repositories/contract';
import { runCategoryRemovalContract } from '@/repositories/dataset-removal.contract';
import { isRepositoryError, type RepositoryErrorCode } from '@/repositories/repository-error';

const T1 = '2026-01-16T09:30:00.000Z';
const OLD = '2025-12-01T00:00:00.000Z';

/**
 * D-day·다이어리·루틴 한 건씩(리뷰 Major 2). 각자의 `.contract.ts`(`dday-repository.contract.ts` 등)
 * 가 이미 쓰는 것과 같은 모양의 로컬 팩토리다 — `@/test/fixtures` 를 못 쓰는 이유는 이 파일 머리주석과
 * 같다(ARCHITECTURE §1 허용 목록).
 */
function contractDday(
  deps: MetaDeps,
  fields: Partial<Dday> & { id?: string } = {},
): Persistable<Dday> {
  return createMeta<Dday>(deps, { title: 'D-day', date: CONTRACT_DATE, ...fields });
}
function contractDiaryEntry(
  deps: MetaDeps,
  fields: Partial<DiaryEntry> & { id?: string } = {},
): Persistable<DiaryEntry> {
  return createMeta<DiaryEntry>(deps, { date: CONTRACT_DATE, content: '기록', ...fields });
}
function contractRoutine(
  deps: MetaDeps,
  fields: Partial<Routine> & { id?: string } = {},
): Persistable<Routine> {
  return createMeta<Routine>(deps, {
    title: '운동',
    categoryId: CONTRACT_CATEGORY_ID,
    recurrence: { type: 'weekly', daysOfWeek: [4] },
    startDate: CONTRACT_DATE,
    active: true,
    fillFloor: CONTRACT_DATE,
    ...fields,
  });
}

/**
 * 거절의 **타입과 code 까지** 단언한다.
 *
 * `rejects.toThrow()` 는 "무엇이든 던지기만 하면" 통과한다 — 구현이 `TypeError` 를 흘리든
 * `put()` 이 뱉은 Dexie 내부 에러를 그대로 올리든 계약이 초록이었다. 그러면 `RepositoryError.code`
 * 로 분기하는 화면(§2-C 에러 카드·토스트)이 조용히 "알 수 없는 오류" 로 떨어진다.
 * 두 구현이 **같은 code 로** 실패하는 것이 계약이므로 여기서 그것까지 본다.
 */
function rejectsWithCode(promise: Promise<unknown>, code: RepositoryErrorCode): Promise<void> {
  return expect(promise).rejects.toSatisfy(
    (error: unknown) => isRepositoryError(error) && error.code === code,
    `RepositoryError('${code}') 가 아니다 — 계약은 실패의 타입과 code 를 고정한다`,
  );
}

/** `table` 축의 실패 주입 — 계약에 없는 테이블을 가리키는 쓰기. */
function brokenWrite(): DatasetWrite {
  return {
    table: '없는테이블',
    entity: contractTodo(contractDeps({ seed: 99 })),
  } as unknown as DatasetWrite;
}

/**
 * `entity` 축의 실패 주입 — 테이블은 맞고 로우가 불량이다. **두 축을 모두 걸어야** 하는 이유:
 * memory 가 `table` 만 미리 검증하던 시절 이 축에서는 앞선 쓰기가 남았고(Dexie 는 트랜잭션이
 * 롤백해 0), 계약이 그 축을 주입하지 않아 두 구현의 차이를 잡지 못했다.
 */
function brokenEntityWrite(entity: unknown): DatasetWrite {
  return { table: 'todos', entity } as unknown as DatasetWrite;
}

export function runDatasetRepositoryContract(target: ContractTarget): void {
  // 카테고리 삭제(§6)를 고정하는 절은 파일 길이 상한(300줄) 때문에 따로 있다 — 러너는 여전히 이 하나다.
  runCategoryRemovalContract(target);
  describe(`DatasetRepository 계약 (${target.name})`, () => {
    let repos: Repositories;

    beforeEach(async () => {
      repos = await target.create();
      await repos.settings.upsert(contractSettings(contractDeps()));
    });

    it('③ readAll 은 툼스톤을 포함한다 — 엔티티 조회는 같은 로우를 감춘다', async () => {
      const deps = contractDeps();
      const category = contractCategory(deps);
      await repos.categories.upsert(category);
      await repos.categories.upsert(markDeleted(category, T1));

      const snapshot = await repos.dataset.readAll();

      expect(idsOf(snapshot.categories)).toEqual([category.id]);
      expect(snapshot.categories[0].deletedAt).toBe(T1);
      expect(await repos.categories.getById(category.id)).toBeUndefined();
      expect(await repos.categories.list({ includeClosed: true })).toEqual([]);
    });

    it('설정 행이 없으면 readAll 은 RepositoryError 다 — 레포지토리가 만들지 않는다', async () => {
      const empty = await target.create();

      await rejectsWithCode(empty.dataset.readAll(), 'SETTINGS_MISSING');
    });

    it('write 는 여러 테이블을 한 번에 쓴다', async () => {
      const deps = contractDeps();
      const todo = contractTodo(deps);
      const category = contractCategory(deps);
      const session = contractFocusSession(deps);

      await repos.dataset.write([
        { table: 'todos', entity: todo },
        { table: 'categories', entity: category },
        { table: 'focusSessions', entity: session },
      ]);

      expect(await repos.todos.getById(todo.id)).toBeDefined();
      expect(await repos.categories.getById(category.id)).toBeDefined();
      expect(await repos.focusSessions.getById(session.id)).toBeDefined();
    });

    it('① write 가 중간에 실패하면 아무것도 쓰지 않는다', async () => {
      const deps = contractDeps();
      const before = contractTodo(deps);
      const after = contractCategory(deps);

      await rejectsWithCode(
        repos.dataset.write([
          { table: 'todos', entity: before },
          brokenWrite(),
          { table: 'categories', entity: after },
        ]),
        'DATASET_WRITE_INVALID',
      );

      const snapshot = await repos.dataset.readAll();
      expect(snapshot.todos).toEqual([]);
      expect(snapshot.categories).toEqual([]);
    });

    it.each([
      ['undefined', undefined],
      ['null', null],
      ['객체가 아닌 값', '투두'],
      ['id 가 없는 객체', { title: '할 일' }],
    ])(
      '① write 는 entity 축(%s)의 실패에서도 아무것도 쓰지 않는다 — table 축과 같은 보장',
      async (_label, entity) => {
        const deps = contractDeps();
        const before = contractTodo(deps);
        const after = contractCategory(deps);

        await rejectsWithCode(
          repos.dataset.write([
            { table: 'todos', entity: before },
            brokenEntityWrite(entity),
            { table: 'categories', entity: after },
          ]),
          'DATASET_WRITE_INVALID',
        );

        const snapshot = await repos.dataset.readAll();
        expect(snapshot.todos).toEqual([]);
        expect(snapshot.categories).toEqual([]);
      },
    );

    it('② restore 는 스냅샷으로 왕복한다 — 기존 로우는 사라지고 스냅샷만 남는다', async () => {
      const deps = contractDeps();
      const stale = contractTodo(deps, { title: '지워질 것' });
      await repos.todos.upsert(stale);

      const kept = contractTodo(deps, { title: '남을 것' });
      const category = contractCategory(deps);
      const settings = contractSettings(contractDeps({ now: T1 }));
      await repos.dataset.restore({
        todos: [kept],
        categories: [category],
        focusSessions: [],
        settings,
        ddays: [],
        diaryEntries: [],
        routines: [],
      });

      const snapshot = await repos.dataset.readAll();
      expect(idsOf(snapshot.todos)).toEqual([kept.id]);
      expect(idsOf(snapshot.categories)).toEqual([category.id]);
      expect(snapshot.settings).toEqual({ ...settings });
      expect(await repos.todos.getById(stale.id)).toBeUndefined();
    });

    /**
     * 리뷰 Major 2(#108): 세 테이블을 `[]` 로만 넘기는 계약은 `replaceRows(store.ddays, …)` 같은
     * 통로 한 줄이 통째로 빠져도 계약 55건이 전부 통과한다(실측: 지워 보고 확인). 이 테스트는 실제로
     * 채운 로우로 왕복시키고 **엔티티 저장소에서도 같은 결과가 보이는지**까지 본다 — `readAll` 만
     * 보면 memory·indexeddb 가 `dataset` 전용 테이블에만 쓰고 엔티티 저장소가 보는 테이블은 안
     * 갈아치우는 배선 실수를 놓친다(이 PR 자체가 memory 쪽에서 그 둘을 분리했다가 합친 이력이 있다).
     */
    it('② restore 는 ddays·diaryEntries·routines 도 물리적으로 갈아치운다 — 엔티티 저장소도 같은 결과를 본다', async () => {
      const deps = contractDeps();
      const staleDday = contractDday(deps, { title: '지워질 것' });
      await repos.dday.upsert(staleDday);
      const staleDiary = contractDiaryEntry(deps, { content: '지워질 것' });
      await repos.diaryEntries.upsert(staleDiary);
      const staleRoutine = contractRoutine(deps, { title: '지워질 것' });
      await repos.routines.upsert(staleRoutine);

      const keptDeps = contractDeps({ seed: 50 });
      const category = contractCategory(keptDeps);
      const dday = contractDday(keptDeps, { title: '남을 것' });
      const diary = contractDiaryEntry(keptDeps, { content: '남을 것' });
      const routine = contractRoutine(keptDeps, { title: '남을 것', categoryId: category.id });

      await repos.dataset.restore({
        todos: [],
        categories: [category],
        focusSessions: [],
        settings: contractSettings(contractDeps()),
        ddays: [dday],
        diaryEntries: [diary],
        routines: [routine],
      });

      const snapshot = await repos.dataset.readAll();
      expect(idsOf(snapshot.ddays)).toEqual([dday.id]);
      expect(idsOf(snapshot.diaryEntries)).toEqual([diary.id]);
      expect(idsOf(snapshot.routines)).toEqual([routine.id]);

      expect(await repos.dday.list()).toEqual([dday]);
      expect(idsOf(await repos.diaryEntries.list())).toEqual([diary.id]);
      expect(idsOf(await repos.routines.list())).toEqual([routine.id]);
      expect(idsOf(await repos.dday.list())).not.toContain(staleDday.id);
    });

    it('④ 병합에서 로컬 툼스톤이 파일의 더 오래된 비삭제 로우로 부활하지 않는다 (ADR-0009 규칙 3)', async () => {
      const deps = contractDeps();
      const local = contractCategory(deps, { name: '로컬 이름' });
      const tombstone = markDeleted(local, T1);
      await repos.categories.upsert(tombstone);
      // 파일에서 온 같은 id 의 더 오래된 비삭제 로우. 병합 결과는 "툼스톤을 실은 최종 전량" 이어야 한다.
      const fromFile = contractCategory(contractDeps({ now: OLD }), {
        id: local.id,
        name: '파일의 옛 이름',
      });
      expect(fromFile.updatedAt < tombstone.updatedAt).toBe(true);

      await repos.dataset.restore({
        todos: [],
        categories: [tombstone],
        focusSessions: [],
        settings: contractSettings(contractDeps()),
        ddays: [],
        diaryEntries: [],
        routines: [],
      });

      const snapshot = await repos.dataset.readAll();
      expect(snapshot.categories).toHaveLength(1);
      expect(snapshot.categories[0].deletedAt).toBe(T1);
      expect(snapshot.categories[0].name).toBe('로컬 이름');
      expect(await repos.categories.getById(local.id)).toBeUndefined();
    });

    it('⑤ readAll 결과를 그대로 restore 에 넘기면 컴파일 에러다 (ADR-0009 규칙 2)', async () => {
      const snapshot = await repos.dataset.readAll();

      // @ts-expect-error readAll 은 브랜드 없는 DatasetSnapshot 이다 — restore 는 PersistableSnapshot 만 받는다
      await repos.dataset.restore(snapshot);
    });

    it('설정 단일 행의 정의는 하나다 — readAll 과 settings.get() 이 같은 행을 가리킨다', async () => {
      // `id` 오름차순 첫 행을 쓰던 시절에는 'default' 보다 앞서는 id 가 readAll 만 바꿔 두 API 가 갈렸다.
      const rogue = contractSettings(contractDeps({ seed: 90 }), {
        id: 'a0000000-0000-4000-8000-000000000009',
        theme: 'dark',
      });
      await repos.dataset.write([{ table: 'settings', entity: rogue }]);

      const snapshot = await repos.dataset.readAll();
      expect(snapshot.settings.id).toBe(SETTINGS_ID);
      expect(snapshot.settings.id).toBe((await repos.settings.get())?.id);
    });
  });
}
