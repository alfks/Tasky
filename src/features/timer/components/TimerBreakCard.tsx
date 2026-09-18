'use client';

// 끝난 휴식 카드 (timer P3·P4). 완료 카드(`TimerCompletionCard`)와 같은 자리·같은 모양이고,
// 하는 말만 다르다 — "다음 집중은 당신이 시작한다".
//
// **왜 자동으로 다음 집중을 시작하지 않는가 (P3)**: 집중 세션은 저장소 레코드를 만들고 끝나면
// `Todo.focusSeconds` 에 더해진다(R8). 자리를 비운 사이 혼자 시작된 집중은 **하지 않은 일을 기록**한다.
// 휴식은 아무것도 기록하지 않아 자동으로 시작해도 잃을 것이 없지만, 이쪽은 다르다.
//
// 이 카드는 **막 끝난 휴식에만** 만들어지므로(`pomodoro.ts` 의 `pomodoroBreakSignal`) 언제나
// `role="alertdialog"` 다. 초기 포커스는 `[나중에]` 에 둔다 — 카드가 뜨자마자 `Enter` 를 눌러
// 의도치 않게 새 집중이 시작되는 일이 없게, 파괴적이지 않은 쪽을 기본으로 둔다.
import { useEffect, useId, useRef } from 'react';

import { pomodoroBreakLabel } from '@/features/timer/store/pomodoro';
import { useTimerStore } from '@/features/timer/store/timer-store';

import { Button } from '@/components/ui/Button';

export function TimerBreakCard() {
  const breakDone = useTimerStore((state) => state.breakDone);
  const dismiss = useTimerStore((state) => state.dismissBreakDone);
  const start = useTimerStore((state) => state.start);
  const laterRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    if (breakDone === null) {
      return undefined;
    }
    laterRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        dismiss();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [breakDone, dismiss]);

  if (breakDone === null) {
    return null;
  }

  return (
    <section
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-xl)] border border-border bg-surface-2 p-[var(--space-4)] shadow-[var(--shadow-sm)]"
    >
      <h3 id={titleId} className="text-md font-semibold text-text">
        {pomodoroBreakLabel(breakDone.kind)} 끝!
      </h3>
      <p id={bodyId} className="text-sm text-text">
        다음 집중을 시작할까요?
      </p>
      <div className="flex flex-wrap gap-[var(--space-2)]">
        <Button
          size="sm"
          onClick={() => {
            dismiss();
            void start();
          }}
        >
          집중 시작
        </Button>
        <Button ref={laterRef} variant="ghost" size="sm" onClick={dismiss}>
          나중에
        </Button>
      </div>
    </section>
  );
}
