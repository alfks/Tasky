// 공개 API 배럴 — src/ 에서 index.ts 가 허용되는 유일한 위치(code-style.md §2).
// 명시 export 만 둔다. 앱 셸(T-20)이 여기서 꺼내 슬롯에 마운트한다.
export { CompletionHeader } from '@/features/stats/components/CompletionHeader';
export { CompletionPanelSection } from '@/features/stats/components/CompletionPanelSection';
export { CompletionRing } from '@/features/stats/components/CompletionRing';

export {
  completionAnnouncement,
  completionCountText,
  completionPercentText,
  completionRingLabel,
} from '@/features/stats/completion-view';
export type { CompletionSummary } from '@/features/stats/completion-view';

export { useCompletion } from '@/features/stats/hooks/useCompletion';
