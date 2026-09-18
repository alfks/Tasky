'use client';

// 헤더 칩 (timer R11·P2, app-shell R15). 실행·일시정지·**휴식** 중에 보이고, 누르면 패널을 연다.
// 대기 중에는 아무것도 렌더하지 않는다 — 훅은 그 전에 전부 호출되므로 런타임은 계속 돈다.
//
// 휴식도 보여 주는 이유: 패널이 접혀 있으면 칩이 타이머가 도는 것을 아는 유일한 통로다(R11).
// 휴식만 빼면 "집중이 끝났는데 아무것도 안 돌고 있다" 로 읽힌다.
import { useTimerCommands } from '@/features/timer/hooks/useTimerCommands';
import { useTimerRuntime } from '@/features/timer/hooks/useTimerRuntime';
import { useTimerSignals } from '@/features/timer/hooks/useTimerSignals';
import {
  selectBreakChipLabel,
  selectBreakClockText,
  selectChipLabel,
  selectClockText,
} from '@/features/timer/store/timer-selectors';
import { useTimerStore } from '@/features/timer/store/timer-store';

import { cn } from '@/lib/cn';

type TimerChipProps = {
  /** 패널을 여는 동작(좁은 화면에서는 오버레이). 앱 셸이 준다. */
  onOpen: () => void;
  className?: string;
};

export function TimerChip({ onOpen, className }: TimerChipProps) {
  // 칩은 헤더에 항상 마운트되므로, 여기서 런타임과 신호를 걸면 패널이 접혀 있어도 타이머가 산다.
  useTimerRuntime();
  useTimerSignals();
  // 팔레트의 타이머 명령 넷 (shortcuts R7). 칩은 헤더에 늘 마운트돼 있어 여기가 유일하게
  // 안정적인 자리다 — 패널은 인사이트가 접히면 사라진다(훅 주석 참조).
  useTimerCommands();

  const session = useTimerStore((state) => state.session);
  const breakSession = useTimerStore((state) => state.breakSession);
  const now = useTimerStore((state) => state.now);
  const todoTitle = useTimerStore((state) => state.todoTitle);

  if (session === null && breakSession === null) {
    return null;
  }

  const snapshot = { session, breakSession, now, todoTitle };
  const paused = session?.status === 'paused';
  const resting = session === null;
  const label = resting ? selectBreakChipLabel(snapshot) : selectChipLabel(snapshot);
  const clock = resting ? selectBreakClockText(snapshot) : selectClockText(snapshot);
  const icon = resting ? '☕' : paused ? '⏸' : '⏱';

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className={cn(
        'inline-flex h-[var(--control-hit-min)] max-w-[14rem] items-center gap-[var(--space-2)]',
        'rounded-[var(--radius-full)] border border-border bg-surface px-[var(--space-3)]',
        'text-sm font-semibold text-text',
        'transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]',
        'hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        className,
      )}
    >
      <span aria-hidden="true">{icon}</span>
      <span aria-hidden="true" className="tabular-nums">
        {clock}
      </span>
      {!resting && todoTitle !== null && (
        <span aria-hidden="true" className="truncate text-muted">
          {todoTitle}
        </span>
      )}
    </button>
  );
}
