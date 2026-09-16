// 삭제·되돌리기 액션 테스트 (category R13·R14·R14-a·R15).
//
// 픽스처는 **비대칭**이다: 카테고리 4개(활성 3 + 종료 1)를 서로 다른 `order` 로, 투두는 두 날짜에
// 걸쳐 개수·`order`·완료 여부를 전부 다르게 깐다. 양쪽에 한 건씩만 두면 `order` 를 잘못 매기거나
// 완료 투두를 함께 건드려도 같은 값이 나와 테스트가 아무것도 지키지 못한다.
//
// 저장소는 `MemoryTables` 를 직접 깔아 만든다 — 툼스톤까지 읽어야 "완료 투두는 한 필드도 안 바뀐다"와
// 되돌리기 왕복(`rev`·`deletedAt` 까지)을 값 단위로 볼 수 있기 때문이다.
import { beforeEach, describe, expect, it } from 'vitest';

import type { Category } from '@/domain/category/category';
import type { DateKey } from '@/domain/date/date-key';
import type { Todo } from '@/domain/todo/todo';

import { setRepositories, type Repositories } from '@/repositories/container';
import { createMemoryTables, type MemoryTables } from '@/repositories/memory/live';
import { createMemoryRepositories } from '@/repositories/memory/repositories';
import { RepositoryError } from '@/repositories/repository-error';

import { createCategoryStore, type CategoryStore } from '@/features/category/store/category-store';
import { makeCategory } from '@/test/fixtures/category';
import { fixedDeps, FIXTURE_DATE } from '@/test/fixtures/deps';
import { makeTodo } from '@/test/fixtures/todo';

const DAY_1 = FIXTURE_DATE;
const DAY_2 = '2026-01-16' as DateKey;
const LATER = '2026-03-02T09:30:00.000Z';

const 공부 = makeCategory({ seq: 1, name: '공부', order: 0 });
const 운동 = makeCategory({ seq: 2, name: '운동', order: 1 });
const 독서 = makeCategory({ seq: 3, name: '독서', order: 2 });
const 쉼 = makeCategory({ seq: 4, name: '쉼', status: 'completed', closedAt: LATER, order: 3 });

/** 공부의 투두 — 두 날짜 × 완료/미완료 × 흩어진 `order`. */
const 공부_할일 = [
  makeTodo({ seq: 1, categoryId: 공부.id, date: DAY_1, order: 0, done: false }),
  makeTodo({ seq: 2, categoryId: 공부.id, date: DAY_1, order: 3, done: true, doneAt: LATER }),
  makeTodo({ seq: 3, categoryId: 공부.id, date: DAY_1, order: 5, done: false }),
  makeTodo({ seq: 4, categoryId: 공부.id, date: DAY_2, order: 2, done: false }),
  makeTodo({ seq: 5, categoryId: 공부.id, date: DAY_2, order: 7, done: true, doneAt: LATER }),
];
/** 이동 대상(운동)의 투두 — 날짜마다 최대 `order` 가 다르다(R14-a 의 날짜별 시작값). */
const 운동_할일 = [
  makeTodo({ seq: 6, categoryId: 운동.id, date: DAY_1, order: 0, done: false }),
  makeTodo({ seq: 7, categoryId: 운동.id, date: DAY_1, order: 4, done: true, doneAt: LATER }),
  makeTodo({ seq: 8, categoryId: 운동.id, date: DAY_2, order: 1, done: false }),
];

let tables: MemoryTables;
let store: ReturnType<typeof createCategoryStore>;

beforeEach(async () => {
  tables = createMemoryTables();
  for (const category of [공부, 운동, 독서, 쉼]) {
    tables.categories.rows.set(category.id, category);
  }
  for (const todo of [...공부_할일, ...운동_할일]) {
    tables.todos.rows.set(todo.id, todo);
  }
  setRepositories(createMemoryRepositories(tables));
  store = createCategoryStore(fixedDeps({ now: LATER }));
  await store.getState().load();
});

const state = (): CategoryStore => store.getState();

