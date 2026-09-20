// 공개 API 배럴 — src/ 에서 index.ts 가 허용되는 유일한 위치(code-style.md §2). 명시 export 만 둔다.
//
// 셸(`ShellMain`)이 꺼내는 것은 `DiaryCard` 하나다 — 날짜 화면 하단에 마운트한다(diary.md §2).
// `useDiaryStore` 는 `ShellMain.test.tsx`(shell feature)가 테스트 사이 상태를 되돌리는 데 쓴다 —
// `useTodoStore`·`useCategoryStore` 를 같은 이유로 각자의 배럴이 내보내는 것과 같다.
export { DiaryCard } from '@/features/diary/components/DiaryCard';
export { useDiaryStore } from '@/features/diary/store/diary-store';
