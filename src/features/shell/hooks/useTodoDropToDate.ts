// 날짜 셀에 투두를 떨어뜨렸을 때 (date-strip R13 + todo R10).
//
// 스트립은 "이 id 를 이 날짜로" 만 알리고 끝난다(`onDropTodo`). 옮기는 것도 되돌리기 토스트도
// 두 feature 중 어느 쪽 일이 아니라 **둘을 이어 붙인 셸**의 일이다.
import type { DateKey } from '@/domain/date/date-key';
import type { TodoId } from '@/domain/ids';

import { useShellToastStore } from '@/features/shell/store/shell-toast-store';
import { TODO_MESSAGES, useTodoActions } from '@/features/todo';

import { fromDateKey } from '@/lib/date';

/** 토스트 문구의 날짜 표기 — `TodoList` 의 같은 자리와 같은 모양이다. */
function dayLabel(date: DateKey): string {
  const at = fromDateKey(date);
  return `${at.getMonth() + 1}월 ${at.getDate()}일`;
}

export function useTodoDropToDate(from: DateKey): (todoId: string, to: DateKey) => void {
  const { moveToDate } = useTodoActions();
  const pushToast = useShellToastStore((state) => state.pushToast);

  return (todoId, to) => {
    void moveToDate(todoId as TodoId, to).then((moved) => {
      if (!moved) return;
      pushToast({
        message: TODO_MESSAGES.movedToDate(dayLabel(to)),
        action: {
          label: TODO_MESSAGES.undo,
          onAction: () => void moveToDate(todoId as TodoId, from),
        },
      });
    });
  };
}
