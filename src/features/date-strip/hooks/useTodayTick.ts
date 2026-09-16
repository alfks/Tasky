'use client';

// 자정을 넘기면 '오늘' 표시가 갱신된다 (date-strip.md R12). 선택 날짜는 건드리지 않는다.
import { useEffect } from 'react';

import { useDateStripStore } from '@/features/date-strip/store/date-strip-store';

/** 오늘 확인 주기. R12 가 정한 1분. */
export const TODAY_TICK_MS = 60_000;

/**
 * 1분마다 오늘을 다시 읽는다. 상태 동기화가 아니라 **외부 소스(시계) 구독**이라 effect 가 맞는 자리다.
 *
 * `visibilitychange` 를 함께 듣는 이유: 백그라운드 탭에서 브라우저가 타이머를 늘리거나 멈추므로
 * 탭으로 돌아온 순간이 실제로 가장 늦게 반영되는 지점이다. R12 의 "1분 간격"은 유지하고 확인 지점만 늘린다.
 */
export function useTodayTick(): void {
  const refreshToday = useDateStripStore((state) => state.refreshToday);

  useEffect(() => {
    const timer = window.setInterval(refreshToday, TODAY_TICK_MS);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshToday();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshToday]);
}
