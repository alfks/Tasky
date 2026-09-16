'use client';

// 정리 카드 — R6 의 "일시정지한 집중이 24시간이 지나 정리됐어요".
//
// 사용자가 요청하지 않은 상태 변화이고 `focusSeconds` 가 늘어난 이유이므로 말없이 넘기지 않는다.
// 다만 주의 전환 신호는 아니다: `role="status"` 이고 소리도 탭 제목도 포커스 이동도 없다.

import { formatRecordedDuration } from '@/features/timer/store/timer-selectors';
import { useTimerStore } from '@/features/timer/store/timer-store';

import { Button } from '@/components/ui/Button';

export function TimerNoticeCard() {
  const notice = useTimerStore((state) => state.notice);
  const dismiss = useTimerStore((state) => state.dismissNotice);

  if (notice === null) {
    return null;
  }

  const subject = notice.todoTitle === null ? '' : `${notice.todoTitle}에 `;

  return (
    <section
      role="status"
      className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-lg)] border border-border bg-surface-2 p-[var(--space-3)]"
    >
      <p className="text-sm text-text">
        일시정지한 집중이 24시간이 지나 정리됐어요 · {subject}
        {formatRecordedDuration(notice.recordedSeconds)}을 기록했어요
      </p>
      <div>
        <Button variant="ghost" size="sm" onClick={dismiss}>
          닫기
        </Button>
      </div>
    </section>
  );
}
