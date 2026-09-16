// 완료 신호 (timer R9 b·c, R9-a). 두 층을 본다:
// 1. `playFocusChime()` 자체 — **막혔을 때 조용히 실패하지 않는지**. 울렸는지를 돌려주고,
//    시각 신호(카드·탭 제목)는 이 함수와 무관하게 항상 뜬다.
// 2. **언제 부르는가** — 등급(R9-a)·소리 끄기·모션 축소, 그리고 칩과 패널이 함께 마운트됐을 때
//    신호가 한 벌만 설치되는지. 이 층이 비어 있으면 차임이 두 번 울려도 아무도 알려 주지 않는다.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHIME_GAIN,
  CHIME_GAP_MS,
  CHIME_TONES,
  COMPLETION_TITLE_PREFIX,
  TITLE_BLINK_MS,
  playFocusChime,
  resetTimerSignals,
  useTimerSignals,
} from '@/features/timer/hooks/useTimerSignals';
import { initialTimerState, type TimerCompletion } from '@/features/timer/store/timer-state';
import { useTimerStore } from '@/features/timer/store/timer-store';

type Scheduled = { frequency: number; gain: number; startAt: number; stopAt: number };

/**
 * Web Audio 를 흉내 내는 최소 구현. `state` 로 자동재생 차단을 재현한다.
 * gain 노드와 oscillator 는 쌍으로 만들어지므로 만들어진 순서로 짝을 맞춘다.
 */
function fakeAudio(initialState: AudioContextState, resumesTo: AudioContextState = 'running') {
  const gains: { gain: { value: number }; connect: () => void }[] = [];
  const scheduled: Scheduled[] = [];
  let closed = false;

  const context = {
    state: initialState,
    currentTime: 0,
    destination: {},
    resume: vi.fn(async () => {
      context.state = resumesTo;
    }),
    close: vi.fn(async () => {
      closed = true;
    }),
    createGain() {
      const node = { gain: { value: 0 }, connect: () => {} };
      gains.push(node);
      return node;
    },
    createOscillator() {
      const index = gains.length;
      let startAt = 0;
      return {
        frequency: { value: 0 },
        connect: () => {},
        start(at: number) {
          startAt = at;
        },
        stop(at: number) {
          scheduled.push({
            frequency: this.frequency.value,
            gain: gains[index]?.gain.value ?? 0,
            startAt,
            stopAt: at,
          });
        },
      };
    },
  };

  return {
    context,
    scheduled,
    isClosed: () => closed,
    ctor: function AudioContextStub() {
      return context;
    } as unknown as typeof AudioContext,
  };
}

const scope = globalThis as unknown as { AudioContext?: typeof AudioContext };

beforeEach(() => {
  delete scope.AudioContext;
});

afterEach(() => {
  delete scope.AudioContext;
  vi.restoreAllMocks();
});

describe('playFocusChime (R9 b)', () => {
  it('Web Audio 가 없으면 false 를 돌려주고 던지지 않는다', async () => {
    await expect(playFocusChime()).resolves.toBe(false);
  });

  it('자동재생이 막혀 resume 해도 깨어나지 않으면 false 다 — 시각 신호로 간다 (R9-a 경로)', async () => {
    const fake = fakeAudio('suspended', 'suspended');
    scope.AudioContext = fake.ctor;

    await expect(playFocusChime()).resolves.toBe(false);
    expect(fake.context.resume).toHaveBeenCalled();
    expect(fake.isClosed()).toBe(true);
    expect(fake.scheduled).toHaveLength(0);
  });

  it('생성자가 던져도 false 다', async () => {
    scope.AudioContext = function Boom() {
      throw new Error('blocked');
    } as unknown as typeof AudioContext;
    await expect(playFocusChime()).resolves.toBe(false);
  });

  it('스펙이 정한 두 음을 스펙이 정한 간격으로 예약한다', async () => {
    const fake = fakeAudio('running');
    scope.AudioContext = fake.ctor;

    await expect(playFocusChime()).resolves.toBe(true);

    // 880Hz·1175Hz 각 120ms, 사이 80ms, gain 0.2 (R9). 리터럴로 적고 상수는 아래에서 따로 단언한다.
    expect(fake.scheduled).toEqual([
      { frequency: 880, gain: 0.2, startAt: 0, stopAt: 0.12 },
      { frequency: 1175, gain: 0.2, startAt: 0.2, stopAt: 0.32 },
    ]);
  });

  it('정지 상태(suspended)라도 깨어나면 울린다 — 첫 재생 직전의 흔한 상태다', async () => {
    const fake = fakeAudio('suspended', 'running');
    scope.AudioContext = fake.ctor;
    await expect(playFocusChime()).resolves.toBe(true);
    expect(fake.scheduled).toHaveLength(2);
  });
});

