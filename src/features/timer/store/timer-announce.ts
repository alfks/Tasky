// 낭독 정책 (timer §5). 링 자체는 `aria-live="off"` 라 매초 읽히지 않고, **여기서 고른 순간만**
// 별도의 `aria-live="polite"` 영역이 읽는다.
//
// 왜 이 정책인가:
// - 매초 낭독(`aria-live="polite"` 를 링에 걸기)은 스크린리더 사용자가 다른 어떤 것도 들을 수 없게 만든다.
// - 아무것도 읽지 않으면 남은 시간을 알 방법이 포커스 이동밖에 없다.
// 그래서 **상태가 바뀌는 순간**(시작·일시정지·재개·완료·중지)과 **5분 눈금을 넘는 순간**만 읽는다.
// 5분은 §5 가 정한 값이고, 25분 세션에서 낭독이 4번뿐이라는 뜻이다.
import { formatSpokenDuration } from '@/features/timer/store/timer-selectors';
import type { TimerPhase } from '@/features/timer/store/timer-state';

/** 낭독 눈금(초). §5 "5분 단위 남은 시간". */
export const ANNOUNCE_STEP_SECONDS = 300;

/** 낭독 판정에 필요한 최소 정보. 두 시점을 비교해 "무엇이 바뀌었나"를 본다. */
export type TimerAnnounceSnapshot = {
  readonly phase: TimerPhase;
  readonly remainingSeconds: number;
  /** 세션 신원. 바뀌면 다른 세션이다(`[5분 더]` 는 새 세션이다 — R10). */
  readonly sessionId: string | null;
  /** 완료 카드가 떠 있는가. `running → idle` 이 완료인지 중지인지 가른다. */
  readonly completed: boolean;
};

/**
 * 남은 시간이 속한 5분 눈금. `ceil` 이라 정확히 900초일 때 3(=15분)이 되고, 901초는 4 다 —
 * 즉 눈금이 내려가는 순간이 "15분 남음" 을 말할 바로 그 순간이다.
 */
function stepOf(remainingSeconds: number): number {
  return Math.ceil(Math.max(0, remainingSeconds) / ANNOUNCE_STEP_SECONDS);
}

/**
 * 두 시점 사이에 읽어 줄 문구. 읽을 것이 없으면 `null`.
 * 순수 함수라 인터벌이 몇 번 건너뛰어도(백그라운드 스로틀링) 마지막 눈금 하나만 읽고 넘어간다.
 */
export function timerAnnouncement(
  prev: TimerAnnounceSnapshot,
  next: TimerAnnounceSnapshot,
): string | null {
  if (!prev.completed && next.completed) {
    return '집중이 끝났어요';
  }
  if (next.sessionId !== prev.sessionId && next.phase === 'running') {
    return `집중 ${formatSpokenDuration(next.remainingSeconds)} 시작`;
  }
  if (prev.phase !== 'idle' && next.phase === 'idle') {
    return '집중을 중지했어요';
  }
  if (prev.phase === 'running' && next.phase === 'paused') {
    return `일시정지, ${formatSpokenDuration(next.remainingSeconds)} 남음`;
  }
  if (prev.phase === 'paused' && next.phase === 'running') {
    return `재개, ${formatSpokenDuration(next.remainingSeconds)} 남음`;
  }
  if (
    next.phase === 'running' &&
    next.remainingSeconds > 0 &&
    stepOf(next.remainingSeconds) < stepOf(prev.remainingSeconds)
  ) {
    return `${(stepOf(next.remainingSeconds) * ANNOUNCE_STEP_SECONDS) / 60}분 남음`;
  }
  return null;
}
