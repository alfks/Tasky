// 날짜 셀에 투두를 떨어뜨렸을 때 (date-strip R13 + todo R10).
//
// 스트립은 "이 id 를 이 날짜로" 만 알리고 끝난다(`onDropTodo`). 옮기는 것도 되돌리기 토스트도
// 두 feature 중 어느 쪽 일이 아니라 **둘을 이어 붙인 셸**의 일이다.
import { useCallback } from 'react';

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

  return useCallback(
    (todoId, to) => {
      // `DateCell` 의 드롭 페이로드는 `DataTransfer` 에서 나온 **문자열**이라 브랜드가 없다.
      // 스토어가 없는 id 를 이미 안전하게 처리하므로(`moveToDate` 는 `false` 를 돌려준다) 여기서
      // 다시 검증하지 않고 좁힌다 — date-strip 이 넘기는 값은 같은 목록의 투두 id 다(R13).
      const id = todoId as TodoId;
      void moveToDate(id, to).then(
        (moved) => {
          if (!moved) return;
          pushToast({
            message: TODO_MESSAGES.movedToDate(dayLabel(to)),
            action: { label: TODO_MESSAGES.undo, onAction: () => void moveToDate(id, from) },
          });
        },
        // 저장 실패는 스토어가 `error` 로 알리고 목록이 토스트를 띄우지만, 던져진 예외까지
        // 여기서 삼키면 조용히 아무 일도 없는 상태가 된다(§2-C 개별 액션 실패).
        () => pushToast({ message: '옮기지 못했어요. 다시 시도해 주세요.', variant: 'error' }),
      );
    },
    [from, moveToDate, pushToast],
  );
}