describe('차임 상수 (리터럴 단언의 근거)', () => {
  it('스펙 R9 의 수치와 같다', () => {
    expect(CHIME_TONES).toEqual([
      { frequencyHz: 880, durationMs: 120 },
      { frequencyHz: 1175, durationMs: 120 },
    ]);
    expect(CHIME_GAP_MS).toBe(80);
    expect(CHIME_GAIN).toBe(0.2);
  });
});

/** 완료 카드 한 건. 차임·탭 제목이 보는 것은 `signal` 과 세션 id 뿐이다. */
function completionOf(signal: TimerCompletion['signal'], id = 'session-1'): TimerCompletion {
  return {
    session: { id, plannedSeconds: 1500 } as never,
    signal,
    todoTitle: '장보기',
    recordedSeconds: 1500,
  };
}

describe('신호 설치 (R9 b·c)', () => {
  /** 깜빡임 인터벌만 센다 — 다른 주기의 인터벌이 섞여도 오염되지 않는다. */
  const blinkIntervals = (spy: { mock: { calls: unknown[][] } }): number =>
    spy.mock.calls.filter((call) => call[1] === TITLE_BLINK_MS).length;

  let audioCount = 0;

  beforeEach(() => {
    audioCount = 0;
    scope.AudioContext = function AudioContextStub() {
      audioCount += 1;
      return {
        state: 'running',
        currentTime: 0,
        destination: {},
        resume: async () => {},
        close: async () => {},
        createGain: () => ({ gain: { value: 0 }, connect: () => {} }),
        createOscillator: () => ({
          frequency: { value: 0 },
          connect: () => {},
          start: () => {},
          stop: () => {},
        }),
      };
    } as unknown as typeof AudioContext;

    resetTimerSignals();
    document.title = 'Tasky';
    useTimerStore.setState(initialTimerState(new Date().toISOString()));
  });

  afterEach(() => {
    resetTimerSignals();
    document.title = '';
  });

  it('칩과 패널이 함께 걸어도 차임 한 번·깜빡임 인터벌 하나다', () => {
    const setInterval = vi.spyOn(globalThis, 'setInterval');
    const chip = renderHook(() => useTimerSignals());
    const panel = renderHook(() => useTimerSignals());

    act(() => {
      useTimerStore.setState({ completion: completionOf('full') });
    });

    expect(audioCount).toBe(1);
    expect(blinkIntervals(setInterval)).toBe(1);
    expect(document.title).toBe(`${COMPLETION_TITLE_PREFIX} · Tasky`);

    // 한 쪽이 빠져도 신호는 살아 있고, 마지막이 빠질 때 제목이 되돌아온다.
    chip.unmount();
    expect(document.title).toBe(`${COMPLETION_TITLE_PREFIX} · Tasky`);
    panel.unmount();
    expect(document.title).toBe('Tasky');
  });

  it('오래된 완료(record-only)는 차임도 탭 제목도 주지 않는다 (R9-a)', () => {
    const setInterval = vi.spyOn(globalThis, 'setInterval');
    renderHook(() => useTimerSignals());

    act(() => {
      useTimerStore.setState({ completion: completionOf('record-only') });
    });

    expect(audioCount).toBe(0);
    expect(blinkIntervals(setInterval)).toBe(0);
    expect(document.title).toBe('Tasky');
  });

  it('소리를 끄면 울리지 않지만 탭 제목은 그대로 알린다 (R9)', () => {
    renderHook(() => useTimerSignals());

    act(() => {
      useTimerStore.setState({ soundOff: true, completion: completionOf('full') });
    });

    expect(audioCount).toBe(0);
    expect(document.title).toBe(`${COMPLETION_TITLE_PREFIX} · Tasky`);
  });

  it('모션 축소를 선호하면 깜빡이지 않고 문구만 고정된다 (theme R5)', () => {
    const setInterval = vi.spyOn(globalThis, 'setInterval');
    vi.stubGlobal(
      'matchMedia',
      (query: string) => ({ matches: query.includes('reduce'), media: query }) as MediaQueryList,
    );
    renderHook(() => useTimerSignals());

    act(() => {
      useTimerStore.setState({ completion: completionOf('full') });
    });

    expect(blinkIntervals(setInterval)).toBe(0);
    expect(document.title).toBe(`${COMPLETION_TITLE_PREFIX} · Tasky`);
    vi.unstubAllGlobals();
  });

  it('카드를 닫으면 깜빡임이 멈추고 제목이 돌아온다', () => {
    const clearInterval = vi.spyOn(globalThis, 'clearInterval');
    renderHook(() => useTimerSignals());

    act(() => {
      useTimerStore.setState({ completion: completionOf('full') });
    });
    act(() => {
      useTimerStore.setState({ completion: null });
    });

    expect(clearInterval).toHaveBeenCalled();
    expect(document.title).toBe('Tasky');
  });
});
