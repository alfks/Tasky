// 뽀모도로 규칙 (timer P1·P2·P4·P5). **가짜 시계도 필요 없다** — 이 파일의 함수는 전부 `now` 를
// 인자로 받는 순수 함수라, 시각은 리터럴 문자열로 직접 세운다.
//
// 단언 규칙은 timer-store.test.ts 와 같다: 시간 값은 리터럴로 적고 상수는 따로 한 번 단언한다.
// 상수를 그대로 참조해 단언하면 상수를 잘못 바꿔도 테스트가 같이 따라가 아무것도 잡지 못한다.
import { describe, expect, it } from 'vitest';

import { FOCUS_FRESH_COMPLETION_SECONDS } from '@/domain/focus/focus-session.rules';

import {
  addPomodoro,
  POMODORO_LONG_BREAK_EVERY,
  POMODORO_MAX_BREAK_MINUTES,
  pomodoroBreakKind,
  pomodoroBreakLabel,
  pomodoroBreakMinutes,
  pomodoroBreakOver,
  pomodoroBreakRemainingSeconds,
  pomodoroBreakSignal,
  pomodoroCountOn,
  pomodoroLongBreakMinutes,
  pomodoroShortBreakMinutes,
  startPomodoroBreak,
} from '@/features/timer/store/pomodoro';

const START = Date.parse('2026-09-16T09:00:00.000Z');
const at = (seconds: number): string => new Date(START + seconds * 1000).toISOString();

describe('상수 (리터럴 단언의 근거)', () => {
  it('아래 테스트가 쓰는 숫자와 상수가 같다', () => {
    expect(POMODORO_LONG_BREAK_EVERY).toBe(4);
    expect(POMODORO_MAX_BREAK_MINUTES).toBe(60);
    expect(FOCUS_FRESH_COMPLETION_SECONDS).toBe(120);
  });
});

describe('휴식 길이는 집중 길이에서 파생된다 (P1)', () => {
  it('고전형 25분에서 정확히 5분·15분이 나온다', () => {
    expect(pomodoroShortBreakMinutes(25)).toBe(5);
    expect(pomodoroLongBreakMinutes(25)).toBe(15);
  });

  it('50분을 고르면 10분·30분으로 같은 비율을 따른다', () => {
    expect(pomodoroShortBreakMinutes(50)).toBe(10);
    expect(pomodoroLongBreakMinutes(50)).toBe(30);
  });

  it('아주 짧은 집중에서도 휴식은 1분 아래로 내려가지 않는다', () => {
    // 1분/5 = 0.2분 → 0분이면 "시작하자마자 끝난 휴식" 이 되어 구간이 사라진다.
    expect(pomodoroShortBreakMinutes(1)).toBe(1);
    expect(pomodoroShortBreakMinutes(2)).toBe(1);
  });

  it('아주 긴 집중에서도 휴식은 60분에서 잘린다 — 그 위는 휴식이 아니다', () => {
    expect(pomodoroLongBreakMinutes(180)).toBe(60);
    expect(pomodoroShortBreakMinutes(180)).toBe(36);
  });
});

describe('4번째마다 긴 휴식 (P2)', () => {
  it('1~3번째는 짧은 휴식, 4번째는 긴 휴식이다', () => {
    expect(pomodoroBreakKind(1)).toBe('short');
    expect(pomodoroBreakKind(2)).toBe('short');
    expect(pomodoroBreakKind(3)).toBe('short');
    expect(pomodoroBreakKind(4)).toBe('long');
  });

  it('주기는 계속 이어진다 — 8번째도 긴 휴식이고 5~7번째는 아니다', () => {
    expect(pomodoroBreakKind(5)).toBe('short');
    expect(pomodoroBreakKind(7)).toBe('short');
    expect(pomodoroBreakKind(8)).toBe('long');
    expect(pomodoroBreakKind(12)).toBe('long');
  });

  it('아무것도 끝내지 않은 상태(0)는 긴 휴식이 아니다', () => {
    // 0 % 4 === 0 이라 조건을 잘못 쓰면 첫 휴식이 긴 휴식이 된다.
    expect(pomodoroBreakKind(0)).toBe('short');
  });

  it('길이도 종류를 따라간다 — 25분 집중의 4번째는 15분이다', () => {
    expect(pomodoroBreakMinutes(25, 3)).toBe(5);
    expect(pomodoroBreakMinutes(25, 4)).toBe(15);
  });

  it('만든 휴식에 종류와 초가 함께 담긴다', () => {
    expect(startPomodoroBreak({ focusMinutes: 25, completed: 4, at: at(0) })).toEqual({
      kind: 'long',
      startedAt: at(0),
      plannedSeconds: 900,
    });
    expect(startPomodoroBreak({ focusMinutes: 25, completed: 1, at: at(0) })).toEqual({
      kind: 'short',
      startedAt: at(0),
      plannedSeconds: 300,
    });
  });
});

