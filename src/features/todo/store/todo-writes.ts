// 투두 쓰기의 공통 배선 — **언제 저장하고 실패하면 무엇을 되돌리는가**만 담는다.
// 정렬·재매김·검증은 `@/domain/todo/*`(복제 금지), 액션 조립은 `todo-actions.ts`, 상태 모양은 `todo-state.ts`.
//
// **모든 쓰기는 한 줄로 직렬화한다**(`serialize`). 직렬화가 없으면 두 액션이 같은 스냅샷을 읽는다:
// - 연속 입력(R3)에서 `addTodo` 두 건이 겹치면 둘 다 그룹 최대 `order` 를 같은 값으로 읽어 **중복 발급**된다(R5 위반).
// - 낙관적 토글이 저장을 기다리는 동안 성공한 편집을, 뒤늦은 토글 롤백이 덮어 UI/DB 가 갈린다.
// 그래서 `commit` 의 `build` 와 롤백은 **차례가 왔을 때** 상태를 읽는다. 낙관적 액션의 화면 반영만
// 큐 밖에서 즉시 일어난다(R6 "50ms 안 반영").
//
// 적재(`loadDate`)는 읽기라 큐에 넣지 않는다 — 자체 요청 번호로 늦게 온 응답을 버린다.
import type { DatasetWrite } from '@/domain/dataset';
import type { MetaDeps, Persistable } from '@/domain/meta';
import type { Todo } from '@/domain/todo/todo';

import { getRepositories } from '@/repositories/container';

import {
  messageOf,
  withTodos,
  type TodoMap,
  type TodoState,
} from '@/features/todo/store/todo-state';

/** 액션이 스토어를 읽고 쓰는 통로. zustand 의 `set`·`get` 을 그대로 받는다. */
export type TodoContext = {
  readonly set: (partial: Partial<TodoState>) => void;
  readonly get: () => TodoState;
  readonly deps: MetaDeps;
};

/**
 * 저장소에 반영된 쓰기 하나를 알린다 (T-56). **성공 경로에서만** 부른다 — 롤백된 쓰기가 이 값을
 * 올리면 그것을 구독해 다시 조회하는 화면이 되돌려진 값을 한 번 더 읽어 낡은 화면이 된다.
 */
function bumpWriteRevision(ctx: TodoContext): number {
  return ctx.get().writeRevision + 1;
}

/** 한 건 저장. 낙관적 토글처럼 대상이 하나인 쓰기가 쓴다. */
export function upsertOne(entities: readonly Persistable<Todo>[]): Promise<void> {
  return getRepositories().todos.upsert(entities[0]);
}

/** 여러 건을 한 트랜잭션으로 (R11 "한 번에 저장"). */
export async function saveAll(entities: readonly Persistable<Todo>[]): Promise<void> {
  const writes: DatasetWrite[] = entities.map((entity) => ({ table: 'todos', entity }));
  await getRepositories().dataset.write(writes);
}

/**
 * 저장할 엔티티를 만든다. **차례가 왔을 때** 실행되므로 `get()` 으로 최신 상태를 읽어도 안전하다.
 * `null` 은 "대상이 없다" — 쓰지 않고 `false` 이며 `error` 는 건드리지 않는다(없는 id 는 실패가 아니다).
 */
export type TodoBuild = () => Promise<Persistable<Todo> | null> | Persistable<Todo> | null;

/** 액션이 쓰는 두 가지 저장 경로. */
export type TodoWriter = {
  /** 저장이 성공한 뒤에만 상태를 바꾼다 (낙관적이지 않은 액션의 공통 경로). */
  commit: (build: TodoBuild, apply: (byId: TodoMap, saved: Todo) => TodoMap) => Promise<boolean>;
  /** 화면에 먼저 반영하고 저장한다. 실패하면 `previous` 로 되돌린다 (R6·R11). */
  optimistic: (
    previous: readonly Todo[],
    build: () => readonly Persistable<Todo>[],
    save: (entities: readonly Persistable<Todo>[]) => Promise<void>,
  ) => Promise<boolean>;
};

/** 앞의 쓰기가 끝난 뒤에 `task` 를 시작한다. 앞이 실패해도 큐는 이어진다. */
type Serialize = <T>(task: () => Promise<T>) => Promise<T>;

/** 쓰기 한 줄 큐 하나. 스토어마다 따로 만들어 테스트의 격리 인스턴스끼리 큐를 공유하지 않는다. */
function createWriteQueue(): Serialize {
  let queue: Promise<unknown> = Promise.resolve();
  return (task) => {
    const run = queue.then(task, task);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

/** 스토어 하나마다 쓰기 배선 하나. */
export function createTodoWriter(ctx: TodoContext): TodoWriter {
  const serialize = createWriteQueue();

  return {
    commit: (build, apply) =>
      serialize(async () => {
        try {
          const entity = await build();
          if (entity === null) {
            return false;
          }
          await getRepositories().todos.upsert(entity);
          ctx.set({
            byId: apply(ctx.get().byId, entity),
            error: null,
            writeRevision: bumpWriteRevision(ctx),
          });
          return true;
        } catch (error) {
          ctx.set({ error: messageOf(error) });
          return false;
        }
      }),

    optimistic: (previous, build, save) => {
      let next: readonly Persistable<Todo>[];
      try {
        next = build();
      } catch (error) {
        // 도메인 검증(완료 항목 재정렬 등)은 화면을 건드리기 전에 걸린다 — 문구만 남긴다.
        ctx.set({ error: messageOf(error) });
        return Promise.resolve(false);
      }
      if (next.length === 0) {
        return Promise.resolve(true);
      }
      ctx.set({ byId: withTodos(ctx.get().byId, next), error: null });
      return serialize(async () => {
        try {
          await save(next);
          // 화면은 이미 위에서 바뀌었지만 **저장소가 바뀐 것은 지금**이다 — 남이 다시 조회해도 될 시점.
          ctx.set({ writeRevision: bumpWriteRevision(ctx) });
          return true;
        } catch (error) {
          ctx.set({ byId: withTodos(ctx.get().byId, previous), error: messageOf(error) });
          return false;
        }
      });
    },
  };
}
