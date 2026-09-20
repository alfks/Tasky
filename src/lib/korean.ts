// 한국어 조사 처리. 지금은 목적격 조사(을/를) 하나뿐이다.
//
// **`src/lib/` 에 있다 — 특정 feature 의 것이 아니다.** category(삭제 확인·되돌리기 토스트)와
// todo(삭제 확인·순서 이동 낭독)가 각자 사본을 갖고 있었다 — 동작은 같고 반환 타입만 달랐다
// (`src/features/AGENTS.md` 규칙 5). 셋 다 feature 어휘(`Todo`·`Category` 타입, 화면 문구, 스토어)를
// 모르는 순수 함수라 이 자리로 올렸다. `src/lib/AGENTS.md` "무엇이 여기 올라오는가" 참고.

const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;
const JONGSEONG_COUNT = 28;

/**
 * 목적격 조사 — 받침이 있으면 '을', 없으면 '를'.
 *
 * `'장보기'를 삭제할까요?` 처럼 사용자가 쓴 제목이 그대로 문장에 들어가는 자리는 `을(를)` 로
 * 도망치지 않고 실제 글자를 고른다. 한글 음절(U+AC00~U+D7A3)만 받침을 계산한다. 영문·숫자·이모지
 * 등 한글이 아닌 끝 글자와 빈 문자열은 표기 관행상 더 흔한 '를' 로 둔다(서러게이트 쌍의 뒤쪽 코드
 * 유닛도 한글 범위 밖이라 같은 가지로 떨어진다).
 */
export function objectParticle(word: string): '을' | '를' {
  const last = word.at(-1);
  if (last === undefined) return '를';
  const code = last.codePointAt(0) ?? 0;
  if (code < HANGUL_FIRST || code > HANGUL_LAST) return '를';
  return (code - HANGUL_FIRST) % JONGSEONG_COUNT === 0 ? '를' : '을';
}
