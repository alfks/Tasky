'use client';

// 인사이트 패널 맨 위 슬롯 (timer §2). 앱 셸이 이 컴포넌트를 슬롯에 넣기만 하면 된다.
//
// 낭독 영역(§5): 링은 `aria-live="off"` 이고, 여기 하나뿐인 `aria-live="polite"` 영역이
// 시작·일시정지·재개·완료·중지와 5분 눈금만 읽는다. 정책은 `timer-announce.ts`.
import { useId } from 'react';

import { TimerCompletionCard } from '@/features/timer/components/TimerCompletionCard';
import { TimerNoticeCard } from '@/features/timer/components/TimerNoticeCard';
import { TimerRunning } from '@/features/timer/components/TimerRunning';
import { TimerSetup } from '@/features/timer/components/TimerSetup';
import { useTimerAnnouncement } from '@/features/timer/hooks/useTimerAnnouncement';
import { useTimerRuntime } from '@/features/timer/hooks/useTimerRuntime';
import { useTimerSignals } from '@/features/timer/hooks/useTimerSignals';
import { useTimerStore } from '@/features/timer/store/timer-store';

import { cn } from '@/lib/cn';

type TimerPanelSectionProps = { className?: string };

export function TimerPanelSection({ className }: TimerPanelSectionProps) {
  // 헤더 칩과 같은 런타임을 공유한다(참조 수 기반) — 둘 다 마운트해도 인터벌은 하나다.
  useTimerRuntime();
  useTimerSignals();

  const headingId = useId();
  const session = useTimerStore((state) => state.session);
  const error = useTimerStore((state) => state.error);
  const clearError = useTimerStore((state) => state.clearError);
  const announcement = useTimerAnnouncement();

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'flex flex-col gap-[var(--space-4)] rounded-[var(--radius-xl)] border border-border',
        'bg-surface p-[var(--space-4)]',
        className,
      )}
    >
      <h2 id={headingId} className="text-md font-semibold text-text">
        집중
      </h2>

      <TimerNoticeCard />
      <TimerCompletionCard />
      {session === null ? <TimerSetup /> : <TimerRunning />}

      {error !== null && (
        <p role="alert" className="flex items-center gap-[var(--space-2)] text-sm text-text">
          {error}
          <button
            type="button"
            onClick={clearError}
            className="underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            닫기
          </button>
        </p>
      )}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
