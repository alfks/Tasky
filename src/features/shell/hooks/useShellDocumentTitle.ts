// 문서 제목 (app-shell.md R9).
//
// **타이머와 한 자리를 다툰다.** `useTimerSignals`(timer R11)는 설치 시점의 `document.title` 을 base 로
// 붙잡고 타이머 스토어가 움직일 때마다 제목을 다시 쓴다 — 실행 중이면 `"18:42 · 장보기 · <base>"`,
// 그 밖에는 `base` 그대로. 그래서 셸이 한 번만 쓰고 말면 타이머가 적재(`hydrate`)를 마치는 순간
// 제목이 `index.html` 의 `"Tasky"` 로 되돌아간다(실 Chromium 실측: 부팅 1.2초 뒤 `document.title`
// 이 `"Tasky"`).
//
// 그래서 셸도 같은 스토어를 구독해 **타이머가 제목을 원하지 않는 국면에서만** 자기 제목을 다시
// 세운다. 구독 순서가 이 배선을 성립시킨다: 칩(자식)의 설치가 먼저고 셸(부모)의 구독이 나중이라
// 같은 `set` 에서 셸이 마지막에 쓴다.
//
// 남는 한계: **세션이 실행 중인 동안**에는 타이머의 낡은 base 가 뒤에 붙는다(날짜를 옮겨도 제목의
// 날짜 부분이 따라오지 않는다). 타이머가 base 를 매번 다시 읽거나 셸에서 주입받아야 풀리는데
// 그 파일은 이 티켓의 `owns` 밖이다 — 핸드오프에 남긴다.
import { useEffect, useLayoutEffect } from 'react';

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

  // **`useLayoutEffect` 인 이유**: 커밋 한 번의 순서는 (레이아웃 효과 자식→부모) → (패시브 효과
  // 자식→부모) 다. 타이머 신호 설치는 칩의 패시브 효과라, 셸이 레이아웃 단계에서 제목을 먼저 쓰면
  // 칩이 **이미 갱신된 제목**을 base 로 붙잡는다. 패시브로 미루면 base 가 `index.html` 의 "Tasky" 로
  // 굳어 실행 중 제목이 `"25:00 · Tasky"` 가 된다(실측).
  useLayoutEffect(() => {
    document.title = title;
  }, [title]);

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
