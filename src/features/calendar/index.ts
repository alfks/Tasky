// 공개 API 배럴 — src/ 에서 index.ts 가 허용되는 유일한 위치(code-style.md §2).
// 명시 export 만 둔다. 앱 셸(ShellInsights)이 여기서 꺼내 슬롯에 마운트한다.
export { DdayPanelSection } from '@/features/calendar/components/DdayPanelSection';
export { useDdayStore, type DdayState, type DdayStore } from '@/features/calendar/store/dday-store';
