// 완료 차임 (timer R9 b). **막혔을 때 조용히 실패하지 않는지**가 요점이다 —
// `playFocusChime()` 은 울렸는지를 돌려주고, 시각 신호(카드·탭 제목)는 이 함수와 무관하게 항상 뜬다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHIME_GAIN,
  CHIME_GAP_MS,
  CHIME_TONES,
  playFocusChime,
} from '@/features/timer/hooks/useTimerSignals';

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
