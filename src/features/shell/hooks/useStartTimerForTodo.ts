'use client';

// 투두 항목 메뉴 "타이머 시작" 이 부르는 다리(timer.md §2, 사용자 결정). `todo` 는 `timer` 를
// import 할 수 없다 — `timer` 가 이미 `Todo.focusSeconds` 갱신(`timer-writes.ts`) 때문에 `todo` 를
// 참조해서, 반대 방향을 열면 순환(`import/no-cycle`)이 된다. 셸은 이미 둘 다 보고 있으므로
// (`ShellHeader.tsx` 가 `@/features/timer`·`@/features/todo` 를 함께 import 하는 것과 같은 자리)
// 여기서 한 번만 잇는다.
import type { Todo } from '@/domain/todo/todo';

import { useTimerStore } from '@/features/timer';

/**
 * 마지막으로 쓴 길이(분)로 이 투두의 집중 세션을 바로 시작한다 — 커맨드 팔레트 "타이머 시작"
 * (`useTimerCommands.ts`)과 같은 방식이다: 별도 길이 선택 화면을 열지 않는다. 이미 다른 세션이
 * 돌고 있으면 `start()` 자체가 거부하고 그 세션을 보여 준다(timer R5) — 여기서 다시 막지 않는다.
 */
export function useStartTimerForTodo(): (todo: Todo) => void {
  const start = useTimerStore((state) => state.start);
  return (todo: Todo) => {
    void start({ todoId: todo.id });
  };
}
