// 공개 API 배럴 — src/ 에서 index.ts 가 허용되는 유일한 위치(code-style.md §2).
// 명시 export 만 둔다. 셸(T-20)이 붙이는 화면은 `TodoList` 하나다.
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
export { COMPLETION_WAIT_MS } from '@/features/todo/components/todo-motion';
export { TODO_MESSAGES } from '@/features/todo/messages';