/** 저장소의 로우 그대로(툼스톤 포함). 조회 API 는 툼스톤을 감추므로 여기로 본다. */
function row(todo: Todo): Todo {
  const found = tables.todos.rows.get(todo.id);
  if (found === undefined) {
    throw new Error(`저장소에 ${todo.id} 가 없습니다`);
  }
  return found;
}

function categoryRow(id: string): Category {
  const found = tables.categories.rows.get(id);
  if (found === undefined) {
    throw new Error(`저장소에 ${id} 가 없습니다`);
  }
  return found;
}

/** `[id, categoryId, date, order]` — 이동 결과를 한 줄로 단언하기 위한 축약. */
function placement(todo: Todo): [string, string, string, number] {
  const current = row(todo);
  return [current.id, current.categoryId, current.date, current.order];
}

/** 쓰기를 전부 거절하는 저장소로 갈아 끼운다(조회는 그대로). */
function failWrites(): void {
  const repositories = createMemoryRepositories(tables);
  setRepositories({
    ...repositories,
    dataset: {
      ...repositories.dataset,
      write: () => Promise.reject(new RepositoryError('DATASET_WRITE_INVALID', '테스트')),
    },
  } satisfies Repositories);
}

describe('① 다른 카테고리로 옮기기 (R14·R14-a)', () => {
  beforeEach(async () => {
    await state().removeCategory({
      category: state().byId[공부.id],
      choice: { incomplete: 'move', targetId: 운동.id },
    });
  });

  it('미완료만 대상 그룹 끝으로, 날짜별로 따로 번호를 받는다', () => {
    // DAY_1 의 운동 최대 order 는 4 → 5,6. DAY_2 는 1 → 2. 원래 순서(0 < 5)가 유지된다.
    expect(placement(공부_할일[0])).toEqual([공부_할일[0].id, 운동.id, DAY_1, 5]);
    expect(placement(공부_할일[2])).toEqual([공부_할일[2].id, 운동.id, DAY_1, 6]);
    expect(placement(공부_할일[3])).toEqual([공부_할일[3].id, 운동.id, DAY_2, 2]);
  });

  it('완료한 투두는 한 필드도 바뀌지 않는다 — 삭제된 카테고리를 계속 가리킨다', () => {
    expect(row(공부_할일[1])).toEqual(공부_할일[1]);
    expect(row(공부_할일[4])).toEqual(공부_할일[4]);
  });

  it('대상 카테고리의 원래 투두도 건드리지 않는다', () => {
    for (const todo of 운동_할일) {
      expect(row(todo)).toEqual(todo);
    }
  });

  it('카테고리는 툼스톤이 되고 맵에서 내려간다', () => {
    const tombstone = categoryRow(공부.id);
    expect(tombstone.deletedAt).toBe(LATER);
    expect(tombstone.rev).toBe(공부.rev + 1);
    expect(state().byId[공부.id]).toBeUndefined();
    expect(Object.keys(state().byId).sort()).toEqual([운동.id, 독서.id, 쉼.id].sort());
  });

  it('되돌리기 메모에 삭제 직전 값이 그대로 담긴다', () => {
    const memo = state().pendingRemoval;
    expect(memo?.category).toEqual(공부);
    expect(memo?.createdCategory).toBeUndefined();
    expect(memo?.result.moved.map((m) => [m.todoId, m.prevOrder])).toEqual([
      [공부_할일[0].id, 0],
      [공부_할일[3].id, 2],
      [공부_할일[2].id, 5],
    ]);
    expect(memo?.result.deletedTodoIds).toEqual([]);
  });

  it('되돌리기가 categoryId·order·deletedAt 을 원래대로 되감고 rev 만 두 칸 오른다', async () => {
    expect(await state().undoRemoval()).toBe(true);

    const restored = categoryRow(공부.id);
    // `rev` 는 원래 값이 아니라 **툼스톤보다 한 칸 위**여야 한다 — 되감기도 하나의 변경이고,
    // 같은 rev 를 쓰면 Phase 2 LWW 가 "변경되지 않음"으로 오판한다(removal.ts `rewind`).
    expect(restored).toEqual({ ...공부, updatedAt: LATER, rev: 공부.rev + 2 });
    expect(restored.deletedAt).toBeUndefined();
    expect(state().byId[공부.id]).toEqual(restored);

    for (const moved of [공부_할일[0], 공부_할일[2], 공부_할일[3]]) {
      expect(row(moved)).toEqual({ ...moved, updatedAt: LATER, rev: moved.rev + 2 });
    }
    // 되감기에 실리지 않은 완료 투두는 여전히 rev 1 이다.
    expect(row(공부_할일[1]).rev).toBe(1);
    expect(state().pendingRemoval).toBeNull();
  });
});

