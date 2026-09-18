'use client';

// 휴식 화면 (timer P2·P3). 실행 화면(`TimerRunning`)과 **같은 골격**이다 — 링 120px + 남은 시간 +
// 버튼. 집중과 휴식이 다른 물건처럼 보이면 사용자는 지금 무엇이 도는지 다시 배워야 한다.
//
// 다른 점은 둘뿐이다: 문구가 휴식이라고 말하고, 버튼이 `[건너뛰고 집중]`·`[휴식 끝내기]` 다.
// **일시정지가 없다** — 휴식은 기록되지 않으므로 멈출 이유가 없고, 마음이 바뀌면 바로 집중을 시작하면 된다.
//
// 접근성(§5): `role="timer" aria-live="off"` 로 매초 낭독을 막고, 구간 전환은 패널의 하나뿐인
// `aria-live="polite"` 영역이 읽는다(`timer-announce.ts`).
import type { Ref } from 'react';

import { pomodoroBreakLabel } from '@/features/timer/store/pomodoro';
import {
  formatSpokenDuration,
  selectBreakClockText,
  selectBreakRemainingSeconds,
  selectBreakRingRatio,
} from '@/features/timer/store/timer-selectors';
import { useTimerStore } from '@/features/timer/store/timer-store';

import { Button } from '@/components/ui/Button';
import { ProgressRing } from '@/components/ui/ProgressRing';

/** `TimerRunning` 과 같은 링 치수. */
const RING_SIZE = 120;
const RING_THICKNESS = 10;

type TimerBreakProps = {
  /** 휴식이 끝나거나 건너뛸 때 포커스가 돌아올 자리 (§5). 패널이 준다. */
  skipRef?: Ref<HTMLButtonElement>;
};

export function TimerBreak({ skipRef }: TimerBreakProps) {
  const breakSession = useTimerStore((state) => state.breakSession);
  const now = useTimerStore((state) => state.now);
  const skipBreak = useTimerStore((state) => state.skipBreak);
  const start = useTimerStore((state) => state.start);

  if (breakSession === null) {
    return null;
  }

  const snapshot = { breakSession, now };
  const remaining = selectBreakRemainingSeconds(snapshot);
  const label = pomodoroBreakLabel(breakSession.kind);
  const spoken = `${label}, ${formatSpokenDuration(remaining)} 남음`;

  return (
    <div className="flex flex-col items-center gap-[var(--space-4)]">
      <div
        role="timer"
        aria-live="off"
        aria-label={spoken}
        className="relative grid place-items-center"
      >
        <div aria-hidden="true" className="grid place-items-center">
          <ProgressRing
            value={selectBreakRingRatio(snapshot)}
            size={RING_SIZE}
            thickness={RING_THICKNESS}
            label={spoken}
          />
        </div>
        <span aria-hidden="true" className="absolute text-2xl font-bold text-text tabular-nums">
          {selectBreakClockText(snapshot)}
        </span>
      </div>

      <p className="max-w-full truncate text-base text-text">☕ {label}</p>

      <div className="flex items-center gap-[var(--space-2)]">
        <Button variant="outline" size="sm" onClick={() => void start()}>
          건너뛰고 집중
        </Button>
        <Button ref={skipRef} variant="ghost" size="sm" onClick={skipBreak}>
          휴식 끝내기
        </Button>
      </div>
    </div>
  );
}
