import { describe, expect, it } from 'vitest';

import { addSeconds } from '@/domain/date/instant';
import {
  cancelFocusSession,
  completeFocusSession,
  focusCompletionSignal,
  focusElapsedSeconds,
  focusRemainingSeconds,
  focusSessionSweep,
  isActiveFocusSession,
  pauseFocusSession,
  resumeFocusSession,
  startFocusSession,
  validateFocusMinutes,
} from '@/domain/focus/focus-session.rules';

import { FIXTURE_DATE, FIXTURE_INSTANT, fixedDeps } from '@/test/fixtures/deps';
import { makeFocusSession } from '@/test/fixtures/focus-session';

const START = FIXTURE_INSTANT;
const at = (seconds: number): string => addSeconds(START, seconds);
const deps = (now: string) => fixedDeps({ now });

describe('validateFocusMinutes (R1)', () => {
  it('1~180 정수만 허용하고 초로 바꾼다', () => {
    expect(validateFocusMinutes(25)).toBe(1500);
    expect(validateFocusMinutes(1)).toBe(60);
    expect(validateFocusMinutes(180)).toBe(10_800);
    for (const bad of [0, 181, 25.5, Number.NaN]) {
      expect(() => validateFocusMinutes(bad)).toThrow(
        expect.objectContaining({ code: 'FOCUS_MINUTES_INVALID' }),
      );
    }
  });
});

describe('startFocusSession (R2·R5)', () => {
  it('running 레코드를 만들고 시작 시각을 기록한다', () => {
    const session = startFocusSession(
      { date: FIXTURE_DATE, plannedSeconds: 1500, todoId: 't1', categoryId: 'c1' },
      deps(START),
    );
    expect(session).toMatchObject({
      status: 'running',
      startedAt: START,
      pausedTotalSeconds: 0,
      elapsedSeconds: 0,
      todoId: 't1',
      categoryId: 'c1',
      rev: 1,
    });
  });

  it('투두 없이도 시작할 수 있다', () => {
    const session = startFocusSession({ date: FIXTURE_DATE, plannedSeconds: 60 }, deps(START));
    expect('todoId' in session).toBe(false);
  });

  it('활성 세션이 있으면 거부한다 — 끝난 세션은 막지 않는다', () => {
    expect(() =>
      startFocusSession(
        { date: FIXTURE_DATE, plannedSeconds: 60, active: makeFocusSession({ status: 'paused' }) },
        deps(START),
      ),
    ).toThrow(expect.objectContaining({ code: 'FOCUS_SESSION_ACTIVE_EXISTS' }));
    expect(() =>
      startFocusSession(
        {
          date: FIXTURE_DATE,
          plannedSeconds: 60,
          active: makeFocusSession({ status: 'completed' }),
        },
        deps(START),
      ),
    ).not.toThrow();
  });
});

describe('focusElapsedSeconds (R3) — 틱이 아니라 시각으로 센다', () => {
  const session = makeFocusSession({ plannedSeconds: 1500 });

  it('경과는 now − startedAt 이고 계획 시간에서 멈춘다', () => {
    expect(focusElapsedSeconds(session, at(0))).toBe(0);
    expect(focusElapsedSeconds(session, at(600))).toBe(600);
    // 백그라운드로 30분이 지나도 25분을 넘지 않는다.
    expect(focusElapsedSeconds(session, at(1800))).toBe(1500);
    expect(focusRemainingSeconds(session, at(600))).toBe(900);
    expect(focusRemainingSeconds(session, at(1800))).toBe(0);
  });

  it('멈춰 있던 시간은 빠진다', () => {
    const paused = makeFocusSession({ pausedTotalSeconds: 120, pausedAt: at(600) });
    expect(focusElapsedSeconds(paused, at(900))).toBe(900 - 120 - 300);
  });

  it('시계가 뒤로 가도 음수가 되지 않는다', () => {
    expect(focusElapsedSeconds(session, addSeconds(START, -60))).toBe(0);
  });
});

