'use client';

// 실행·일시정지 화면 (timer §2·R6·R7). 링 120px + 남은 시간 + 일시정지/재개·중지.
//
// 접근성(§5): 링을 감싼 요소가 `role="timer" aria-live="off"` 다 — **매초 낭독을 막는 것이 목적**이고,
// 남은 시간은 패널의 `aria-live="polite"` 영역이 정해진 순간에만 읽는다(`timer-announce.ts`).
// 버튼은 아이콘만 두지 않고 텍스트 라벨을 함께 둔다.
//
// 접근 이름은 **`role="timer"` 래퍼**가 갖는다. 링(`ProgressRing`)은 같은 문구를 다시 읽히지 않도록
// `aria-hidden` 한 겹 안에 둔다 — 이름 없는 `timer` 노드는 스크린리더에서 "타이머" 로만 읽힌다.

import type { Ref } from 'react';

import {
  formatSpokenDuration,
  selectClockText,
  selectRemainingSeconds,
  selectRingRatio,
} from '@/features/timer/store/timer-selectors';
import { useTimerStore } from '@/features/timer/store/timer-store';

import { Button } from '@/components/ui/Button';
import { ProgressRing } from '@/components/ui/ProgressRing';

/** §2 의 링 지름·굵기 (completion-rate R7 의 패널 링과 같은 값). */
const RING_SIZE = 120;
const RING_THICKNESS = 10;

type TimerRunningProps = {
  /** 시작 직후 포커스가 옮겨 갈 자리 (§5 완료 조건 3). 패널이 준다. */
  pauseRef?: Ref<HTMLButtonElement>;
};

export function TimerRunning({ pauseRef }: TimerRunningProps) {
  const session = useTimerStore((state) => state.session);
  const now = useTimerStore((state) => state.now);
  const todoTitle = useTimerStore((state) => state.todoTitle);
  const pause = useTimerStore((state) => state.pause);
  const resume = useTimerStore((state) => state.resume);
  const stop = useTimerStore((state) => state.stop);

  if (session === null) {
    return null;
  }

  const snapshot = { session, now, todoTitle };
  const paused = session.status === 'paused';
  const remaining = selectRemainingSeconds(snapshot);

  return (
    <div className="flex flex-col items-center gap-[var(--space-4)]">
      <div
        role="timer"
        aria-live="off"
        aria-label={`집중 타이머, ${formatSpokenDuration(remaining)} 남음`}
        className="relative grid place-items-center"
      >
        <div aria-hidden="true" className="grid place-items-center">
          <ProgressRing
            value={selectRingRatio(snapshot)}
            size={RING_SIZE}
            thickness={RING_THICKNESS}
            label={`집중 타이머, ${formatSpokenDuration(remaining)} 남음`}
          />
        </div>
        <span aria-hidden="true" className="absolute text-2xl font-bold text-text tabular-nums">
          {selectClockText(snapshot)}
        </span>
      </div>

      <p className="max-w-full truncate text-base text-text">
        {todoTitle === null ? '할 일 없이 집중' : `📝 ${todoTitle}`}
      </p>

      <div className="flex items-center gap-[var(--space-2)]">
        <Button
          ref={pauseRef}
          variant="outline"
          size="sm"
          onClick={() => void (paused ? resume() : pause())}
        >
          <span aria-hidden="true">{paused ? '▶' : '⏸'}</span>
          {paused ? '재개' : '일시정지'}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void stop()}>
          <span aria-hidden="true">■</span>
          중지
        </Button>
      </div>

      {paused && <p className="text-sm text-muted">일시정지 중이에요.</p>}
    </div>
  );
}
