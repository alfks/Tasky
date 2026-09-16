'use client';

// `aria-live="polite"` 영역에 넣을 문구 (timer §5). 정책은 `timer-announce.ts` 의 순수 함수이고
// 여기서는 "직전 시점"을 기억했다가 비교하는 일만 한다.
import { useEffect, useRef, useState } from 'react';

import {
  timerAnnouncement,
  type TimerAnnounceSnapshot,
} from '@/features/timer/store/timer-announce';
import { selectRemainingSeconds, selectTimerPhase } from '@/features/timer/store/timer-selectors';
import { useTimerStore } from '@/features/timer/store/timer-store';

/** 지금 읽어야 할 문구. 읽을 것이 없으면 직전 문구가 그대로 남는다(다시 읽히지는 않는다). */
export function useTimerAnnouncement(): string {
  const phase = useTimerStore(selectTimerPhase);
  const remainingSeconds = useTimerStore(selectRemainingSeconds);
  const sessionId = useTimerStore((state) => state.session?.id ?? null);
  const completed = useTimerStore((state) => state.completion !== null);

  const [message, setMessage] = useState('');
  const previousRef = useRef<TimerAnnounceSnapshot>({
    phase: 'idle',
    remainingSeconds: 0,
    sessionId: null,
    completed: false,
  });

  useEffect(() => {
    const next: TimerAnnounceSnapshot = { phase, remainingSeconds, sessionId, completed };
    const spoken = timerAnnouncement(previousRef.current, next);
    previousRef.current = next;
    if (spoken !== null) {
      setMessage(spoken);
    }
  }, [phase, remainingSeconds, sessionId, completed]);

  return message;
}