describe('남은 시간은 시각으로 계산한다 (P2·R3 와 같은 방식)', () => {
  const rest = startPomodoroBreak({ focusMinutes: 25, completed: 1, at: at(0) });

  it('틱을 세지 않으므로 얼마를 건너뛰어도 값이 맞는다', () => {
    expect(pomodoroBreakRemainingSeconds(rest, at(0))).toBe(300);
    expect(pomodoroBreakRemainingSeconds(rest, at(1))).toBe(299);
    // 백그라운드에서 인터벌이 4분 동안 한 번도 안 돌아도 다음 값은 정확하다.
    expect(pomodoroBreakRemainingSeconds(rest, at(240))).toBe(60);
  });

  it('0 아래로 내려가지 않고, 시계가 뒤로 가도 계획 시간을 넘지 않는다', () => {
    expect(pomodoroBreakRemainingSeconds(rest, at(300))).toBe(0);
    expect(pomodoroBreakRemainingSeconds(rest, at(100_000))).toBe(0);
    expect(pomodoroBreakRemainingSeconds(rest, at(-600))).toBe(300);
  });

  it('끝남 판정은 남은 시간이 0 이 되는 순간이다', () => {
    expect(pomodoroBreakOver(rest, at(299))).toBe(false);
    expect(pomodoroBreakOver(rest, at(300))).toBe(true);
  });
});

describe('끝난 휴식의 신호 등급 (P4)', () => {
  const rest = startPomodoroBreak({ focusMinutes: 25, completed: 1, at: at(0) });

  it('2분 경계 직전은 막 끝난 것으로 본다', () => {
    expect(pomodoroBreakSignal(rest, at(300))).toBe('full');
    expect(pomodoroBreakSignal(rest, at(420))).toBe('full');
  });

  it('2분을 넘기면 조용하다 — 뒤늦게 울릴 소리가 아니다', () => {
    expect(pomodoroBreakSignal(rest, at(421))).toBe('quiet');
    expect(pomodoroBreakSignal(rest, at(86_400))).toBe('quiet');
  });
});

describe('오늘 몇 개를 마쳤나 (P5)', () => {
  it('날짜가 같을 때만 센다', () => {
    const cycle = { date: '2026-09-16', completed: 3 };
    expect(pomodoroCountOn(cycle, '2026-09-16')).toBe(3);
    expect(pomodoroCountOn(cycle, '2026-09-17')).toBe(0);
    expect(pomodoroCountOn(null, '2026-09-16')).toBe(0);
  });

  it('날짜가 바뀌면 이어 세지 않고 그날의 첫 개로 시작한다', () => {
    const first = addPomodoro(null, '2026-09-16');
    expect(first).toEqual({ date: '2026-09-16', completed: 1 });
    expect(addPomodoro(first, '2026-09-16')).toEqual({ date: '2026-09-16', completed: 2 });
    expect(addPomodoro(first, '2026-09-17')).toEqual({ date: '2026-09-17', completed: 1 });
  });
});

describe('문구', () => {
  it('종류를 한국어로 말한다', () => {
    expect(pomodoroBreakLabel('short')).toBe('짧은 휴식');
    expect(pomodoroBreakLabel('long')).toBe('긴 휴식');
  });
});
