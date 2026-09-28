// 문서 제목 (app-shell.md R9).
//
// **타이머와 한 자리를 나눠 쓴다.** `useTimerSignals`(timer R11)는 설치 시점의 `document.title` 을
// base 로 붙잡고, 타이머 스토어가 움직일 때마다 실행 중이면 `"18:42 · 장보기 · <base>"` 를, 그
// 밖에는 `base` 를 그대로 쓴다. R9 도 같은 것을 말한다 — **실행 중에는 timer R11 의 세 토막**이고
// 그 밖에는 날짜·완료 개수와 무관하게 `"Tasky"` 다.
//
// 그래서 두 가지를 지킨다.
//
// 1. `index.html`과 셸이 같은 base 인 `"Tasky"`를 쓴다. 날짜나 완료 개수가 바뀌어 효과가
//    다시 실행돼도 타이머가 붙이는 base 는 달라지지 않는다.
// 2. **타이머가 제목을 쥔 국면에서는 손대지 않는다.** 실행 중이거나 완료 신호가 떠 있으면(R9 c의
//    깜빡임) 셸의 쓰기를 건너뛴다. 이 가드가 없으면 실행 중 날짜를 옮기는 순간 남은 시간이 사라졌다.
//
// 그래서 첫 쓰기에도 예외를 두지 않는다. 세션 없이 열면 칩과 셸이 모두 `"Tasky"` 를 유지하고,
// 세션이 복원되면 칩이 R11 제목을 쓰고 셸은 비켜선다 — 어느 쪽도 깜빡이지 않는다.
import { useEffect } from 'react';

import type { DateKey } from '@/domain/date/date-key';

import { shellDocumentTitle } from '@/features/shell/lib/title';
import { useTimerStore, type TimerState } from '@/features/timer';

/** 지금 타이머가 제목을 쥐고 있는가 (timer R9 c · R11). */
function timerOwnsTitle(state: TimerState): boolean {
  return state.completion !== null || state.session?.status === 'running';
}

export function useShellDocumentTitle(
  date: DateKey,
  counts: { done: number; total: number },
): string {
  const title = shellDocumentTitle(date, counts);

  useEffect(() => {
    const apply = (state: TimerState): void => {
      if (timerOwnsTitle(state)) return;
      document.title = title;
    };
    apply(useTimerStore.getState());
    return useTimerStore.subscribe(apply);
  }, [title]);

  return title;
}
