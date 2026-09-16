// 표시 파생 값 (timer R3·R11, §5). 전부 순수 함수라 React 없이 단언한다.
import { describe, expect, it } from 'vitest';

import {
  formatClock,
  formatRecordedDuration,
  formatSpokenDuration,
  selectChipLabel,
  selectClockText,
  selectDocumentTitle,
  selectElapsedSeconds,
  selectRemainingSeconds,
  selectRingRatio,
  selectTimerPhase,
} from '@/features/timer/store/timer-selectors';
import { FIXTURE_INSTANT } from '@/test/fixtures/deps';
import { makeFocusSession } from '@/test/fixtures/focus-session';

const at = (seconds: number): string =>
  new Date(Date.parse(FIXTURE_INSTANT) + seconds * 1000).toISOString();

describe('formatClock', () => {
  it('1시간 미만은 M:SS', () => {
    expect(formatClock(1122)).toBe('18:42');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(59)).toBe('0:59');
    expect(formatClock(60)).toBe('1:00');
  });

  it('1시간 이상은 H:MM:SS (최대 길이 180분)', () => {
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(10_800)).toBe('3:00:00');
    expect(formatClock(3661)).toBe('1:01:01');
  });

  it('음수는 0 으로 자른다', () => {
    expect(formatClock(-5)).toBe('0:00');
  });
});

describe('formatSpokenDuration — 시계 표기를 시각으로 읽는 사고 방지', () => {
  it('분·초를 말로 푼다', () => {
    expect(formatSpokenDuration(1122)).toBe('18분 42초');
    expect(formatSpokenDuration(1500)).toBe('25분');
    expect(formatSpokenDuration(42)).toBe('42초');
    expect(formatSpokenDuration(0)).toBe('0분');
  });
});

describe('formatRecordedDuration — 1분 미만 세션도 기록된다 (R13)', () => {
  it('0 이라고 말하지 않는다', () => {
    expect(formatRecordedDuration(45)).toBe('1분 미만');
    expect(formatRecordedDuration(59)).toBe('1분 미만');
    expect(formatRecordedDuration(60)).toBe('1분');
    expect(formatRecordedDuration(1500)).toBe('25분');
  });
});

describe('세션 파생 값', () => {
  const session = makeFocusSession({ plannedSeconds: 1500 });

  it('대기 중에는 0 이고 링은 트랙만 그린다', () => {
    const idle = { session: null, now: at(0), todoTitle: null };
    expect(selectTimerPhase(idle)).toBe('idle');
    expect(selectRemainingSeconds(idle)).toBe(0);
    expect(selectRingRatio(idle)).toBeNull();
  });

  it('남은 시간·경과·비율이 시각에서 나온다', () => {
    const snapshot = { session, now: at(375) };
    expect(selectRemainingSeconds(snapshot)).toBe(1125);
    expect(selectElapsedSeconds(snapshot)).toBe(375);
    expect(selectRingRatio(snapshot)).toBe(0.75);
    expect(selectClockText(snapshot)).toBe('18:45');
  });

  it('백그라운드로 30분이 지나도 경과는 계획 시간에서 멈춘다 (R3)', () => {
    // 이 단언이 없으면 `focusElapsedSeconds` 의 상한을 지워도 화면 값이 그대로라(남은 시간은 따로 0 으로
    // 잘린다) 아무 테스트도 실패하지 않는다 — 그러면 초과 상태에서 중지한 세션이 계획보다 긴 시간을
    // 투두에 기록하게 된다(R8).
    expect(selectElapsedSeconds({ session, now: at(1800) })).toBe(1500);
    expect(selectRemainingSeconds({ session, now: at(1800) })).toBe(0);
    expect(selectRingRatio({ session, now: at(1800) })).toBe(0);
  });

  it('칩 라벨은 남은 시간을 말로 읽고 일시정지를 먼저 알린다 (§5)', () => {
    expect(selectChipLabel({ session, now: at(378), todoTitle: '장보기' })).toBe(
      '집중 타이머 18분 42초 남음, 장보기',
    );
    expect(selectChipLabel({ session, now: at(378), todoTitle: null })).toBe(
      '집중 타이머 18분 42초 남음',
    );
    const paused = makeFocusSession({ status: 'paused', pausedAt: at(378) });
    expect(selectChipLabel({ session: paused, now: at(900), todoTitle: '장보기' })).toBe(
      '집중 타이머 18분 42초 남음, 일시정지됨, 장보기',
    );
  });

  it('탭 제목은 실행 중에만 바뀐다 (R11)', () => {
    expect(selectDocumentTitle({ session, now: at(378), todoTitle: '장보기' }, 'Tasky')).toBe(
      '18:42 · 장보기 · Tasky',
    );
    expect(selectDocumentTitle({ session, now: at(378), todoTitle: null }, 'Tasky')).toBe(
      '18:42 · Tasky',
    );
    expect(
      selectDocumentTitle(
        { session: makeFocusSession({ status: 'paused' }), now: at(0), todoTitle: null },
        'Tasky',
      ),
    ).toBeNull();
    expect(selectDocumentTitle({ session: null, now: at(0), todoTitle: null }, 'Tasky')).toBeNull();
  });
});
