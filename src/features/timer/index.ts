// 공개 API 배럴 — src/ 에서 index.ts 가 허용되는 유일한 위치(code-style.md §2).
//
// 이어받는 쪽:
// - **T-20(앱 셸)**: `<TimerChip onOpen={…}/>` 를 헤더 슬롯에, `<TimerPanelSection/>` 을 인사이트 패널
//   맨 위 슬롯에 마운트하기만 하면 된다. 적재·1초 갱신·완료 판정·소리·탭 제목은 두 컴포넌트가 스스로 건다
//   (참조 수를 세어 한 벌만 설치하므로 둘 다 마운트해도 인터벌은 하나다).
//   탭 제목은 마운트 시점의 `document.title` 을 기준으로 삼고 언마운트 때 되돌린다(app-shell R9 와 공존).
// - **T-19(커맨드 팔레트)**: `useTimerActions()` 의 `start`·`pause`·`resume`·`stop` 과
//   `useTimerPhase()` 로 명령의 활성 조건을 판단한다. 스토어 파일을 직접 import 하지 말 것.
export { TimerChip } from '@/features/timer/components/TimerChip';
export { TimerPanelSection } from '@/features/timer/components/TimerPanelSection';

export { useTimerActions, useTimerPhase } from '@/features/timer/hooks/useTimerActions';
export { useTimerRuntime } from '@/features/timer/hooks/useTimerRuntime';

export { createTimerStore, useTimerStore } from '@/features/timer/store/timer-store';
export type { TimerActions, TimerStore } from '@/features/timer/store/timer-store';
export type {
  TimerCompletion,
  TimerNotice,
  TimerPhase,
  TimerState,
} from '@/features/timer/store/timer-state';

export {
  formatClock,
  formatRecordedDuration,
  formatSpokenDuration,
  selectChipLabel,
  selectClockText,
  selectElapsedSeconds,
  selectRemainingSeconds,
  selectRingRatio,
  selectTimerPhase,
} from '@/features/timer/store/timer-selectors';
