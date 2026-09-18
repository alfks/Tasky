// 뽀모도로 흐름을 스토어에서 (timer P1~P5). 시계는 **`Date` 만** 가짜로 세우고 초 단위로 점프시킨다
// (timer-store.test.ts·AppShell.test.tsx 와 같은 방식 — 실시간 대기는 부하에서 깨진다).
// 저장이 끝나기를 기다리는 방법은 아래 `settle` 주석에 있다 — 거기가 이 파일에서 제일 미끄러운 자리다.
//
// 단언 규칙도 같다: 시간 값은 리터럴, 상수는 따로.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adopt } from '@/domain/meta';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { POMODORO_LONG_BREAK_EVERY } from '@/features/timer/store/pomodoro';
import { POMODORO_STATE_KEY, readPomodoroState } from '@/features/timer/store/pomodoro-state';
import { selectBreakRemainingSeconds } from '@/features/timer/store/timer-selectors';
import { createTimerStore, type TimerStore } from '@/features/timer/store/timer-store';
import { makeFocusSession } from '@/test/fixtures/focus-session';

import { todayKey } from '@/lib/date';

const START_MS = Date.parse('2026-09-16T09:00:00.000Z');
const iso = (seconds: number): string => new Date(START_MS + seconds * 1000).toISOString();
const jumpTo = (seconds: number): void => {
  vi.setSystemTime(new Date(START_MS + seconds * 1000));
};

type Store = ReturnType<typeof createTimerStore>;
const state = (store: Store): TimerStore => store.getState();

/**
 * 완료·취소의 저장은 `tick()` 뒤에서 비동기로 이어진다. 그때까지 기다린다.
 *
 * **`vi.waitFor` 를 쓰지 않는 이유**: 가짜 타이머가 걸려 있으면 그 함수가 재시도 간격만큼
 * **가짜 시계를 앞으로 민다**. `toFake: ['Date']` 에서는 그 밀림이 그대로 `Date.now()` 에 들어가
 * 휴식의 `startedAt` 이 10ms 씩 밀리고, 남은 시간이 1초씩 어긋난다(실측: 300초가 299초로 읽혔다).
 * 여기서는 `setTimeout` 이 진짜 그대로이므로(가짜로 세운 것은 `Date` 뿐) 그것으로만 기다린다 —
 * 실제 시각은 흐르지만 **테스트가 보는 시계는 `jumpTo` 가 세운 자리에 그대로 있다.**
 */
async function settle(assertion: () => void): Promise<void> {
  let last: unknown;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => {
      globalThis.setTimeout(resolve, 5);
    });
  }
  throw last;
}

/** 뽀모도로 모드를 켠 스토어 하나. */
async function pomodoroStore(): Promise<Store> {
  const store = createTimerStore();
  await state(store).hydrate();
  state(store).setPomodoro(true);
  return store;
}

/**
 * 집중 하나를 끝까지 돌린다. `at` 은 시작 시각(초), 길이는 기본 25분이다.
 * 돌려주는 값은 그 집중이 끝난 시각(초)이다.
 */
