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

/** `upsert` 를 붙잡아 두는 저장소. 반환한 함수를 부를 때까지 저장이 끝나지 않는다. */
function holdWrites(): () => void {
  const repos = getRepositories();
  let release = (): void => {};
  setRepositories({
    ...repos,
    todos: {
      ...repos.todos,
      upsert: (todo: Persistable<Todo>) =>
        new Promise<void>((resolve) => {
          release = () => {
            void repos.todos.upsert(todo).then(resolve);
          };
        }),
    },
  } satisfies Repositories);
  return () => {
    release();
  };
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
    const repos = getRepositories();
    setRepositories({
      ...repos,
      todos: {
        ...repos.todos,
        listByDate: () => Promise.reject(new RepositoryError('SCHEMA_UPGRADE_FAILED')),
      },
    } satisfies Repositories);

    await state().loadDate(FIXTURE_DATE);

    expect(state().status).toBe('error');
    expect(state().error).toBe(SAVE_FAILED);
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

    release();
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

  it('저장이 실패하면 이전 값으로 되돌리고 문구를 남긴다', async () => {
    await seed('할 일');
    const id = find('할 일').id;
    const before = state().byId[id];
    failWrites();

    await expect(state().toggleDone(id, true)).resolves.toBe(false);
    expect(state().byId[id]).toEqual(before);
    expect(state().error).toBe(SAVE_FAILED);
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

  it('카테고리를 바꾸면 대상 카테고리 그룹 끝으로 가고 완료 상태는 유지된다', async () => {
    await seed('옮길 것');
    await state().addTodo({ categoryId: OTHER_CATEGORY_ID, title: '이미 있던 것' });
    const id = find('옮길 것').id;
    await state().toggleDone(id, true);

    await expect(state().changeCategory(id, OTHER_CATEGORY_ID)).resolves.toBe(true);
    expect(state().byId[id].categoryId).toBe(OTHER_CATEGORY_ID);
    expect(state().byId[id].order).toBe(1);
    expect(state().byId[id].done).toBe(true);
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
