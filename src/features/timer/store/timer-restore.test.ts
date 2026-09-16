// 복원·다중 탭·지연 완료 (timer R2·R5·R6·R9-a·R10). 탭을 닫았다 여는 것은 **새 스토어 인스턴스**로,
// 다른 탭은 **같은 저장소를 보는 두 인스턴스**로 흉내 낸다.
//
// 단언 규칙은 timer-store.test.ts 와 같다 — 시간 값은 리터럴, 상수는 따로.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FOCUS_FRESH_COMPLETION_SECONDS } from '@/domain/focus/focus-session.rules';
import { adopt } from '@/domain/meta';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { selectRemainingSeconds } from '@/features/timer/store/timer-selectors';
import { createTimerStore, type TimerStore } from '@/features/timer/store/timer-store';
import { makeFocusSession } from '@/test/fixtures/focus-session';
import { makeTodo } from '@/test/fixtures/todo';

import { todayKey } from '@/lib/date';

const START_MS = Date.parse('2026-09-16T09:00:00.000Z');
const iso = (seconds: number): string => new Date(START_MS + seconds * 1000).toISOString();
const jumpTo = (seconds: number): void => {
  vi.setSystemTime(new Date(START_MS + seconds * 1000));
};

type Store = ReturnType<typeof createTimerStore>;
const state = (store: Store): TimerStore => store.getState();
const remaining = (store: Store): number => selectRemainingSeconds(state(store));

