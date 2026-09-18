// 낭독 정책 (timer §5). "언제 읽는가" 보다 **언제 읽지 않는가** 가 더 중요한 규칙이다.
import { describe, expect, it } from 'vitest';

import {
  ANNOUNCE_STEP_SECONDS,
  timerAnnouncement,
  type TimerAnnounceSnapshot,
} from '@/features/timer/store/timer-announce';

/** 휴식과 무관한 시점(P2 가 붙기 전과 같은 상태). 뽀모도로 자체의 낭독은 아래 전용 블록이 잰다. */
const noBreak = { breakKind: null, breakRemainingSeconds: 0, breakDone: false } as const;

const idle: TimerAnnounceSnapshot = {
  phase: 'idle',
  remainingSeconds: 0,
  sessionId: null,
  completed: false,
  ...noBreak,
};
const running = (remainingSeconds: number, sessionId = 's1'): TimerAnnounceSnapshot => ({
  phase: 'running',
  remainingSeconds,
  sessionId,
  completed: false,
  ...noBreak,
});

describe('눈금 상수', () => {
  it('5분이다', () => {
    expect(ANNOUNCE_STEP_SECONDS).toBe(300);
  });
});

describe('상태가 바뀌는 순간만 읽는다', () => {
  it('시작·일시정지·재개·중지', () => {
    expect(timerAnnouncement(idle, running(1500))).toBe('집중 25분 시작');
    expect(
      timerAnnouncement(running(1122), {
        phase: 'paused',
        remainingSeconds: 1122,
        sessionId: 's1',
        completed: false,
        ...noBreak,
      }),
    ).toBe('일시정지, 18분 42초 남음');
    expect(
      timerAnnouncement(
        { phase: 'paused', remainingSeconds: 1122, sessionId: 's1', completed: false, ...noBreak },
        running(1122),
      ),
    ).toBe('재개, 18분 42초 남음');
    expect(timerAnnouncement(running(600), idle)).toBe('집중을 중지했어요');
  });

  it('완료는 앱을 막 연 경우(대기 → 대기)에도 읽는다 — 카드가 뜬 이유를 설명한다', () => {
    expect(timerAnnouncement(running(1), { ...idle, completed: true })).toBe('집중이 끝났어요');
    expect(timerAnnouncement(idle, { ...idle, completed: true })).toBe('집중이 끝났어요');
  });
});

describe('매초 읽지 않는다 — 5분 눈금만', () => {
  it('눈금을 넘지 않는 1초 경과는 아무것도 읽지 않는다', () => {
    expect(timerAnnouncement(running(1123), running(1122))).toBeNull();
    expect(timerAnnouncement(running(901), running(901))).toBeNull();
  });

  it('눈금을 넘는 순간 그 눈금을 읽는다', () => {
    expect(timerAnnouncement(running(901), running(900))).toBe('15분 남음');
    expect(timerAnnouncement(running(601), running(600))).toBe('10분 남음');
    expect(timerAnnouncement(running(301), running(300))).toBe('5분 남음');
    // 눈금 직후 1초는 다시 읽지 않는다.
    expect(timerAnnouncement(running(900), running(899))).toBeNull();
  });

  it('백그라운드로 여러 눈금을 건너뛰어도 한 번만, 마지막 눈금으로 읽는다', () => {
    expect(timerAnnouncement(running(1400), running(300))).toBe('5분 남음');
  });

  it('0초는 눈금이 아니라 완료다 — "0분 남음" 을 읽지 않는다', () => {
    expect(timerAnnouncement(running(1), running(0))).toBeNull();
  });

  it('25분 세션에서 눈금 낭독은 4번뿐이다', () => {
    let previous = running(1500);
    const spoken: string[] = [];
    for (let remainingSeconds = 1499; remainingSeconds >= 0; remainingSeconds -= 1) {
      const next = running(remainingSeconds);
      const message = timerAnnouncement(previous, next);
      if (message !== null) {
        spoken.push(message);
      }
      previous = next;
    }
    expect(spoken).toEqual(['20분 남음', '15분 남음', '10분 남음', '5분 남음']);
  });
});

describe('새 세션', () => {
  it('[5분 더] 는 다른 세션이라 다시 "시작" 을 읽는다', () => {
    expect(timerAnnouncement(running(0, 's1'), running(300, 's2'))).toBe('집중 5분 시작');
  });
});