async function runFocus(store: Store, at: number, minutes = 25): Promise<number> {
  jumpTo(at);
  await state(store).start({ minutes });
  const endsAt = at + minutes * 60;
  jumpTo(endsAt);
  state(store).tick();
  await settle(() => {
    expect(state(store).session).toBeNull();
  });
  return endsAt;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  jumpTo(0);
  setRepositories(createMemoryRepositories());
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('상수 (리터럴 단언의 근거)', () => {
  it('긴 휴식 주기는 4다', () => {
    expect(POMODORO_LONG_BREAK_EVERY).toBe(4);
  });
});

describe('뽀모도로는 옵션이다 (P1)', () => {
  it('기본은 꺼져 있고, 끄고 완료하면 지금까지처럼 휴식 없이 끝난다', async () => {
    const store = createTimerStore();
    await state(store).hydrate();
    expect(state(store).pomodoro).toBe(false);

    await runFocus(store, 0);

    expect(state(store).completion).not.toBeNull();
    expect(state(store).breakSession).toBeNull();
    expect(state(store).cycle).toBeNull();
  });

  it('모드는 기기별로 기억된다 — 다음에 앱을 열면 켜진 채다', async () => {
    const first = await pomodoroStore();
    expect(state(first).pomodoro).toBe(true);

    const second = createTimerStore();
    await state(second).hydrate();
    expect(state(second).pomodoro).toBe(true);
  });
});

describe('집중이 끝나면 휴식으로 이어진다 (P2·P3)', () => {
  it('25분 집중이 끝나면 5분 짧은 휴식이 바로 시작된다', async () => {
    const store = await pomodoroStore();
    await runFocus(store, 0);

    expect(state(store).breakSession).toEqual({
      kind: 'short',
      startedAt: iso(1500),
      plannedSeconds: 300,
    });
    expect(selectBreakRemainingSeconds(state(store))).toBe(300);
  });

  it('50분을 골랐으면 휴식도 10분으로 따라간다 — 고른 길이에서 파생된다', async () => {
    const store = await pomodoroStore();
    await runFocus(store, 0, 50);

    expect(state(store).breakSession?.plannedSeconds).toBe(600);
  });

  it('4번째 집중을 끝내면 긴 휴식(15분)이다', async () => {
    const store = await pomodoroStore();
    let clock = 0;
    const kinds: (string | undefined)[] = [];
    const lengths: (number | undefined)[] = [];

    for (let round = 0; round < 4; round += 1) {
      clock = await runFocus(store, clock);
      kinds.push(state(store).breakSession?.kind);
      lengths.push(state(store).breakSession?.plannedSeconds);
      state(store).skipBreak();
      state(store).dismissCompletion();
      clock += 60; // 다음 집중까지의 틈
    }

    expect(kinds).toEqual(['short', 'short', 'short', 'long']);
    expect(lengths).toEqual([300, 300, 300, 900]);
    expect(state(store).cycle).toEqual({ date: todayKey(), completed: 4 });
  });

  it('중지·만료는 뽀모도로 한 개가 아니다 — 휴식도 사이클도 없다', async () => {
    const store = await pomodoroStore();
    jumpTo(0);
    await state(store).start();
    jumpTo(600);
    await state(store).stop();

    expect(state(store).breakSession).toBeNull();
    expect(state(store).cycle).toBeNull();
  });
});

describe('자리를 비운 사이에는 사이클이 돌지 않는다 (P3)', () => {
  it('완료를 2분 넘겨 알아채면 휴식을 시작하지 않는다 — 이미 쉰 시간을 새로 세지 않는다', async () => {
    const store = await pomodoroStore();
    jumpTo(0);
    await state(store).start();

    // 탭을 닫아 둔 사이 집중이 끝났고, 한참 뒤에 돌아왔다.
    jumpTo(1500 + 121);
    state(store).tick();
    await settle(() => {
      expect(state(store).session).toBeNull();
    });

    expect(state(store).completion?.signal).toBe('record-only');
    expect(state(store).breakSession).toBeNull();
    // 그래도 그 집중은 실제로 끝났으므로 사이클 수에는 든다.
    expect(state(store).cycle).toEqual({ date: todayKey(), completed: 1 });
  });

  it('휴식이 끝나도 다음 집중은 저절로 시작되지 않는다 — 카드만 뜬다', async () => {
    const store = await pomodoroStore();
    await runFocus(store, 0);

    jumpTo(1500 + 300);
    state(store).tick();

    expect(state(store).breakSession).toBeNull();
    expect(state(store).breakDone).toEqual({ kind: 'short' });
    expect(state(store).session).toBeNull();
    // 저장소에도 새 세션이 생기지 않았다 — 하지 않은 집중이 기록되지 않는다.
    await expect(getRepositories().focusSessions.getActive()).resolves.toBeUndefined();
  });

  it('휴식은 1초 전까지 돌고 있다', async () => {
    const store = await pomodoroStore();
    await runFocus(store, 0);

    jumpTo(1500 + 299);
    state(store).tick();
    expect(state(store).breakSession).not.toBeNull();
    expect(selectBreakRemainingSeconds(state(store))).toBe(1);
    expect(state(store).breakDone).toBeNull();
  });
});

describe('새로고침·탭 닫기 (P4)', () => {
  it('진행 중인 휴식은 새 탭에서 이어진다 — 꺼져 있던 시간은 그냥 지나간다', async () => {
    const first = await pomodoroStore();
    await runFocus(first, 0);

    // 탭을 닫고 2분 뒤에 다시 연다.
    jumpTo(1500 + 120);
    const second = createTimerStore();
    await state(second).hydrate();

    expect(state(second).breakSession?.kind).toBe('short');
    expect(selectBreakRemainingSeconds(state(second))).toBe(180);
    expect(state(second).cycle).toEqual({ date: todayKey(), completed: 1 });
  });

  it('돌아왔을 때 이미 끝나 있던 휴식은 카드로 알린다 (2분 이내)', async () => {
    const first = await pomodoroStore();
    await runFocus(first, 0);

    jumpTo(1500 + 360);
    const second = createTimerStore();
    await state(second).hydrate();

    expect(state(second).breakSession).toBeNull();
    expect(state(second).breakDone).toEqual({ kind: 'short' });
  });

  it('한참 전에 끝난 휴식은 조용히 사라진다 — 설명할 기록이 없으므로 카드도 없다', async () => {
    const first = await pomodoroStore();
    await runFocus(first, 0);

    jumpTo(1500 + 300 + 121);
    const second = createTimerStore();
    await state(second).hydrate();

    expect(state(second).breakSession).toBeNull();
    expect(state(second).breakDone).toBeNull();
  });

  it('저장소에 살아 있는 집중이 있으면 저장된 휴식은 버린다 — 둘은 동시에 서지 않는다', async () => {
    const first = await pomodoroStore();
    await runFocus(first, 0);
    expect(state(first).breakSession).not.toBeNull();

    // 다른 탭이 새 집중을 시작한 상황을 저장소에 직접 심는다.
    jumpTo(1500 + 60);
    await getRepositories().focusSessions.upsert(
      adopt(makeFocusSession({ date: todayKey(), plannedSeconds: 1500, startedAt: iso(1560) })),
    );

    const second = createTimerStore();
    await state(second).hydrate();

    expect(state(second).session).not.toBeNull();
    expect(state(second).breakSession).toBeNull();
    expect(readPomodoroState().breakSession).toBeNull();
  });

  it('저장된 값이 깨져 있어도 타이머는 뜬다', async () => {
    localStorage.setItem(POMODORO_STATE_KEY, '{"breakSession":{"kind":"nap"},"cycle":7}');
    const store = createTimerStore();
    await expect(state(store).hydrate()).resolves.toBeUndefined();
    expect(state(store).breakSession).toBeNull();
    expect(state(store).cycle).toBeNull();
  });
});

describe('휴식에서 빠져나가는 길 (P3)', () => {
  it('건너뛰면 카드 없이 대기로 돌아간다 — 사용자가 누른 것이라 알릴 것이 없다', async () => {
    const store = await pomodoroStore();
    await runFocus(store, 0);

    state(store).skipBreak();

    expect(state(store).breakSession).toBeNull();
    expect(state(store).breakDone).toBeNull();
    expect(readPomodoroState().breakSession).toBeNull();
  });

  it('휴식 중에 집중을 시작하면 휴식이 끝난다', async () => {
    const store = await pomodoroStore();
    await runFocus(store, 0);

    jumpTo(1500 + 60);
    await state(store).start();

    expect(state(store).session).not.toBeNull();
    expect(state(store).breakSession).toBeNull();
  });

  it('모드를 끄면 돌던 휴식도 함께 걷는다', async () => {
    const store = await pomodoroStore();
    await runFocus(store, 0);

    state(store).setPomodoro(false);

    expect(state(store).pomodoro).toBe(false);
    expect(state(store).breakSession).toBeNull();
    expect(state(store).breakDone).toBeNull();
  });
});

describe('사이클 수는 날짜별이다 (P5)', () => {
  it('어제의 기록은 오늘로 이어지지 않는다', async () => {
    const store = await pomodoroStore();
    store.setState({ cycle: { date: '2000-01-01', completed: 7 } });

    await runFocus(store, 0);

    expect(state(store).cycle).toEqual({ date: todayKey(), completed: 1 });
    // 그래서 그날의 첫 휴식은 긴 휴식이 아니다.
    expect(state(store).breakSession?.kind).toBe('short');
  });
});
