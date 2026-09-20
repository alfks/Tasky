// 다이어리 화면의 한국어 문구.
//
// 목적격 조사(을/를)는 `@/lib/korean#objectParticle` 이다 — category·todo 의 삭제 확인·되돌리기
// 문구도 같은 규칙을 쓴다(T-87, `src/lib/AGENTS.md` 규칙 5).
import { objectParticle } from '@/lib/korean';

/** 카드가 가리키는 대상의 고정 이름. 카테고리와 달리 다이어리 기록은 사용자가 이름을 붙이지 않는다. */
const DIARY_ENTRY_LABEL = '오늘의 기록';

/** 삭제 되돌리기 토스트 문구 (diary R4). */
export function diaryRemovalToastMessage(): string {
  return `'${DIARY_ENTRY_LABEL}'${objectParticle(DIARY_ENTRY_LABEL)} 삭제했어요`;
}
