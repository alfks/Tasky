// 투두 쓰기 액션 묶음 훅. 액션은 스토어 생성 시 한 번 만들어지고 바뀌지 않는다.
import { useShallow } from 'zustand/react/shallow';

import { useTodoStore, type TodoActions, type TodoStore } from '@/features/todo/store/todo-store';

/** 매 렌더 새 객체를 만들지만 필드가 전부 같은 참조라 `useShallow` 가 리렌더를 막는다. */
const selectActions = (state: TodoStore): TodoActions => ({
  loadDate: state.loadDate,
  addTodo: state.addTodo,
  toggleDone: state.toggleDone,
  editTodo: state.editTodo,
  moveToDate: state.moveToDate,
  changeCategory: state.changeCategory,
  removeTodo: state.removeTodo,
  reorder: state.reorder,
  moveBy: state.moveBy,
  createRoutine: state.createRoutine,
  clearError: state.clearError,
});

/**
 * 액션 전부가 필요한 컴포넌트(항목 메뉴·편집 패널)를 위한 묶음.
 * 액션 하나만 쓰는 컴포넌트는 `useTodoStore((s) => s.toggleDone)` 처럼 그 조각만 구독하는 편이 싸다.
 */
export function useTodoActions(): TodoActions {
  return useTodoStore(useShallow(selectActions));
}
