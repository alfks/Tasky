// 문서 제목 (app-shell.md R9).
//
// **타이머와 한 자리를 나눠 쓴다.** `useTimerSignals`(timer R11)는 설치 시점의 `document.title` 을
// base 로 붙잡고, 타이머 스토어가 움직일 때마다 실행 중이면 `"18:42 · 장보기 · <base>"` 를, 그
// 밖에는 `base` 를 그대로 쓴다. R9 도 같은 것을 말한다 — **실행 중에는 timer R11 의 세 토막**이고
// 그 밖에만 `"9월 17일 (목) · 3/5 · Tasky"` 다.
//
// 그래서 두 가지를 지킨다.
//
// 1. **셸은 절대 먼저 쓰지 않는다.** 여기가 `useEffect`(패시브)인 것이 그 장치다. 커밋 한 번의
//    순서는 (레이아웃 효과 자식→부모) → (패시브 효과 자식→부모)이므로, 칩의 설치가 항상 셸의 쓰기
//    **앞**이고 칩이 붙잡는 base 는 `index.html` 의 `"Tasky"` 로 남는다. 한때 이 자리를
//    `useLayoutEffect` 로 올렸더니 base 가 날짜 제목이 되어 실행 중 제목이
//    `"24:59 · 아침 스트레칭 · 9월 16일 (수) · Tasky"` 네 토막이 됐다(리뷰 실측 — R11 위반).
// 2. **타이머가 제목을 쥔 국면에서는 손대지 않는다.** 실행 중이거나 완료 신호가 떠 있으면(R9 c의
//    깜빡임) 셸의 쓰기를 건너뛴다. 이 가드가 없으면 실행 중 날짜를 옮기는 순간 남은 시간이 사라졌다.
//
// 그래서 첫 쓰기에도 예외를 두지 않는다. 세션 없이 열면 칩이 `"Tasky"` 를 쓴 뒤 셸이 날짜 제목을
// 얹고, 세션이 복원되면 칩이 R11 제목을 쓰고 셸은 비켜선다 — 어느 쪽도 깜빡이지 않는다.
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
