'use client';

// 완료 신호 중 (b) 소리와 (c) 탭 제목 (timer R9·R9-a·R11). (a) 패널 카드는 컴포넌트가 그린다.
//
// **한 벌만 설치한다**(`useTimerRuntime` 과 같은 참조 수 방식). 헤더 칩과 패널이 둘 다 이 훅을 부르는데
// 신호를 컴포넌트마다 걸면: 차임이 두 번 울려 2음이 4음으로 겹치고(AudioContext 도 2개),
// 탭 제목 깜빡임 인터벌이 2개 돌아 **위상에 따라 R9 (c) 가 통째로 사라진다**(둘이 서로 상쇄한다).
// 그래서 상태를 훅으로 구독하지 않고 **모듈 하나가 스토어를 구독**한다 — 첫 마운트가 설치하고
// 마지막 언마운트가 걷는다.
//
// **소리는 정보의 유일한 통로가 아니다.** 자동재생 정책으로 차임이 막히면 `playFocusChime()` 이
// `false` 를 돌려주고 끝이며, 카드(a)와 탭 제목(c)은 그대로 남는다 — 조용히 아무 일도 없는 상태가 되지 않는다.
// 모션 축소를 선호하면 탭 제목은 깜빡이지 않고 고정된 "끝!" 문구로 남는다(theme R5 의 취지).
import { useEffect } from 'react';

import { selectDocumentTitle } from '@/features/timer/store/timer-selectors';
import type { TimerState } from '@/features/timer/store/timer-state';
import { useTimerStore } from '@/features/timer/store/timer-store';

/** R9 (b): 880Hz·1175Hz 각 120ms, 사이 80ms, gain 0.2 고정. 파일이 아니라 합성음이라 번들이 늘지 않는다. */
export const CHIME_TONES = [
  { frequencyHz: 880, durationMs: 120 },
  { frequencyHz: 1175, durationMs: 120 },
] as const;
export const CHIME_GAP_MS = 80;
export const CHIME_GAIN = 0.2;

/** R9 (c): 탭 제목 깜빡임 주기. */
export const TITLE_BLINK_MS = 1000;
/** R9 (c) 의 문구 앞머리. 뒤에는 앱 셸이 쓰던 제목이 그대로 붙는다. */
export const COMPLETION_TITLE_PREFIX = '⏰ 끝!';

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | undefined {
  const scope = globalThis as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext;
}

/**
 * 차임 2회. **울렸으면 `true`, 막혔거나 Web Audio 가 없으면 `false`** — 호출부는 이 값으로
 * 무엇을 더 해야 할지 정할 수 있지만, 지금은 시각 신호가 이미 무조건 뜨므로 로그 용도다.
 */
export async function playFocusChime(): Promise<boolean> {
  const Ctor = audioContextCtor();
  if (Ctor === undefined) {
    return false;
  }
  let audio: AudioContext;
  try {
    audio = new Ctor();
  } catch {
    return false;
  }
  try {
    if (audio.state === 'suspended') {
      await audio.resume();
    }
    if (audio.state !== 'running') {
      // 사용자 제스처 없이 연 탭 — 자동재생 정책이 막았다. 조용히 실패하지 않고 시각 신호로 간다.
      void audio.close();
      return false;
    }
    let at = audio.currentTime;
    let endsAt = at;
    for (const tone of CHIME_TONES) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = tone.frequencyHz;
      gain.gain.value = CHIME_GAIN;
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(at);
      endsAt = at + tone.durationMs / 1000;
      osc.stop(endsAt);
      at = endsAt + CHIME_GAP_MS / 1000;
    }
    globalThis.setTimeout(() => void audio.close(), Math.ceil((at + 0.1) * 1000));
    return true;
  } catch {
    void audio.close();
    return false;
  }
}

function prefersReducedMotion(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

/** 설치된 신호 한 벌이 들고 있는 것. 모듈 안에만 있고 밖으로 새지 않는다. */
type Installed = {
  /** 앱 셸이 쓰던 제목. 걷을 때 그대로 되돌린다. */
  readonly base: string;
  blinkId: ReturnType<typeof setInterval> | null;
  /** 이미 차임을 울린 완료 세션 id. 인스턴스가 아니라 설치 한 벌이 기억하므로 중복이 없다. */
  playedId: string | null;
};

type Signals = { mounts: number; stop: (() => void) | null };

const signals: Signals = { mounts: 0, stop: null };

/** 테스트가 파일 사이로 새는 전역 상태를 끊을 때 쓴다(`resetTimerRuntime` 과 같은 목적). */
export function resetTimerSignals(): void {
  signals.stop?.();
  signals.mounts = 0;
  signals.stop = null;
}

/** (c) 탭 제목 — 완료면 깜빡임(R9 c), 아니면 실행 중 제목(R11)이나 원래 제목. */
function applyTitle(state: TimerState, installed: Installed): void {
  // R9-a: 오래된 완료(`record-only`)는 (c)를 주지 않는다 — 카드만 뜬다.
  if (state.completion?.signal === 'full') {
    const loud = `${COMPLETION_TITLE_PREFIX} · ${installed.base}`;
    if (installed.blinkId !== null) {
      return; // 이미 깜빡이는 중이다
    }
    document.title = loud;
    if (prefersReducedMotion()) {
      return; // 고정된 "끝!" 문구로 남는다
    }
    let on = true;
    installed.blinkId = globalThis.setInterval(() => {
      on = !on;
      document.title = on ? loud : installed.base;
    }, TITLE_BLINK_MS);
    return;
  }
  if (installed.blinkId !== null) {
    globalThis.clearInterval(installed.blinkId);
    installed.blinkId = null;
  }
  document.title = selectDocumentTitle(state, installed.base) ?? installed.base;
}

/** (b) 차임 — 막 끝난 완료(`full`)에만, 세션당 한 번, 소리를 켠 경우에만 (R9·R9-a). */
function applyChime(state: TimerState, installed: Installed): void {
  const completion = state.completion;
  if (completion === null || completion.signal !== 'full' || state.soundOff) {
    return;
  }
  if (installed.playedId === completion.session.id) {
    return;
  }
  installed.playedId = completion.session.id;
  void playFocusChime();
}

/** 신호 한 벌을 건다. 돌려주는 함수가 인터벌·구독·탭 제목을 전부 되돌린다. */
function install(): () => void {
  const installed: Installed = { base: document.title, blinkId: null, playedId: null };
  const apply = (state: TimerState): void => {
    applyTitle(state, installed);
    applyChime(state, installed);
  };

  apply(useTimerStore.getState());
  const unsubscribe = useTimerStore.subscribe(apply);

  return () => {
    unsubscribe();
    if (installed.blinkId !== null) {
      globalThis.clearInterval(installed.blinkId);
      installed.blinkId = null;
    }
    document.title = installed.base;
  };
}

/**
 * 소리 + 탭 제목을 한 벌만 건다. 패널이 접혀 있어도 도는 헤더 칩이 부르고, 패널도 같이 부른다 —
 * 둘 다 마운트돼도 차임은 한 번, 깜빡임 인터벌도 하나다.
 */
export function useTimerSignals(): void {
  useEffect(() => {
    signals.mounts += 1;
    if (signals.mounts === 1) {
      signals.stop = install();
    }
    return () => {
      signals.mounts -= 1;
      if (signals.mounts === 0) {
        signals.stop?.();
        signals.stop = null;
      }
    };
  }, []);
}
