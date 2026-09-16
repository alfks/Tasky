'use client';

// 인사이트 패널 맨 위 슬롯 (timer §2). 앱 셸이 이 컴포넌트를 슬롯에 넣기만 하면 된다.
//
// 낭독 영역(§5): 링은 `aria-live="off"` 이고, 여기 하나뿐인 `aria-live="polite"` 영역이
// 시작·일시정지·재개·완료·중지와 5분 눈금만 읽는다. 정책은 `timer-announce.ts`.
//
// 포커스(§5 완료 조건 3): 시작·중지는 **누른 버튼 자체가 사라지는** 전이라 그대로 두면 포커스가
// `<body>` 로 떨어져 키보드 사용자가 자기 자리를 잃는다. 그래서 대기↔실행이 갈릴 때 포커스를
// 새 화면의 주 버튼(`[일시정지]` / `[집중 시작]`)으로 옮긴다. 옮기는 조건은 아래 `useFocusHandoff` 참조.
import { useEffect, useId, useRef } from 'react';

import { TimerCompletionCard } from '@/features/timer/components/TimerCompletionCard';
import { TimerNoticeCard } from '@/features/timer/components/TimerNoticeCard';
import { TimerRunning } from '@/features/timer/components/TimerRunning';
import { TimerSetup } from '@/features/timer/components/TimerSetup';
import { useTimerAnnouncement } from '@/features/timer/hooks/useTimerAnnouncement';
import { useTimerRuntime } from '@/features/timer/hooks/useTimerRuntime';
import { useTimerSignals } from '@/features/timer/hooks/useTimerSignals';
import { selectTimerPhase } from '@/features/timer/store/timer-selectors';
import { useTimerStore } from '@/features/timer/store/timer-store';

import { cn } from '@/lib/cn';

type TimerPanelSectionProps = { className?: string };

/** 패널 안에서 방금 사용자의 조작이 있었는지 + 대기↔실행 전이를 함께 본다. */
type FocusHandoff = {
  rootRef: React.RefObject<HTMLElement | null>;
  primaryRef: React.RefObject<HTMLButtonElement | null>;
  noteIntent: () => void;
};

/**
 * 화면이 갈릴 때 포커스를 새 주 버튼으로 넘긴다. **옮기는 조건 네 가지를 모두** 만족할 때만이다:
 *
 * 1. 대기↔실행이 실제로 갈렸다(같은 화면 안의 갱신에서는 움직이지 않는다).
 * 2. 방금 이 패널 안에서 사용자가 눌렀다 — 앱을 열자마자 세션이 복원되는 경로(R2)나 시간이 만든
 *    완료·만료에서는 포커스가 튀지 않는다(WCAG 3.2.1/3.2.2 의 예기치 않은 컨텍스트 변경).
 * 3. 포커스가 패널 안이거나 `<body>` 로 떨어진 상태다 — 사용자가 다른 곳을 보고 있으면 뺏지 않는다.
 * 4. 막 끝난 완료 카드가 떠 있지 않다 — 그때는 카드가 `[닫기]` 로 포커스를 가져간다(R9-a).
 */
function useFocusHandoff(freshCompletion: boolean): FocusHandoff {
  const phase = useTimerStore(selectTimerPhase);
  const rootRef = useRef<HTMLElement | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const previousRef = useRef<string | null>(null);
  const intentRef = useRef(false);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = phase;
    const intent = intentRef.current;
    intentRef.current = false;

    const idleChanged = previous !== null && (previous === 'idle') !== (phase === 'idle');
    if (!idleChanged || !intent || freshCompletion) {
      return;
    }
    const active = document.activeElement;
    const inside = active !== null && rootRef.current?.contains(active) === true;
    if (!inside && active !== document.body) {
      return;
    }
    primaryRef.current?.focus();
  }, [phase, freshCompletion]);

  return {
    rootRef,
    primaryRef,
    noteIntent: () => {
      intentRef.current = true;
    },
  };
}

export function TimerPanelSection({ className }: TimerPanelSectionProps) {
  // 헤더 칩과 같은 런타임·신호를 공유한다(참조 수 기반) — 둘 다 마운트해도 인터벌은 하나다.
  useTimerRuntime();
  useTimerSignals();

  const headingId = useId();
  const session = useTimerStore((state) => state.session);
  const error = useTimerStore((state) => state.error);
  const clearError = useTimerStore((state) => state.clearError);
  const freshCompletion = useTimerStore((state) => state.completion?.signal === 'full');
  const announcement = useTimerAnnouncement();
  const { rootRef, primaryRef, noteIntent } = useFocusHandoff(freshCompletion);

  return (
    <section
      ref={rootRef}
      aria-labelledby={headingId}
      onPointerDownCapture={noteIntent}
      onKeyDownCapture={noteIntent}
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
      {session === null ? (
        <TimerSetup startRef={primaryRef} />
      ) : (
        <TimerRunning pauseRef={primaryRef} />
      )}

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
