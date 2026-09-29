// 다이어리 화면의 한국어 문구.
//
// 목적격 조사(을/를)는 `@/lib/korean#objectParticle` 이다 — category·todo 의 삭제 확인·되돌리기
// 문구도 같은 규칙을 쓴다(T-87, `src/lib/AGENTS.md` 규칙 5).
import { objectParticle } from '@/lib/korean';

/**
 * 카드·모달의 제목이자 `section` 의 접근 이름 — 날짜가 바뀌어도 고정이다(diary.md §2·§5).
 * 삭제 토스트가 가리키는 대상의 이름이기도 하다(카테고리와 달리 기록은 사용자가 이름을 붙이지 않는다).
 */
export const DIARY_CARD_TITLE = '오늘의 기록';

/** 삭제 되돌리기 토스트 문구 (diary R4). */
export function diaryRemovalToastMessage(): string {
  return `'${DIARY_CARD_TITLE}'${objectParticle(DIARY_CARD_TITLE)} 삭제했어요`;
}
