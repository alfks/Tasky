'use client';

// 타이머의 **런타임 배선** (timer R3·R4): 앱 시작 적재, 1초 표시 갱신, 탭 재활성화 시 저장소 재동기화.
//
// 여러 컴포넌트(헤더 칩·패널)가 같이 마운트되므로 **참조 수를 세어 한 벌만** 설치한다 —
// 안 그러면 인터벌이 두 개 돌고 `hydrate()` 가 두 번 불린다. 첫 마운트가 설치하고 마지막 언마운트가 걷는다.
import { useEffect } from 'react';

import { useTimerStore } from '@/features/timer/store/timer-store';

/** 표시 갱신 주기 (timer §2 "1초 갱신"). 계산이 아니라 **그리기** 주기다. */
export const TIMER_TICK_MS = 1000;

type Runtime = { mounts: number; stop: (() => void) | null };

const runtime: Runtime = { mounts: 0, stop: null };

/** 테스트가 파일 사이로 새는 전역 상태를 끊을 때 쓴다. */
export function resetTimerRuntime(): void {
  runtime.stop?.();
  runtime.mounts = 0;
  runtime.stop = null;
}

function install(): () => void {
  void useTimerStore.getState().hydrate();

  const interval = globalThis.setInterval(() => {
    useTimerStore.getState().tick();
  }, TIMER_TICK_MS);

  // 탭이 다시 보이는 순간: 먼저 화면을 실제 시각으로 맞추고(즉시 반응), 그 다음 저장소와 맞춘다.
  // 백그라운드에서 인터벌이 몇 분에 한 번으로 줄어들어도 여기서 바로 따라잡는다.
  const onVisible = (): void => {
    if (document.visibilityState !== 'visible') {
      return;
    }
    useTimerStore.getState().tick();
    void useTimerStore.getState().refresh();
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    globalThis.clearInterval(interval);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/**
 * 타이머를 살아 있게 한다. 헤더 칩과 패널 어느 쪽이 마운트돼도 한 번만 설치되므로
 * 앱 셸은 둘 중 하나만 걸어도 되고 둘 다 걸어도 된다.
 */
export function useTimerRuntime(): void {
  useEffect(() => {
    runtime.mounts += 1;
    if (runtime.mounts === 1) {
      runtime.stop = install();
    }
    return () => {
      runtime.mounts -= 1;
      if (runtime.mounts === 0) {
        runtime.stop?.();
        runtime.stop = null;
      }
    };
  }, []);
}
