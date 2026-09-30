// 삭제·되돌리기 액션 테스트 (category R13·R14·R14-a·R15).
//
// 픽스처는 **비대칭**이다: 카테고리 4개(활성 3 + 종료 1)를 서로 다른 `order` 로, 투두는 두 날짜에
// 걸쳐 개수·`order`·완료 여부를 전부 다르게 깐다. 양쪽에 한 건씩만 두면 `order` 를 잘못 매기거나
// 완료 투두를 함께 건드려도 같은 값이 나와 테스트가 아무것도 지키지 못한다.
//
// 저장소는 `MemoryTables` 를 직접 깔아 만든다 — 툼스톤까지 읽어야 "완료 투두는 한 필드도 안 바뀐다"와
// 되돌리기 왕복(`rev`·`deletedAt` 까지)을 값 단위로 볼 수 있기 때문이다.
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

export const DAY_1 = FIXTURE_DATE;
export const DAY_2 = '2026-01-16' as DateKey;
export const LATER = '2026-03-02T09:30:00.000Z';

export const 공부 = makeCategory({ seq: 1, name: '공부', order: 0 });
export const 운동 = makeCategory({ seq: 2, name: '운동', order: 1 });
export const 독서 = makeCategory({ seq: 3, name: '독서', order: 2 });
export const 쉼 = makeCategory({
  seq: 4,
  name: '쉼',
  status: 'completed',
  closedAt: LATER,
  order: 3,
});

/** 공부의 투두 — 두 날짜 × 완료/미완료 × 흩어진 `order`. */
export const 공부_할일 = [
  makeTodo({ seq: 1, categoryId: 공부.id, date: DAY_1, order: 0, done: false }),
  makeTodo({ seq: 2, categoryId: 공부.id, date: DAY_1, order: 3, done: true, doneAt: LATER }),
  makeTodo({ seq: 3, categoryId: 공부.id, date: DAY_1, order: 5, done: false }),
  makeTodo({ seq: 4, categoryId: 공부.id, date: DAY_2, order: 2, done: false }),
  makeTodo({ seq: 5, categoryId: 공부.id, date: DAY_2, order: 7, done: true, doneAt: LATER }),
];
/** 이동 대상(운동)의 투두 — 날짜마다 최대 `order` 가 다르다(R14-a 의 날짜별 시작값). */
export const 운동_할일 = [
  makeTodo({ seq: 6, categoryId: 운동.id, date: DAY_1, order: 0, done: false }),
  makeTodo({ seq: 7, categoryId: 운동.id, date: DAY_1, order: 4, done: true, doneAt: LATER }),
  makeTodo({ seq: 8, categoryId: 운동.id, date: DAY_2, order: 1, done: false }),
];

export let tables: MemoryTables;
export let store: ReturnType<typeof createCategoryStore>;

export async function setupRemovalFixture() {
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
}

export const state = (): CategoryStore => store.getState();

/** 저장소의 로우 그대로(툼스톤 포함). 조회 API 는 툼스톤을 감추므로 여기로 본다. */
export function row(todo: Todo): Todo {
  const found = tables.todos.rows.get(todo.id);
  if (found === undefined) {
    throw new Error(`저장소에 ${todo.id} 가 없습니다`);
  }
  return found;
}

export function categoryRow(id: string): Category {
  const found = tables.categories.rows.get(id);
  if (found === undefined) {
    throw new Error(`저장소에 ${id} 가 없습니다`);
  }
  return found;
}

/** `[id, categoryId, date, order]` — 이동 결과를 한 줄로 단언하기 위한 축약. */
export function placement(todo: Todo): [string, string, string, number] {
  const current = row(todo);
  return [current.id, current.categoryId, current.date, current.order];
}

/** 쓰기를 전부 거절하는 저장소로 갈아 끼운다(조회는 그대로). */
export function failWrites(): void {
  const repositories = createMemoryRepositories(tables);
  setRepositories({
    ...repositories,
    dataset: {
      ...repositories.dataset,
      write: () => Promise.reject(new RepositoryError('DATASET_WRITE_INVALID', '테스트')),
    },
  } satisfies Repositories);
}