describe('일시정지·재개 (R6)', () => {
  it('pause 는 pausedAt 을 남기고 resume 은 그 길이를 pausedTotal 에 더한다', () => {
    const running = makeFocusSession();
    const paused = pauseFocusSession(running, deps(at(300)));
    expect(paused).toMatchObject({ status: 'paused', pausedAt: at(300), elapsedSeconds: 300 });

    const resumed = resumeFocusSession(paused, deps(at(500)));
    expect(resumed).toMatchObject({ status: 'running', pausedTotalSeconds: 200 });
    expect('pausedAt' in resumed).toBe(false);
    expect(focusElapsedSeconds(resumed, at(800))).toBe(600);
  });

  it('상태가 맞지 않으면 거부한다', () => {
    expect(() => pauseFocusSession(makeFocusSession({ status: 'paused' }), deps(START))).toThrow(
      expect.objectContaining({ code: 'FOCUS_SESSION_NOT_RUNNING' }),
    );
    expect(() => resumeFocusSession(makeFocusSession(), deps(START))).toThrow(
      expect.objectContaining({ code: 'FOCUS_SESSION_NOT_PAUSED' }),
    );
  });
});

describe('완료·취소 (R4·R7)', () => {
  it('endedAt 은 현재 시각이 아니라 startedAt + planned + pausedTotal 이다', () => {
    const session = makeFocusSession({ plannedSeconds: 1500, pausedTotalSeconds: 120 });
    const completed = completeFocusSession(session, deps(at(9999)));
    expect(completed).toMatchObject({
      status: 'completed',
      endedAt: at(1620),
      elapsedSeconds: 1500,
    });
  });

  it('취소는 현재 시각과 그때까지의 경과를 남긴다', () => {
    const canceled = cancelFocusSession(makeFocusSession(), deps(at(45)));
    expect(canceled).toMatchObject({ status: 'canceled', endedAt: at(45), elapsedSeconds: 45 });
  });

  it('이미 끝난 세션은 다시 끝낼 수 없다', () => {
    const ended = makeFocusSession({ status: 'canceled' });
    expect(() => completeFocusSession(ended, deps(START))).toThrow(
      expect.objectContaining({ code: 'FOCUS_SESSION_ENDED' }),
    );
    expect(() => cancelFocusSession(ended, deps(START))).toThrow(
      expect.objectContaining({ code: 'FOCUS_SESSION_ENDED' }),
    );
  });
});

describe('focusSessionSweep (R4·R6)', () => {
  it('계획 시간을 채웠으면 complete', () => {
    expect(focusSessionSweep(makeFocusSession(), at(1500))).toBe('complete');
    expect(focusSessionSweep(makeFocusSession(), at(1499))).toBe('none');
  });

  it('일시정지로 24시간이 지나면 expire', () => {
    const paused = makeFocusSession({ status: 'paused', pausedAt: at(60) });
    expect(focusSessionSweep(paused, addSeconds(at(60), 86_400))).toBe('expire');
    expect(focusSessionSweep(paused, addSeconds(at(60), 86_399))).toBe('none');
  });

  it('끝난 세션은 건드리지 않는다', () => {
    expect(focusSessionSweep(makeFocusSession({ status: 'completed' }), at(99_999))).toBe('none');
  });

  it('isActiveFocusSession 은 running·paused 만 참이다 (R5)', () => {
    expect(isActiveFocusSession(makeFocusSession({ status: 'running' }))).toBe(true);
    expect(isActiveFocusSession(makeFocusSession({ status: 'paused' }))).toBe(true);
    expect(isActiveFocusSession(makeFocusSession({ status: 'completed' }))).toBe(false);
    expect(isActiveFocusSession(makeFocusSession({ status: 'canceled' }))).toBe(false);
  });
});

describe('focusCompletionSignal (R9·R9-a) — 2분 경계', () => {
  const completed = makeFocusSession({ status: 'completed', endedAt: at(1500) });

  it('2분 이내면 소리·탭 제목까지 전부 준다', () => {
    expect(focusCompletionSignal(completed, at(1500))).toBe('full');
    expect(focusCompletionSignal(completed, addSeconds(at(1500), 120))).toBe('full');
  });

  it('2분을 넘기면 기록 카드만 준다', () => {
    expect(focusCompletionSignal(completed, addSeconds(at(1500), 121))).toBe('record-only');
    expect(focusCompletionSignal(completed, addSeconds(at(1500), 3 * 86_400))).toBe('record-only');
  });

  it('endedAt 이 없으면 보수적으로 기록만', () => {
    expect(focusCompletionSignal(makeFocusSession(), at(0))).toBe('record-only');
  });
});