describe('③ 함께 삭제 (R14)', () => {
  beforeEach(async () => {
    await state().removeCategory({
      category: state().byId[공부.id],
      choice: { incomplete: 'delete' },
    });
  });

  it('미완료만 카테고리와 같은 deletedAt 으로 소프트 삭제된다', () => {
    const deletedAt = categoryRow(공부.id).deletedAt;
    expect(deletedAt).toBe(LATER);
    for (const todo of [공부_할일[0], 공부_할일[2], 공부_할일[3]]) {
      expect(row(todo).deletedAt).toBe(deletedAt);
      expect(row(todo).categoryId).toBe(공부.id);
    }
    expect(state().pendingRemoval?.result.deletedTodoIds).toEqual([
      공부_할일[0].id,
      공부_할일[3].id,
      공부_할일[2].id,
    ]);
  });

  it('완료한 투두는 그대로 남는다', () => {
    expect(row(공부_할일[1])).toEqual(공부_할일[1]);
    expect(row(공부_할일[4])).toEqual(공부_할일[4]);
  });

  it('되돌리기가 지운 투두의 deletedAt 을 걷어 낸다', async () => {
    expect(await state().undoRemoval()).toBe(true);

    for (const todo of [공부_할일[0], 공부_할일[2], 공부_할일[3]]) {
      expect(row(todo)).toEqual({ ...todo, updatedAt: LATER, rev: todo.rev + 2 });
      expect(row(todo).deletedAt).toBeUndefined();
    }
    expect(row(공부_할일[1]).rev).toBe(1);
  });
});

describe('② 새 카테고리를 만들어 옮기기 (R12·R14-a)', () => {
  it('새 카테고리가 활성 최대 + 1 의 order 로 생기고 미완료가 거기로 간다', async () => {
    expect(
      await state().removeCategory({
        category: state().byId[공부.id],
        choice: { incomplete: 'create', name: '새 그룹', color: '#CFEB8F' },
      }),
    ).toBe(true);

    const created = Object.values(state().byId).find((c) => c.name === '새 그룹');
    // 활성 최대는 독서의 2 → 3. 삭제로 0 이 비지만 다음 재배치가 0..n-1 로 메운다(removal.ts).
    expect(created).toMatchObject({ order: 3, color: '#CFEB8F', status: 'active' });
    // 빈 카테고리로 옮기므로 날짜별 시작값은 0 이고, 원래 순서가 그대로 이어진다.
    expect(placement(공부_할일[0])).toEqual([공부_할일[0].id, created?.id, DAY_1, 0]);
    expect(placement(공부_할일[2])).toEqual([공부_할일[2].id, created?.id, DAY_1, 1]);
    expect(placement(공부_할일[3])).toEqual([공부_할일[3].id, created?.id, DAY_2, 0]);
  });

  it('이미 있는 이름이면 아무것도 바뀌지 않는다 (R12 → R2)', async () => {
    expect(
      await state().removeCategory({
        category: state().byId[공부.id],
        choice: { incomplete: 'create', name: '운동', color: '#CFEB8F' },
      }),
    ).toBe(false);

    expect(state().error).toBe('같은 이름이 이미 있어요');
    expect(state().pendingRemoval).toBeNull();
    expect(categoryRow(공부.id).deletedAt).toBeUndefined();
    expect(placement(공부_할일[0])).toEqual([공부_할일[0].id, 공부.id, DAY_1, 0]);
  });

  it('종료된 카테고리의 이름과도 겹칠 수 없다 (R2 모집단에 종료 포함)', async () => {
    expect(
      await state().removeCategory({
        category: state().byId[공부.id],
        choice: { incomplete: 'create', name: '쉼', color: '#CFEB8F' },
      }),
    ).toBe(false);
    expect(state().error).toBe('같은 이름이 이미 있어요');
  });

  it('되돌리기가 즉석 생성 카테고리를 소프트 삭제하고 투두를 원래대로 돌린다', async () => {
    await state().removeCategory({
      category: state().byId[공부.id],
      choice: { incomplete: 'create', name: '새 그룹', color: '#CFEB8F' },
    });
    const createdId = state().pendingRemoval?.result.createdCategoryId ?? '';

    expect(await state().undoRemoval()).toBe(true);

    expect(categoryRow(createdId).deletedAt).toBe(LATER);
    expect(state().byId[createdId]).toBeUndefined();
    expect(state().byId[공부.id]).toBeDefined();
    for (const moved of [공부_할일[0], 공부_할일[2], 공부_할일[3]]) {
      expect(row(moved)).toEqual({ ...moved, updatedAt: LATER, rev: moved.rev + 2 });
    }
  });
});

