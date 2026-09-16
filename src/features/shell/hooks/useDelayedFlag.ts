// "N ms 를 넘겨 계속 켜져 있을 때만 참" (app-shell.md §2-C 로딩: 100ms 미만이면 스켈레톤을 그리지 않는다).
//
// 짧은 조회에 스켈레톤을 번쩍이면 화면이 두 번 바뀐 것처럼 보인다 — 아무것도 안 그리는 편이 빠르게 느껴진다.
import { useEffect, useState } from 'react';

export function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [late, setLate] = useState(false);

  useEffect(() => {
    if (!active) {
      setLate(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setLate(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);

  return active && late;
}
