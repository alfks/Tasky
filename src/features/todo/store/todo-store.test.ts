// 투두 스토어 테스트 (todo.md R5~R7·R10~R12·R17·R18). 저장소는 memory 구현이고 매 테스트 새로 주입한다.
// 액션마다 성공·실패(롤백)·낙관적 반영을 본다(TECH_PLAN §7 스토어 행).
import { beforeEach, describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';
import type { CategoryId } from '@/domain/ids';
import type { Persistable } from '@/domain/meta';
import type { Todo } from '@/domain/todo/todo';

import { getRepositories, setRepositories, type Repositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';
import { RepositoryError } from '@/repositories/repository-error';

import { createTodoStore, type TodoStore } from '@/features/todo/store/todo-store';
import { makeCategory } from '@/test/fixtures/category';
import { fixedDeps, FIXTURE_DATE } from '@/test/fixtures/deps';
import { FIXTURE_CATEGORY_ID } from '@/test/fixtures/todo';

const OTHER_CATEGORY_ID = makeCategory({ seq: 2 }).id;
const TOMORROW = '2026-01-16' as DateKey;
const SAVE_FAILED = '저장하지 못했어요. 다시 시도해 주세요';

type Store = ReturnType<typeof createTodoStore>;

let store: Store;

/** 매 테스트 빈 저장소 + 결정적 주입기의 새 스토어. */
beforeEach(() => {
  setRepositories(createMemoryRepositories());
  store = createTodoStore(fixedDeps());
});

const state = (): TodoStore => store.getState();

/** 제목으로 현재 상태의 투두를 집는다 — id 는 주입기가 정하므로 제목이 더 읽기 좋다. */
function find(title: string): Todo {
  const todo = Object.values(state().byId).find((row) => row.title === title);
  if (todo === undefined) {
    throw new Error(`상태에 "${title}" 이 없습니다`);
  }
  return todo;
}

/** `order` 오름차순 제목 목록 — 재매김 결과를 한 줄로 단언한다. */
function orderedTitles(categoryId: CategoryId = FIXTURE_CATEGORY_ID): string[] {
  return Object.values(state().byId)
    .filter((todo) => todo.categoryId === categoryId)
    .sort((a, b) => a.order - b.order)
    .map((todo) => todo.title);
}

/** `order` 값 자체 — 0..n-1 연속성을 보기 위해. */
function orders(categoryId: CategoryId = FIXTURE_CATEGORY_ID): number[] {
  return Object.values(state().byId)
    .filter((todo) => todo.categoryId === categoryId)
    .map((todo) => todo.order)
    .sort((a, b) => a - b);
}

/** 그 날짜를 읽고 제목들을 차례로 추가한다. */
async function seed(...titles: readonly string[]): Promise<void> {
  await state().loadDate(FIXTURE_DATE);
  for (const title of titles) {
    await state().addTodo({ categoryId: FIXTURE_CATEGORY_ID, title });
  }
}

/** 쓰기를 전부 거절하는 저장소로 갈아 끼운다(조회는 그대로). */
function failWrites(): void {
  const repos = getRepositories();
  const fail = (): Promise<never> =>
    Promise.reject(new RepositoryError('DATASET_WRITE_INVALID', '테스트'));
  setRepositories({
    ...repos,
    todos: { ...repos.todos, upsert: fail },
    dataset: { ...repos.dataset, write: fail },
  } satisfies Repositories);
}

/**
 * `upsert` 를 붙잡아 두는 저장소. 반환한 함수는 **저장이 실제로 시작될 때까지 기다린 뒤** 흘려보낸다
 * — 쓰기는 큐를 한 번 거치므로 호출 직후에는 아직 `upsert` 가 불리지 않았다.
 */
function holdWrites(): () => Promise<void> {
  const repos = getRepositories();
  let release = (): void => {};
  let begun = (): void => {};
  const started = new Promise<void>((resolve) => {
    begun = resolve;
  });
  setRepositories({
    ...repos,
    todos: {
      ...repos.todos,
      upsert: (todo: Persistable<Todo>) =>
        new Promise<void>((resolve) => {
          release = () => {
            void repos.todos.upsert(todo).then(resolve);
          };
          begun();
        }),
    },
  } satisfies Repositories);
  return async () => {
    await started;
    release();
  };
}

/** 앞의 `count` 번 쓰기만 거절한다 — 한 액션은 실패하고 다음 액션은 성공하는 경로를 만든다. */
function failNextWrites(count: number): void {
  const repos = getRepositories();
  let left = count;
  setRepositories({
    ...repos,
    todos: {
      ...repos.todos,
      upsert: (todo: Persistable<Todo>) => {
        if (left > 0) {
          left -= 1;
          return Promise.reject(new RepositoryError('DATASET_WRITE_INVALID', '테스트'));
        }
        return repos.todos.upsert(todo);
      },
    },
  } satisfies Repositories);
}

/** `listByDate` 를 날짜별로 붙잡아 둔다. 반환한 함수로 그 날짜의 응답만 흘려보낸다. */
function holdReads(): (date: DateKey) => void {
  const repos = getRepositories();
  const pending = new Map<DateKey, () => void>();
  setRepositories({
    ...repos,
    todos: {
      ...repos.todos,
      listByDate: (date: DateKey) =>
        new Promise<Todo[]>((resolve) => {
          pending.set(date, () => {
            void repos.todos.listByDate(date).then(resolve);
          });
        }),
    },
  } satisfies Repositories);
  return (date) => pending.get(date)?.();
}

/** `listByDate` 를 전부 거절하는 저장소. */
function failReads(): void {
  const repos = getRepositories();
  setRepositories({
    ...repos,
    todos: {
      ...repos.todos,
      listByDate: () => Promise.reject(new RepositoryError('SCHEMA_UPGRADE_FAILED')),
    },
  } satisfies Repositories);
}

describe('loadDate (R17 선택 날짜만 메모리에)', () => {
  it('그 날짜의 투두만 읽어 상태를 채운다', async () => {
    await seed('오늘');
    await state().moveToDate(find('오늘').id, TOMORROW);
    await state().loadDate(FIXTURE_DATE);

    expect(Object.values(state().byId)).toHaveLength(0);
    expect(state().status).toBe('ready');
    expect(state().date).toBe(FIXTURE_DATE);
  });

  it('읽기가 실패하면 status=error 와 문구를 남긴다', async () => {
    failReads();

    await state().loadDate(FIXTURE_DATE);

    expect(state().status).toBe('error');
    expect(state().error).toBe(SAVE_FAILED);
  });

  it('읽기가 실패해도 이전 날짜의 목록이 화면에 남지 않는다 (R17)', async () => {
    await seed('오늘 것');
    expect(Object.values(state().byId)).toHaveLength(1);
    failReads();

    await state().loadDate(TOMORROW);

    expect(Object.values(state().byId)).toHaveLength(0);
    expect(state().status).toBe('error');
  });

  it('늦게 도착한 이전 날짜의 응답은 버린다 (날짜 스트립 연타)', async () => {
    await seed('오늘 것');
    await state().loadDate(TOMORROW);
    await state().addTodo({ categoryId: FIXTURE_CATEGORY_ID, title: '내일 것' });
    const release = holdReads();

    const first = state().loadDate(FIXTURE_DATE);
    const second = state().loadDate(TOMORROW);
    release(TOMORROW);
    await second;
    release(FIXTURE_DATE);
    await first;

    expect(state().date).toBe(TOMORROW);
    expect(state().status).toBe('ready');
    expect(Object.values(state().byId).map((todo) => todo.title)).toEqual(['내일 것']);
  });
});

describe('addTodo (R5 새 투두)', () => {
  it('`order` 는 같은 날짜·카테고리 그룹의 최대 + 1 이고 `done` 은 false 다', async () => {
    await seed('첫째', '둘째', '셋째');

    expect(orderedTitles()).toEqual(['첫째', '둘째', '셋째']);
    expect(orders()).toEqual([0, 1, 2]);
    expect(find('첫째').done).toBe(false);
  });

  it('다른 카테고리의 투두는 `order` 계산에 들어가지 않는다', async () => {
    await seed('A', 'B');
    await state().addTodo({ categoryId: OTHER_CATEGORY_ID, title: '다른 그룹' });

    expect(find('다른 그룹').order).toBe(0);
  });

  it('동시에 여러 건을 추가해도 `order` 가 겹치지 않는다 (R3 연속 입력 → R5)', async () => {
    await state().loadDate(FIXTURE_DATE);
    const titles = Array.from({ length: 10 }, (_, index) => `동시 ${index}`);

    const results = await Promise.all(
      titles.map((title) => state().addTodo({ categoryId: FIXTURE_CATEGORY_ID, title })),
    );

    expect(results.every(Boolean)).toBe(true);
    expect(orders()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(new Set(orders()).size).toBe(titles.length);
  });

  it('제목이 비면 저장하지 않고 도메인 문구를 남긴다 (R1)', async () => {
    await state().loadDate(FIXTURE_DATE);

    await expect(state().addTodo({ categoryId: FIXTURE_CATEGORY_ID, title: '   ' })).resolves.toBe(
      false,
    );
    expect(state().error).toBe('할 일을 입력해 주세요');
    expect(Object.values(state().byId)).toHaveLength(0);
  });

  it('저장이 실패하면 상태에 넣지 않는다 (낙관적이지 않다)', async () => {
    await state().loadDate(FIXTURE_DATE);
    failWrites();

    await expect(state().addTodo({ categoryId: FIXTURE_CATEGORY_ID, title: 'X' })).resolves.toBe(
      false,
    );
    expect(Object.values(state().byId)).toHaveLength(0);
    expect(state().error).toBe(SAVE_FAILED);
  });
});

describe('toggleDone (R6 낙관적 토글)', () => {
  it('저장이 끝나기 전에 화면 상태가 먼저 바뀐다', async () => {
    await seed('할 일');
    const id = find('할 일').id;
    const release = holdWrites();

    const pending = state().toggleDone(id, true);
    expect(state().byId[id].done).toBe(true);

    await release();
    await expect(pending).resolves.toBe(true);
    expect((await getRepositories().todos.getById(id))?.done).toBe(true);
  });

  it('`doneAt` 을 기록하고 `order` 는 그대로 둔다 (해제하면 제자리로 돌아온다)', async () => {
    await seed('A', 'B');
    const id = find('B').id;

    await state().toggleDone(id, true);
    expect(state().byId[id].doneAt).toBeDefined();
    expect(state().byId[id].order).toBe(1);

    await state().toggleDone(id, false);
    expect(state().byId[id].doneAt).toBeUndefined();
    expect(state().byId[id].order).toBe(1);
  });

  it('`done` 인자는 목표 상태다 — 같은 값으로 두 번 불러도 완료로 남는다 (R6)', async () => {
    await seed('할 일');
    const id = find('할 일').id;

    await expect(state().toggleDone(id, true)).resolves.toBe(true);
    await expect(state().toggleDone(id, true)).resolves.toBe(true);

    expect(state().byId[id].done).toBe(true);
    expect((await getRepositories().todos.getById(id))?.done).toBe(true);
  });

  it('저장이 실패하면 이전 값으로 되돌리고 문구를 남긴다', async () => {
    await seed('할 일');
    const id = find('할 일').id;
    const before = state().byId[id];
    failWrites();

    await expect(state().toggleDone(id, true)).resolves.toBe(false);
    expect(state().byId[id]).toEqual(before);
    expect(state().error).toBe(SAVE_FAILED);
  });

  it('저장에 실패한 토글의 롤백이 그 사이 성공한 편집을 덮지 않는다', async () => {
    await seed('원래');
    const id = find('원래').id;
    failNextWrites(1);

    const toggling = state().toggleDone(id, true);
    const editing = state().editTodo(id, { title: '바뀐 제목' });

    await expect(toggling).resolves.toBe(false);
    await expect(editing).resolves.toBe(true);

    // 화면과 저장소가 같은 값이어야 한다 — 롤백이 편집 결과를 덮으면 둘이 갈린다.
    expect(state().byId[id].title).toBe('바뀐 제목');
    expect(state().byId[id].done).toBe(false);
    expect((await getRepositories().todos.getById(id))?.title).toBe('바뀐 제목');
    expect((await getRepositories().todos.getById(id))?.done).toBe(false);
  });

  it('실패한 뒤 성공한 쓰기는 문구를 지운다 (§2-C)', async () => {
    await seed('할 일');
    const id = find('할 일').id;

    await state().addTodo({ categoryId: FIXTURE_CATEGORY_ID, title: '   ' });
    expect(state().error).not.toBeNull();
    await expect(state().toggleDone(id, true)).resolves.toBe(true);
    expect(state().error).toBeNull();

    await state().addTodo({ categoryId: FIXTURE_CATEGORY_ID, title: '   ' });
    expect(state().error).not.toBeNull();
    await expect(state().editTodo(id, { title: '다시' })).resolves.toBe(true);
    expect(state().error).toBeNull();
  });
});

describe('editTodo · removeTodo (R13·R14·R18)', () => {
  it('제목·메모를 바꾸고 `rev` 를 올린다', async () => {
    await seed('원래');
    const id = find('원래').id;
    const before = state().byId[id].rev;

    await expect(state().editTodo(id, { title: '바뀜', memo: '메모' })).resolves.toBe(true);
    expect(state().byId[id].title).toBe('바뀜');
    expect(state().byId[id].memo).toBe('메모');
    expect(state().byId[id].rev).toBe(before + 1);
  });

  it('100자를 넘는 제목은 저장하지 않는다 (R1)', async () => {
    await seed('원래');
    const id = find('원래').id;

    await expect(state().editTodo(id, { title: '가'.repeat(101) })).resolves.toBe(false);
    expect(state().byId[id].title).toBe('원래');
    expect(state().error).toBe('100자까지 쓸 수 있어요');
  });

  it('삭제는 소프트 삭제라 조회에서 사라지고 상태에서도 빠진다', async () => {
    await seed('지울 것', '남을 것');
    const id = find('지울 것').id;

    await expect(state().removeTodo(id)).resolves.toBe(true);
    expect(state().byId[id]).toBeUndefined();
    expect(await getRepositories().todos.getById(id)).toBeUndefined();
    expect(orderedTitles()).toEqual(['남을 것']);
  });

  it('삭제 저장이 실패하면 목록에 남는다', async () => {
    await seed('지울 것');
    const id = find('지울 것').id;
    failWrites();

    await expect(state().removeTodo(id)).resolves.toBe(false);
    expect(state().byId[id]).toBeDefined();
  });
});

describe('moveToDate · changeCategory (R10·R12 대상 그룹 끝으로)', () => {
  it('다른 날짜로 옮기면 대상 그룹 끝 `order` 를 받고 메모리에서 내려간다', async () => {
    await state().loadDate(TOMORROW);
    await state().addTodo({ categoryId: FIXTURE_CATEGORY_ID, title: '내일 것' });
    await seed('오늘 것');
    const id = find('오늘 것').id;

    await expect(state().moveToDate(id, TOMORROW)).resolves.toBe(true);
    expect(state().byId[id]).toBeUndefined();

    const moved = await getRepositories().todos.getById(id);
    expect(moved?.date).toBe(TOMORROW);
    expect(moved?.order).toBe(1);
  });

  it('같은 날짜로 옮기면 그룹 끝으로 가고 메모리에 남는다', async () => {
    await seed('A', 'B', 'C');
    const id = find('A').id;

    await state().moveToDate(id, FIXTURE_DATE);

    expect(state().byId[id].order).toBe(3);
    expect(orderedTitles()).toEqual(['B', 'C', 'A']);
  });

  it('다른 날짜로 옮긴 뒤 원래 날짜로 되돌릴 수 있다 (R10 되돌리기 토스트)', async () => {
    await seed('옮길 것', '남을 것');
    const id = find('옮길 것').id;
    await state().moveToDate(id, TOMORROW);
    expect(state().byId[id]).toBeUndefined();

    // 되돌리기는 이미 메모리에서 내려간 투두를 다시 부른다 — 조용히 false 를 내면 안 된다.
    await expect(state().moveToDate(id, FIXTURE_DATE)).resolves.toBe(true);

    expect(state().byId[id]?.date).toBe(FIXTURE_DATE);
    expect((await getRepositories().todos.getById(id))?.date).toBe(FIXTURE_DATE);
    expect(state().error).toBeNull();
  });

  it('저장을 기다리는 사이 날짜가 바뀌면 끝난 시점의 날짜로 메모리 여부를 정한다 (R17)', async () => {
    await seed('옮길 것');
    const id = find('옮길 것').id;
    const release = holdWrites();

    const pending = state().moveToDate(id, TOMORROW);
    await state().loadDate(TOMORROW);
    await release();
    await expect(pending).resolves.toBe(true);

    // 도착한 날짜를 보고 있으므로 메모리에 **남아야** 한다(출발 날짜 기준으로 보면 내려간다).
    expect(state().date).toBe(TOMORROW);
    expect(state().byId[id]?.date).toBe(TOMORROW);
  });

  it('카테고리를 바꾸면 **대상** 그룹 끝으로 가고 완료 상태는 유지된다 (R12)', async () => {
    // 양쪽 그룹 크기를 다르게 둔다 — 크기가 같으면 원래 그룹으로 세도 같은 `order` 가 나온다.
    await seed('옮길 것', '원래 그룹 둘째');
    for (const title of ['X', 'Y', 'Z']) {
      await state().addTodo({ categoryId: OTHER_CATEGORY_ID, title });
    }
    const id = find('옮길 것').id;
    await state().toggleDone(id, true);

    await expect(state().changeCategory(id, OTHER_CATEGORY_ID)).resolves.toBe(true);
    expect(state().byId[id].categoryId).toBe(OTHER_CATEGORY_ID);
    expect(state().byId[id].order).toBe(3);
    expect(state().byId[id].done).toBe(true);
    expect(orderedTitles(OTHER_CATEGORY_ID)).toEqual(['X', 'Y', 'Z', '옮길 것']);
  });

  // 드래그(R20)는 손이 빠르면 저장이 끝나기 전에 다음 항목을 떨어뜨린다. 큐가 없으면 두 호출이
  // 같은 스냅샷을 읽어 **같은 `order` 를 발급**한다(R5 위반) — 그러면 대상 그룹의 순서가 뒤집힌다.
  it('연달아 두 건을 같은 그룹으로 옮겨도 `order` 가 겹치지 않는다 (R5 쓰기 직렬화)', async () => {
    await seed('A', 'B');
    await state().addTodo({ categoryId: OTHER_CATEGORY_ID, title: 'X' });
    const a = find('A').id;
    const b = find('B').id;

    // 앞 저장을 **기다리지 않고** 두 번 부른다.
    await Promise.all([
      state().changeCategory(a, OTHER_CATEGORY_ID),
      state().changeCategory(b, OTHER_CATEGORY_ID),
    ]);

    expect(orders(OTHER_CATEGORY_ID)).toEqual([0, 1, 2]);
    expect(orderedTitles(OTHER_CATEGORY_ID)).toEqual(['X', 'A', 'B']);
  });
});

describe('reorder · moveBy (R11 재매김)', () => {
  it('완료 항목을 포함한 그룹 전체를 0..n-1 로 다시 매긴다', async () => {
    await seed('A', 'B', 'C', 'D');
    await state().toggleDone(find('B').id, true);

    await expect(state().reorder(find('D').id, 0)).resolves.toBe(true);

    expect(orderedTitles()).toEqual(['D', 'A', 'B', 'C']);
    expect(orders()).toEqual([0, 1, 2, 3]);
  });

  it('구멍 난 `order` 도 재매김하면 연속이 된다', async () => {
    await seed('A', 'B', 'C');
    await state().removeTodo(find('B').id);

    await state().reorder(find('C').id, 0);

    expect(orderedTitles()).toEqual(['C', 'A']);
    expect(orders()).toEqual([0, 1]);
  });

  it('완료 항목은 순서를 바꿀 수 없다 (도메인 문구를 그대로 쓴다)', async () => {
    await seed('A', 'B');
    const id = find('A').id;
    await state().toggleDone(id, true);

    await expect(state().reorder(id, 1)).resolves.toBe(false);
    expect(state().error).toBe('완료된 항목은 순서를 바꿀 수 없어요');
    expect(orderedTitles()).toEqual(['A', 'B']);
  });

  it('`moveBy` 는 완료 이웃을 건너뛰어 화면에서 한 칸만 움직인다', async () => {
    await seed('A', 'B', 'C');
    await state().toggleDone(find('B').id, true);

    await expect(state().moveBy(find('C').id, -1)).resolves.toBe(true);

    expect(orderedTitles()).toEqual(['C', 'A', 'B']);
    expect(orders()).toEqual([0, 1, 2]);
  });

  it('더 갈 이웃이 없으면 아무것도 바꾸지 않는다', async () => {
    await seed('A', 'B');

    await expect(state().moveBy(find('A').id, -1)).resolves.toBe(true);
    expect(orderedTitles()).toEqual(['A', 'B']);
  });

  it('재정렬은 같은 카테고리 그룹만 재매김한다 (R11 그룹 경계)', async () => {
    await seed('A', 'B', 'C');
    for (const title of ['X', 'Y']) {
      await state().addTodo({ categoryId: OTHER_CATEGORY_ID, title });
    }

    await expect(state().reorder(find('C').id, 0)).resolves.toBe(true);

    expect(orderedTitles()).toEqual(['C', 'A', 'B']);
    expect(orderedTitles(OTHER_CATEGORY_ID)).toEqual(['X', 'Y']);
    expect(orders(OTHER_CATEGORY_ID)).toEqual([0, 1]);
  });

  it('`moveBy` 도 같은 카테고리 그룹만 재매김한다 (R11 그룹 경계)', async () => {
    await seed('A', 'B');
    for (const title of ['X', 'Y']) {
      await state().addTodo({ categoryId: OTHER_CATEGORY_ID, title });
    }

    await expect(state().moveBy(find('B').id, -1)).resolves.toBe(true);

    expect(orderedTitles()).toEqual(['B', 'A']);
    expect(orders()).toEqual([0, 1]);
    expect(orderedTitles(OTHER_CATEGORY_ID)).toEqual(['X', 'Y']);
    expect(orders(OTHER_CATEGORY_ID)).toEqual([0, 1]);
  });

  it('재매김 저장이 실패하면 건드린 투두 전부가 이전 `order` 로 돌아간다', async () => {
    await seed('A', 'B', 'C');
    const before = orderedTitles();
    failWrites();

    await expect(state().reorder(find('C').id, 0)).resolves.toBe(false);

    expect(orderedTitles()).toEqual(before);
    expect(orders()).toEqual([0, 1, 2]);
    expect(state().error).toBe(SAVE_FAILED);
  });
});

describe('없는 투두·clearError', () => {
  it('상태에 없는 id 를 넘긴 액션은 false 를 돌려주고 아무것도 쓰지 않는다', async () => {
    await state().loadDate(FIXTURE_DATE);
    const ghost = 'f0000000-0000-4000-8000-000000009999';

    await expect(state().toggleDone(ghost, true)).resolves.toBe(false);
    await expect(state().editTodo(ghost, { title: 'X' })).resolves.toBe(false);
    await expect(state().removeTodo(ghost)).resolves.toBe(false);
    await expect(state().reorder(ghost, 0)).resolves.toBe(false);
    await expect(state().moveBy(ghost, 1)).resolves.toBe(false);
    await expect(state().moveToDate(ghost, TOMORROW)).resolves.toBe(false);
    await expect(state().changeCategory(ghost, OTHER_CATEGORY_ID)).resolves.toBe(false);
    expect(state().error).toBeNull();
  });

  it('없는 id 의 `false` 는 문구를 남기지 않아 저장 실패와 구분된다 (R3 입력 행 판단)', async () => {
    await seed('있는 것');
    const id = find('있는 것').id;
    const ghost = 'f0000000-0000-4000-8000-000000009999';

    await expect(state().editTodo(ghost, { title: 'X' })).resolves.toBe(false);
    expect(state().error).toBeNull();

    failWrites();
    await expect(state().editTodo(id, { title: 'X' })).resolves.toBe(false);
    expect(state().error).toBe(SAVE_FAILED);
  });

  it('날짜를 읽기 전에는 추가할 수 없다', async () => {
    await expect(state().addTodo({ categoryId: FIXTURE_CATEGORY_ID, title: 'X' })).resolves.toBe(
      false,
    );
  });

  it('clearError 가 문구를 지운다', async () => {
    await state().loadDate(FIXTURE_DATE);
    await state().addTodo({ categoryId: FIXTURE_CATEGORY_ID, title: '' });
    expect(state().error).not.toBeNull();

    state().clearError();
    expect(state().error).toBeNull();
  });
});

describe('쓰기 revision (T-56) — 저장소에 반영된 쓰기만 센다', () => {
  it('0 에서 시작하고 적재만으로는 오르지 않는다', async () => {
    expect(state().writeRevision).toBe(0);

    await state().loadDate(FIXTURE_DATE);
    await state().loadDate(TOMORROW);

    // 적재는 읽기다 — 목록은 이미 갱신되므로 남에게 "다시 읽어라" 고 할 이유가 없다.
    expect(state().writeRevision).toBe(0);
  });

  it('성공한 쓰기마다 정확히 1 씩 오른다 (추가·토글·편집·삭제)', async () => {
    await state().loadDate(FIXTURE_DATE);
    expect(state().writeRevision).toBe(0);

    await state().addTodo({ categoryId: FIXTURE_CATEGORY_ID, title: '달리기' });
    expect(state().writeRevision).toBe(1);

    const todo = find('달리기');
    await state().toggleDone(todo.id, true);
    expect(state().writeRevision).toBe(2);

    await state().editTodo(todo.id, { title: '달리기 30분' });
    expect(state().writeRevision).toBe(3);

    await state().removeTodo(todo.id);
    expect(state().writeRevision).toBe(4);
  });

  it('낙관적 순서 변경도 저장이 끝난 뒤에 오른다 — 한 트랜잭션이니 1 이다', async () => {
    await seed('가', '나', '다');
    const before = state().writeRevision;

    await state().reorder(find('다').id, 0);

    expect(orderedTitles()).toEqual(['다', '가', '나']);
    expect(state().writeRevision).toBe(before + 1);
  });

  it('저장이 실패해 되돌아간 쓰기는 올리지 않는다 — 올리면 화면이 낡은 값으로 덮인다', async () => {
    await seed('달리기', '수영');
    const before = state().writeRevision;
    const todo = find('달리기');
    failWrites();

    expect(await state().toggleDone(todo.id, true)).toBe(false);
    expect(await state().editTodo(todo.id, { title: '걷기' })).toBe(false);
    expect(await state().reorder(find('수영').id, 0)).toBe(false);
    expect(await state().addTodo({ categoryId: FIXTURE_CATEGORY_ID, title: '요가' })).toBe(false);

    expect(state().error).toBe(SAVE_FAILED);
    expect(state().writeRevision).toBe(before);
  });

  it('아무것도 바꾸지 않은 재정렬은 성공이지만 올리지 않는다 — 쓴 것이 없다', async () => {
    await seed('달리기');
    const before = state().writeRevision;

    expect(await state().reorder(find('달리기').id, 0)).toBe(true);

    expect(state().writeRevision).toBe(before);
  });

  it('대상이 없어 아무것도 쓰지 않은 호출도 올리지 않는다', async () => {
    await state().loadDate(FIXTURE_DATE);
    const before = state().writeRevision;

    expect(await state().toggleDone('없는-id' as Todo['id'], true)).toBe(false);
    expect(await state().editTodo('없는-id' as Todo['id'], { title: '아무거나' })).toBe(false);
    expect(await state().removeTodo('없는-id' as Todo['id'])).toBe(false);

    expect(state().writeRevision).toBe(before);
  });
});