describe('원자성과 되돌리기 창 (R13·R15)', () => {
  it('저장이 실패하면 false + 문구 + 되돌릴 것 없음', async () => {
    failWrites();

    expect(
      await state().removeCategory({
        category: state().byId[공부.id],
        choice: { incomplete: 'move', targetId: 운동.id },
      }),
    ).toBe(false);

    expect(state().error).toBe('저장하지 못했어요. 다시 시도해 주세요');
    expect(state().pendingRemoval).toBeNull();
    expect(state().byId[공부.id]).toBeDefined();
    expect(categoryRow(공부.id).deletedAt).toBeUndefined();
    expect(placement(공부_할일[0])).toEqual([공부_할일[0].id, 공부.id, DAY_1, 0]);
  });

  it('되돌릴 것이 없으면 false 이고 오류 문구를 남기지 않는다', async () => {
    expect(await state().undoRemoval()).toBe(false);
    expect(state().error).toBeNull();
  });

  it('두 번 눌러도 두 번 되감기지 않는다', async () => {
    await state().removeCategory({
      category: state().byId[공부.id],
      choice: { incomplete: 'move', targetId: 운동.id },
    });

    const [first, second] = await Promise.all([state().undoRemoval(), state().undoRemoval()]);

    expect([first, second]).toEqual([true, false]);
    expect(row(공부_할일[0]).rev).toBe(공부_할일[0].rev + 2);
  });

  it('삭제가 또 일어나면 메모가 뒤의 것으로 덮인다', async () => {
    await state().removeCategory({
      category: state().byId[공부.id],
      choice: { incomplete: 'move', targetId: 운동.id },
    });
    await state().removeCategory({
      category: state().byId[독서.id],
      choice: { incomplete: 'delete' },
    });

    expect(state().pendingRemoval?.category.id).toBe(독서.id);
    expect(await state().undoRemoval()).toBe(true);
    // 되감긴 것은 독서뿐이다 — 공부는 툼스톤 그대로다.
    expect(categoryRow(독서.id).deletedAt).toBeUndefined();
    expect(categoryRow(공부.id).deletedAt).toBe(LATER);
  });

  it('되돌리기 저장이 실패하면 메모를 잃지 않는다', async () => {
    await state().removeCategory({
      category: state().byId[공부.id],
      choice: { incomplete: 'delete' },
    });
    failWrites();

    expect(await state().undoRemoval()).toBe(false);

    expect(state().pendingRemoval?.category.id).toBe(공부.id);
    expect(state().error).toBe('저장하지 못했어요. 다시 시도해 주세요');
  });

  it('창을 닫으면 메모를 버린다', async () => {
    await state().removeCategory({
      category: state().byId[공부.id],
      choice: { incomplete: 'delete' },
    });

    state().clearPendingRemoval();

    expect(state().pendingRemoval).toBeNull();
    expect(await state().undoRemoval()).toBe(false);
  });
});
