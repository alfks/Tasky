// 공개 API 배럴 — src/ 에서 index.ts 가 허용되는 유일한 위치(code-style.md §2).
// 명시 export 만 둔다. 셸(T-20)이 붙이는 화면은 `TodoList` 하나다.
//
// **투두를 따로 조회해 캐시해 둔 화면은 `writeRevision` 을 구독한다** (T-56):
// `const revision = useTodoStore((state) => state.writeRevision)` 를 조회 `useEffect` 의 의존성에
// 더하면 된다. 저장소에 반영된 쓰기마다 +1 이고, 롤백된 쓰기와 `loadDate` 재조회로는 변하지 않는다.
// 지금 소비자는 셸(`ShellHeader`) 하나이며, 셸이 이 값과 백업의 `dataRevision` 을 합쳐
// `DateStrip` 의 `summaryRevision` 으로 넘긴다 — `date-strip` 은 feature 그래프의 **리프**라
// `@/features/todo` 를 스스로 import 할 수 없다(`import/no-cycle`).
export type { TodoActions } from '@/features/todo/store/todo-actions';
export { createTodoStore, useTodoStore } from '@/features/todo/store/todo-store';
export type { TodoStore } from '@/features/todo/store/todo-store';
export type {
  TodoLoadStatus,
  TodoMap,
  TodoSnapshot,
  TodoState,
} from '@/features/todo/store/todo-state';

export {
  selectCompletion,
  selectGroup,
  selectGroups,
  selectTodoById,
  selectTodos,
} from '@/features/todo/store/todo-selectors';
export type { TodoGroup } from '@/features/todo/store/todo-selectors';

export { useTodoActions } from '@/features/todo/hooks/useTodoActions';
export { useTodoDate } from '@/features/todo/hooks/useTodoDate';
export type { TodoDateState } from '@/features/todo/hooks/useTodoDate';
export { useTodoGroup, useTodoGroups } from '@/features/todo/hooks/useTodoGroups';

// 화면 (T-15). `TodoList` 는 선택 날짜를 스스로 메모리에 올리므로 **한 번만** 마운트한다(R17).
export { TodoList } from '@/features/todo/components/TodoList';
export { TodoGroupSection } from '@/features/todo/components/TodoGroupSection';
// 루틴 관리 화면(T-83, routine.md §2). 셸이 사이드바 진입점으로 붙인다 — `categories` 는
// `category` feature 를 직접 import 하지 않도록(순환 방지) props 로 받는다.
export { RoutineManager } from '@/features/todo/components/RoutineManager';
export { COMPLETION_WAIT_MS } from '@/features/todo/components/todo-motion';
export { TODO_MESSAGES } from '@/features/todo/messages';
