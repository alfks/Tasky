// 타이머 스토어 — **시간이 믿을 수 없다는 전제**를 실제로 시각을 점프시켜 확인한다 (timer R1~R13).
//
// 단언 규칙: 남은 시간·경과 같은 값은 **리터럴**로 적고(1500, 900 …) 도메인 상수는 따로 한 번 단언한다.
// 상수를 그대로 참조해 단언하면 상수를 잘못 바꿔도 테스트가 같이 따라가 아무것도 잡지 못한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FOCUS_DEFAULT_MINUTES,
  FOCUS_FRESH_COMPLETION_SECONDS,
  FOCUS_PAUSE_EXPIRY_SECONDS,
} from '@/domain/focus/focus-session.rules';
import { adopt } from '@/domain/meta';
import type { Todo } from '@/domain/todo/todo';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { FOCUS_EXTEND_MINUTES } from '@/features/timer/store/timer-actions';
import { TIMER_PREFS_KEY } from '@/features/timer/store/timer-prefs';
import { selectRemainingSeconds } from '@/features/timer/store/timer-selectors';
import { createTimerStore, type TimerStore } from '@/features/timer/store/timer-store';
import { makeTodo } from '@/test/fixtures/todo';

import { todayKey } from '@/lib/date';

/** 기준 시각. 모든 점프는 여기서부터 초 단위로 센다. */
const START_MS = Date.parse('2026-09-16T09:00:00.000Z');
/** `seconds` 초 뒤로 시스템 시계를 옮긴다. `Date` 만 가짜라 레포지토리의 마이크로태스크는 그대로 돈다. */
const jumpTo = (seconds: number): void => {
  vi.setSystemTime(new Date(START_MS + seconds * 1000));
};

type Store = ReturnType<typeof createTimerStore>;

const state = (store: Store): TimerStore => store.getState();
const remaining = (store: Store): number => selectRemainingSeconds(state(store));

async function seedTodo(overrides: Partial<Todo> = {}): Promise<Todo> {
  const todo = makeTodo({ date: todayKey(), ...overrides });
  await getRepositories().todos.upsert(adopt(todo));
  return todo;
}

/**
 * 완료·취소의 저장은 `tick()` 뒤에서 비동기로 이어진다. 기본 대기 시간은 부하가 걸린 CI 에서 빠듯하므로
 * 넉넉히 잡는다 — 실패를 감추지는 않는다(끝내 조건이 안 맞으면 그대로 실패한다).
 */
const settle = (assertion: () => void | Promise<void>): Promise<void> =>
  vi.waitFor(assertion, { timeout: 5000, interval: 10 });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  jumpTo(0);
  setRepositories(createMemoryRepositories());
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('도메인 상수 (리터럴 단언의 근거)', () => {
  it('아래 테스트가 쓰는 숫자와 상수가 같다', () => {
    expect(FOCUS_DEFAULT_MINUTES).toBe(25);
    expect(FOCUS_FRESH_COMPLETION_SECONDS).toBe(120);
    expect(FOCUS_PAUSE_EXPIRY_SECONDS).toBe(86_400);
    expect(FOCUS_EXTEND_MINUTES).toBe(5);
  });
});

describe('시작 (R1·R2)', () => {
  it('기본 25분 세션을 만들고 저장소에 즉시 적는다', async () => {
    const store = createTimerStore();
    await state(store).hydrate();
    await state(store).start();

    expect(remaining(store)).toBe(1500);
    expect(state(store).session).toMatchObject({ status: 'running', plannedSeconds: 1500 });
    expect(state(store).sessionUnsaved).toBe(false);

    const stored = await getRepositories().focusSessions.getActive();
    expect(stored?.id).toBe(state(store).session?.id);
  });

  it('고른 길이를 기기에 기억한다 (R1)', async () => {
    const store = createTimerStore();
    state(store).setMinutes(50);
    await state(store).start();

    expect(state(store).session?.plannedSeconds).toBe(3000);
    expect(JSON.parse(localStorage.getItem(TIMER_PREFS_KEY) ?? '{}')).toMatchObject({
      minutes: 50,
    });
  });

  it('1~180 밖 길이는 거부하고 값을 바꾸지 않는다 (R1)', async () => {
    const store = createTimerStore();
    state(store).setMinutes(181);
    expect(state(store).minutes).toBe(25);
    expect(state(store).error).toBe('집중 시간은 1분부터 180분까지예요');

    state(store).setMinutes(180);
    await state(store).start();
    expect(state(store).session?.plannedSeconds).toBe(10_800);
  });
});

