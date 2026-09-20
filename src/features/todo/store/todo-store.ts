// 투두 스토어 (todo.md R5~R7·R10~R12·R15·R17·R18). 선택 날짜 한 건의 투두만 메모리에 둔다(R17).
//
// 이 파일은 **조립만** 한다. 상태 모양과 순수 변환은 `todo-state.ts`, 액션은 `todo-actions.ts`,
// 저장·직렬화·롤백 배선은 `todo-writes.ts`, 화면용 파생 값은 `todo-selectors.ts` 다.
// 정렬·재매김·검증은 전부 `@/domain/todo/*` 의 순수 함수가 하고(복제 금지 — 복제하면 memory·indexeddb·
// 화면이 갈린다), 저장은 `@/repositories/container` 로 주입된 인터페이스로만 한다(Dexie 직접 호출 금지).
import { create } from 'zustand';

import type { MetaDeps } from '@/domain/meta';

import { createTodoActions, type TodoActions } from '@/features/todo/store/todo-actions';
import type { TodoState } from '@/features/todo/store/todo-state';

import { nowIso } from '@/lib/date';
import { newId } from '@/lib/id';

export type { TodoActions };

/** 상태 + 액션. 컴포넌트는 selector 로 필요한 조각만 구독한다. */
export type TodoStore = TodoState & TodoActions;

/** 아직 아무 날짜도 읽지 않은 상태. */
const initialState: TodoState = {
  byId: {},
  date: null,
  status: 'idle',
  error: null,
  writeRevision: 0,
  routines: {},
  routineStatus: 'idle',
};

/** 실제 시계·UUID. 테스트는 `createTodoStore(fixedDeps())` 로 결정적인 주입기를 쓴다. */
const defaultDeps: MetaDeps = { now: nowIso, id: newId };

/**
 * 스토어 팩토리. 앱은 아래 `useTodoStore` 하나만 쓰고(code-style §4: feature 당 스토어 1개),
 * 테스트가 결정적인 `deps` 로 격리된 인스턴스를 만들 수 있도록 팩토리를 열어 둔다.
 */
export function createTodoStore(deps: MetaDeps = defaultDeps) {
  return create<TodoStore>()((set, get) => ({
    ...initialState,
    ...createTodoActions({ set, get, deps }),
  }));
}

/** 앱이 쓰는 단 하나의 투두 스토어. 컴포넌트는 selector 로 필요한 조각만 구독한다. */
export const useTodoStore = createTodoStore();
