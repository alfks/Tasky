'use client';

// 대기 화면의 뽀모도로 선택 (timer P1·P5). `TimerSetup` 안에 있지만 따로 떼어 둔 이유는
// 컴포넌트 200줄 한계(code-style)와, 이 블록이 "길이 고르기" 와 다른 얘기를 하기 때문이다.
//
// **길이 입력을 늘리지 않는다 (P1)**: 뽀모도로를 켜도 사용자가 고르는 값은 여전히 집중 길이 하나이고,
// 휴식 길이는 거기서 파생된다(`pomodoro.ts`). 그래서 대기 화면의 언어가 "시간을 정해 주세요" 그대로다.
// 대신 파생된 값이 **보이지 않으면** 안 되므로 아래 한 줄이 실제 분 수를 말한다.
import { useId } from 'react';

import {
  POMODORO_LONG_BREAK_EVERY,
  pomodoroCountOn,
  pomodoroLongBreakMinutes,
  pomodoroShortBreakMinutes,
} from '@/features/timer/store/pomodoro';
import { useTimerStore } from '@/features/timer/store/timer-store';

import { Checkbox } from '@/components/ui/Checkbox';

import { todayKey } from '@/lib/date';

export function PomodoroOption() {
  const labelId = useId();
  const pomodoro = useTimerStore((state) => state.pomodoro);
  const minutes = useTimerStore((state) => state.minutes);
  const cycle = useTimerStore((state) => state.cycle);
  const setPomodoro = useTimerStore((state) => state.setPomodoro);

  const done = pomodoroCountOn(cycle, todayKey());

  return (
    <div className="flex flex-col gap-[var(--space-1)]">
      {/* 보이는 문구가 그대로 이름이라 `labelledBy` 로 잇는다(Checkbox 주석). */}
      <label className="inline-flex w-fit items-center gap-[var(--space-1)] text-sm text-muted">
        <Checkbox
          checked={pomodoro}
          onCheckedChange={(checked) => setPomodoro(checked)}
          labelledBy={labelId}
        />
        <span id={labelId}>뽀모도로로 집중하기</span>
      </label>
      {pomodoro && (
        <p className="text-sm text-muted">
          집중이 끝나면 {pomodoroShortBreakMinutes(minutes)}분 휴식 ·{' '}
          {POMODORO_LONG_BREAK_EVERY}번째마다 {pomodoroLongBreakMinutes(minutes)}분 휴식
          {done > 0 && ` · 오늘 ${done}번 마쳤어요`}
        </p>
      )}
    </div>
  );
}