describe('경과는 틱이 아니라 시각으로 (R3)', () => {
  it('틱을 한 번도 부르지 않고 30분이 지나도 값이 어긋나지 않는다', async () => {
    const store = createTimerStore();
    await state(store).start();

    jumpTo(600);
    state(store).tick();
    expect(remaining(store)).toBe(900);

    // 백그라운드 탭: 인터벌이 20분 동안 한 번도 돌지 않았다고 가정한다.
    jumpTo(1800);
    expect(remaining(store)).toBe(900); // now 를 갱신하기 전이라 화면은 아직 옛 값
    state(store).tick(); // 딱 한 번 돌자마자 정확한 값이 된다
    expect(remaining(store)).toBe(0);
  });

  it('시계가 뒤로 가도 남은 시간이 계획보다 늘지 않는다', async () => {
    const store = createTimerStore();
    await state(store).start();

    jumpTo(300);
    state(store).tick();
    expect(remaining(store)).toBe(1200);

    // 수동 변경·NTP 보정으로 10분 되감김.
    jumpTo(-300);
    state(store).tick();
    expect(remaining(store)).toBe(1500);
    expect(state(store).session?.status).toBe('running');
  });
});

describe('완료 (R4·R9)', () => {
  it('endedAt 은 현재 시각이 아니라 startedAt + planned 다 — 백그라운드 시간이 기록을 부풀리지 않는다', async () => {
    const store = createTimerStore();
    await state(store).start();
    const startedAt = state(store).session?.startedAt ?? '';

    jumpTo(1800); // 계획보다 5분 더 지난 뒤에야 탭이 돌아왔다
    state(store).tick();
    await settle(() => expect(state(store).completion).not.toBeNull());

    const completed = state(store).completion?.session;
    expect(completed?.elapsedSeconds).toBe(1500);
    expect(Date.parse(completed?.endedAt ?? '') - Date.parse(startedAt)).toBe(1_500_000);
    expect(state(store).session).toBeNull();
  });

  it('실행 중 정확히 끝나면 소리·탭 제목까지 주는 등급이다 (R9)', async () => {
    const store = createTimerStore();
    await state(store).start();

    jumpTo(1500);
    state(store).tick();
    await settle(() => expect(state(store).completion?.signal).toBe('full'));
  });

  it('완료 판정은 한 번만 일어난다 — 틱이 여러 번 와도 카드가 갈리지 않는다', async () => {
    const store = createTimerStore();
    await state(store).start();

    jumpTo(1500);
    state(store).tick();
    state(store).tick();
    state(store).tick();
    await settle(() => expect(state(store).completion).not.toBeNull());

    const sessions = await getRepositories().focusSessions.listAll();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe('completed');
  });
});

describe('일시정지·재개 (R6)', () => {
  it('멈춰 있던 시간만큼 뒤로 밀린다', async () => {
    const store = createTimerStore();
    await state(store).start();

    jumpTo(300);
    await state(store).pause();
    expect(remaining(store)).toBe(1200);

    // 3분 동안 멈춰 있어도 남은 시간은 그대로다.
    jumpTo(480);
    state(store).tick();
    expect(remaining(store)).toBe(1200);

    await state(store).resume();
    expect(state(store).session?.pausedTotalSeconds).toBe(180);

    jumpTo(600);
    state(store).tick();
    expect(remaining(store)).toBe(1080);

    // 끝나는 시각도 멈춘 만큼 밀린다: 1500 + 180 = 1680초.
    jumpTo(1679);
    state(store).tick();
    expect(remaining(store)).toBe(1);
    jumpTo(1680);
    state(store).tick();
    await settle(() => expect(state(store).completion).not.toBeNull());
  });
});

describe('중지 (R7·R13)', () => {
  it('경과를 기록하고 카드는 띄우지 않는다', async () => {
    const store = createTimerStore();
    const todo = await seedTodo();
    state(store).selectTodo(todo.id);
    await state(store).start();

    jumpTo(45);
    state(store).tick();
    await state(store).stop();

    expect(state(store).session).toBeNull();
    expect(state(store).completion).toBeNull();

    const [saved] = await getRepositories().focusSessions.listByTodo(todo.id);
    expect(saved).toMatchObject({ status: 'canceled', elapsedSeconds: 45 });
    const updated = await getRepositories().todos.getById(todo.id);
    expect(updated?.focusSeconds).toBe(45);
  });
});

describe('투두 누적 (R8)', () => {
  it('완료하면 계획 시간이 그대로 투두에 쌓인다', async () => {
    const store = createTimerStore();
    const todo = await seedTodo({ focusSeconds: 600 });
    state(store).selectTodo(todo.id);
    await state(store).start();

    jumpTo(1500);
    state(store).tick();
    await settle(() => expect(state(store).completion).not.toBeNull());
    await settle(async () => {
      const updated = await getRepositories().todos.getById(todo.id);
      expect(updated?.focusSeconds).toBe(2100);
    });
  });

  it('투두가 그 사이 삭제됐으면 세션만 남는다', async () => {
    const store = createTimerStore();
    const todo = await seedTodo();
    state(store).selectTodo(todo.id);
    await state(store).start();

    await getRepositories().todos.upsert(adopt({ ...todo, deletedAt: new Date().toISOString() }));

    jumpTo(1500);
    state(store).tick();
    await settle(() => expect(state(store).completion).not.toBeNull());
    expect(state(store).error).toBeNull();
    expect(await getRepositories().focusSessions.listAll()).toHaveLength(1);
  });
});