/** 저장소에 진행 중 세션을 직접 심는다 — "앱이 꺼져 있는 동안" 을 만드는 방법이다. */
async function seedSession(overrides: Parameters<typeof makeFocusSession>[0]) {
  const session = makeFocusSession({ date: todayKey(), plannedSeconds: 1500, ...overrides });
  await getRepositories().focusSessions.upsert(adopt(session));
  return session;
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

describe('새로고침·탭 닫기 후 복원 (R2)', () => {
  it('남은 시간이 이어진다 — 꺼져 있던 10분은 그대로 지나간 시간이다', async () => {
    const first = createTimerStore();
    await state(first).start();

    jumpTo(600);
    const second = createTimerStore(); // 새로고침 = 새 인스턴스
    await state(second).hydrate();

    expect(state(second).session?.id).toBe(state(first).session?.id);
    expect(remaining(second)).toBe(900);
  });

  it('꺼져 있는 동안 끝났으면 여는 순간 완료된다 (R4)', async () => {
    const todo = makeTodo({ date: todayKey() });
    await getRepositories().todos.upsert(adopt(todo));
    const first = createTimerStore();
    state(first).selectTodo(todo.id);
    await state(first).start();

    jumpTo(5000); // 탭이 닫혀 있던 1시간 20분
    const second = createTimerStore();
    await state(second).hydrate();

    await settle(() => expect(state(second).completion).not.toBeNull());
    expect(state(second).completion?.session.elapsedSeconds).toBe(1500);
    await settle(async () => {
      expect((await getRepositories().todos.getById(todo.id))?.focusSeconds).toBe(1500);
    });
  });
});

describe('지연 완료의 신호 등급 (R9-a) — 2분 경계', () => {
  it('상수와 리터럴이 같은 값이다', () => {
    expect(FOCUS_FRESH_COMPLETION_SECONDS).toBe(120);
  });

  it('끝난 지 120초면 실행 중 완료와 똑같이 전부 준다', async () => {
    await seedSession({ startedAt: iso(-1620) }); // endedAt = 지금 - 120초
    const store = createTimerStore();
    await state(store).hydrate();

    await settle(() => expect(state(store).completion?.signal).toBe('full'));
  });

  it('121초면 기록 카드만 준다 — 소리도 탭 제목도 없다', async () => {
    await seedSession({ startedAt: iso(-1621) });
    const store = createTimerStore();
    await state(store).hydrate();

    await settle(() => expect(state(store).completion?.signal).toBe('record-only'));
    expect(state(store).completion?.session.elapsedSeconds).toBe(1500);
  });

  it('사흘 전에 끝난 세션도 기록은 보여 준다', async () => {
    await seedSession({ startedAt: iso(-3 * 86_400) });
    const store = createTimerStore();
    await state(store).hydrate();

    await settle(() => expect(state(store).completion?.signal).toBe('record-only'));
  });
});

describe('일시정지 24시간 자동 취소 (R6)', () => {
  it('정리 카드로 무엇이 기록됐는지 알린다', async () => {
    const todo = makeTodo({ date: todayKey(), title: '장보기' });
    await getRepositories().todos.upsert(adopt(todo));
    await seedSession({
      status: 'paused',
      todoId: todo.id,
      startedAt: iso(-87_000),
      pausedAt: iso(-86_400),
    });

    const store = createTimerStore();
    await state(store).hydrate();

    await settle(() => expect(state(store).notice).not.toBeNull());
    expect(state(store).notice).toMatchObject({ todoTitle: '장보기', recordedSeconds: 600 });
    expect(state(store).completion).toBeNull();
    expect(state(store).session).toBeNull();
    await settle(async () => {
      expect((await getRepositories().todos.getById(todo.id))?.focusSeconds).toBe(600);
    });
  });

  it('23시간 59분 59초면 아직 살아 있다', async () => {
    await seedSession({ status: 'paused', startedAt: iso(-87_000), pausedAt: iso(-86_399) });
    const store = createTimerStore();
    await state(store).hydrate();

    expect(state(store).notice).toBeNull();
    expect(state(store).session?.status).toBe('paused');
  });
});

describe('다중 탭 (R5)', () => {
  it('다른 탭이 달리고 있으면 시작을 거부하고 그 세션을 보여 준다', async () => {
    const tabA = createTimerStore();
    await state(tabA).start();

    const tabB = createTimerStore();
    jumpTo(120);
    const started = await state(tabB).start();

    expect(started).toBe(false);
    expect(state(tabB).error).toBe('이미 집중 중인 세션이 있어요');
    expect(state(tabB).session?.id).toBe(state(tabA).session?.id);
    expect(remaining(tabB)).toBe(1380);
    expect(await getRepositories().focusSessions.listAll()).toHaveLength(1);
  });

  it('다른 탭이 중지하면 이 탭은 다시 보일 때 맞춰진다', async () => {
    const tabA = createTimerStore();
    await state(tabA).start();
    const tabB = createTimerStore();
    await state(tabB).hydrate();
    expect(state(tabB).session).not.toBeNull();

    jumpTo(90);
    await state(tabA).stop();

    // 아직 이 탭은 모른다 — 실시간 채널이 없다는 것이 알려진 한계다.
    expect(state(tabB).session).not.toBeNull();

    await state(tabB).refresh();
    expect(state(tabB).session).toBeNull();
  });

  it('한 탭에서 [집중 시작] 을 연타해도 running 세션은 1개다', async () => {
    const store = createTimerStore();

    // 저장소 조회와 세션 기록 사이가 열려 있으면 열 건 전부가 "활성 세션 없음" 을 읽고 각자 만든다.
    const results = await Promise.all(Array.from({ length: 10 }, () => state(store).start()));

    const sessions = await getRepositories().focusSessions.listAll();
    expect(sessions.filter((session) => session.status === 'running')).toHaveLength(1);
    expect(sessions).toHaveLength(1);
    expect(results.every((started) => started)).toBe(true);
    expect(state(store).error).toBeNull();
  });

  it('중지 저장이 끝나기 전에 다시 시작해도 거부되지 않는다 — 쓰기가 한 줄로 선다', async () => {
    const store = createTimerStore();
    await state(store).start();

    jumpTo(45);
    // IndexedDB 의 쓰기는 즉시 끝나지 않는다 — 그 지연이 있어야 경합 창이 실제 크기로 열린다.
    const sessions = getRepositories().focusSessions;
    const upsert = sessions.upsert.bind(sessions);
    vi.spyOn(sessions, 'upsert').mockImplementation(async (session) => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await upsert(session);
    });

    // 중지가 저장되는 동안 사용자가 곧바로 다시 시작한다. 두 쓰기가 같은 줄에 서지 않으면
    // 시작 쪽이 저장소에서 "아직 달리고 있는" 세션을 읽고 거부한다.
    const stopping = state(store).stop();
    const restarting = state(store).start();
    const [stopped, started] = await Promise.all([stopping, restarting]);

    expect(stopped).toBe(true);
    expect(started).toBe(true);
    expect(state(store).error).toBeNull();
    expect(state(store).session?.status).toBe('running');
    expect(await getRepositories().focusSessions.listAll()).toHaveLength(2);
  });

  it('저장에 실패해도 타이머는 화면에서 계속 돌고, 재동기화가 그것을 내리지 않는다 (§2 에러)', async () => {
    const store = createTimerStore();
    const repos = getRepositories();
    vi.spyOn(repos.focusSessions, 'upsert').mockRejectedValue(new Error('저장소가 막혔다'));

    const started = await state(store).start();
    expect(started).toBe(false);
    expect(state(store).error).toBe('기록을 저장하지 못했어요');
    expect(state(store).session).not.toBeNull();
    expect(state(store).sessionUnsaved).toBe(true);

    // 저장되지 않은 세션은 저장소에 없는 것이 당연하다 — 그것까지 내리면 타이머가 사라진다.
    await state(store).refresh();
    expect(state(store).session).not.toBeNull();
    expect(remaining(store)).toBe(1500);
  });
});

describe('[5분 더] (R10)', () => {
  it('같은 투두로 5분 세션을 새로 시작하고 기억된 길이는 건드리지 않는다', async () => {
    const todo = makeTodo({ date: todayKey() });
    await getRepositories().todos.upsert(adopt(todo));
    const store = createTimerStore();
    state(store).selectTodo(todo.id);
    await state(store).start();

    jumpTo(1500);
    state(store).tick();
    await settle(() => expect(state(store).completion).not.toBeNull());

    await state(store).extend();
    expect(state(store).completion).toBeNull();
    expect(state(store).session).toMatchObject({ plannedSeconds: 300, todoId: todo.id });
    expect(state(store).minutes).toBe(25);
    expect(remaining(store)).toBe(300);
  });
});
