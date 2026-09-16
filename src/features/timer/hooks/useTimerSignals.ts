'use client';

// 완료 신호 중 (b) 소리와 (c) 탭 제목 (timer R9·R9-a·R11). (a) 패널 카드는 컴포넌트가 그린다.
//
// **소리는 정보의 유일한 통로가 아니다.** 자동재생 정책으로 차임이 막히면 `playFocusChime()` 이
// `false` 를 돌려주고 끝이며, 카드(a)와 탭 제목(c)은 그대로 남는다 — 조용히 아무 일도 없는 상태가 되지 않는다.
// 모션 축소를 선호하면 탭 제목은 깜빡이지 않고 고정된 "끝!" 문구로 남는다(theme R5 의 취지).
import { useEffect, useRef } from 'react';

import { selectDocumentTitle } from '@/features/timer/store/timer-selectors';
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

/** 실행 중 탭 제목(R11)과 완료 깜빡임(R9 c). 앱 셸이 쓰던 제목을 기억했다가 되돌린다. */
function useTimerTitle(): void {
  const baseRef = useRef<string>('');
  const session = useTimerStore((state) => state.session);
  const now = useTimerStore((state) => state.now);
  const todoTitle = useTimerStore((state) => state.todoTitle);
  const blinking = useTimerStore((state) => state.completion?.signal === 'full');

  useEffect(() => {
    baseRef.current = document.title;
    return () => {
      document.title = baseRef.current;
    };
  }, []);

  useEffect(() => {
    const base = baseRef.current;
    if (blinking) {
      const loud = `${COMPLETION_TITLE_PREFIX} · ${base}`;
      document.title = loud;
      if (prefersReducedMotion()) {
        return undefined;
      }
      let on = true;
      const id = globalThis.setInterval(() => {
        on = !on;
        document.title = on ? loud : base;
      }, TITLE_BLINK_MS);
      return () => {
        globalThis.clearInterval(id);
        document.title = base;
      };
    }
    const running = selectDocumentTitle({ session, now, todoTitle }, base);
    document.title = running ?? base;
    return undefined;
  }, [blinking, session, now, todoTitle]);
}

/** 완료 순간의 차임 (R9 b). `record-only` 등급(R9-a)이거나 소리를 껐으면 울리지 않는다. */
function useCompletionChime(): void {
  const signal = useTimerStore((state) => state.completion?.signal ?? null);
  const sessionId = useTimerStore((state) => state.completion?.session.id ?? null);
  const soundOff = useTimerStore((state) => state.soundOff);
  const playedRef = useRef<string | null>(null);

  useEffect(() => {
    if (sessionId === null || signal !== 'full' || soundOff) {
      return;
    }
    if (playedRef.current === sessionId) {
      return;
    }
    playedRef.current = sessionId;
    void playFocusChime();
  }, [sessionId, signal, soundOff]);
}

/** 소리 + 탭 제목을 한 번에 건다. 패널이 접혀 있어도 도는 헤더 칩이 부른다. */
export function useTimerSignals(): void {
  useTimerTitle();
  useCompletionChime();
}
