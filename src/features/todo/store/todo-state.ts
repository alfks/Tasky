// 투두 스토어의 **상태 모양과 순수 변환** — React·zustand·레포지토리를 모르는 부분만 모았다.
// 액션(언제 저장하고 무엇을 되돌리는가)은 `todo-store.ts`, 화면용 파생 값은 `todo-selectors.ts`.
import type { DateKey } from '@/domain/date/date-key';
import { DomainError } from '@/domain/errors';
import type { TodoId } from '@/domain/ids';
import type { Todo } from '@/domain/todo/todo';

/** id → 투두. 쓰기가 없으면 참조가 그대로라 이 조각만 구독한 훅은 다시 계산하지 않는다. */
export type TodoMap = Readonly<Record<string, Todo>>;

/** 선택자가 보는 최소 상태. 스토어 전체를 구독하지 않도록 `byId` 하나만 요구한다. */
export type TodoSnapshot = { readonly byId: TodoMap };

/** 목록 적재 상태. `error` 는 적재 실패와 쓰기 실패가 함께 쓴다. */
export type TodoLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/** 스토어의 상태 부분. */
export type TodoState = TodoSnapshot & {
  /** 메모리에 올라온 날짜. 아직 아무것도 읽지 않았으면 `null` (todo R17). */
  date: DateKey | null;
  status: TodoLoadStatus;
  /** 사용자에게 그대로 보여줄 한국어 문구. 성공한 액션은 `null` 로 지운다. */
  error: string | null;
  /**
   * **저장소에 실제로 반영된 쓰기마다 +1** (T-56). 투두를 자기 쪽에서 따로 조회해 캐시해 둔 화면이
   * 이 값을 조회 `useEffect` 의 의존성에 넣어 다시 읽는다 — 지금 그러는 곳은 날짜 스트립의 주
   * 요약이고, 구독은 셸(`ShellHeader`)이 한다(`date-strip` 은 feature 그래프의 리프라 `todo` 를
   * import 할 수 없다 — 하면 `import/no-cycle` 이다).
   *
   * 올라가는 자리는 `todo-writes.ts` 의 `commit`·`optimistic` **성공 경로 둘뿐**이다. 그래서
   * 롤백된 쓰기는 올리지 않고(올리면 화면이 낡은 값으로 한 번 더 덮인다), 읽기인 `loadDate` 도
   * 이 경로를 타지 않아 자동으로 빠진다.
   */
  writeRevision: number;
};

/** 쓰기 실패 공통 문구 (todo §2-C). 원인이 아니라 다음 행동을 안내한다. */
export const SAVE_FAILED = '저장하지 못했어요. 다시 시도해 주세요';

/** 도메인 규칙 위반은 그 문구를 그대로, 그 밖의 실패는 공통 문구를 쓴다 (todo §2-C). */
export function messageOf(error: unknown): string {
  return error instanceof DomainError ? error.message : SAVE_FAILED;
}

/** 조회 결과를 상태 맵으로. */
export function indexTodos(todos: readonly Todo[]): TodoMap {
  return Object.fromEntries(todos.map((todo) => [todo.id, todo]));
}

/** 주어진 투두들을 덮어쓴 새 맵. 건드리지 않은 항목의 참조는 그대로다. */
export function withTodos(byId: TodoMap, todos: readonly Todo[]): TodoMap {
  const next: Record<string, Todo> = { ...byId };
  for (const todo of todos) {
    next[todo.id] = todo;
  }
  return next;
}

/** 한 건을 뺀 새 맵. 삭제·날짜 이동이 메모리에서 내릴 때 쓴다. */
export function withoutTodo(byId: TodoMap, id: TodoId): TodoMap {
  const { [id]: _removed, ...rest } = byId;
  return rest;
}
