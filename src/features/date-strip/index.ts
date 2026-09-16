// 공개 API 배럴 — src/ 에서 index.ts 가 허용되는 유일한 위치(code-style.md §2).
// 명시 export 만 둔다. 내부 파일은 이 배럴을 import 하지 않는다(순환).
export { DateStrip } from '@/features/date-strip/components/DateStrip';
export { TODO_DRAG_MIME } from '@/features/date-strip/components/DateCell';
export { MAX_DATE_KEY, MIN_DATE_KEY } from '@/features/date-strip/lib/week';
export {
  useDateStripStore,
  type DateStripState,
} from '@/features/date-strip/store/date-strip-store';
