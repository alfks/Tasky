// 공개 API 배럴 — src/ 에서 index.ts 가 허용되는 유일한 위치(code-style.md §2).
// 명시 export 만 둔다. 컴포넌트는 T-15 가 여기에 더한다(TECH_PLAN §3 공유 파일 표).
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
