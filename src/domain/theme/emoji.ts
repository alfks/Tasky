// 카테고리 이모지 제공 목록 (category.md §2-B·R4). 팔레트 12색(`palette.ts`)과 같은 성격의 상수다 —
// **이 앱이 정한 고정 집합**이고, 저장되는 값은 이모지 문자 그 자체다(`Category.emoji`).
//
// 왜 고정 목록인가: 자유 입력은 이모지가 아닌 글자·여러 글자·빈 문자열을 그대로 받아
// 사이드바 한 줄의 리듬을 깨뜨린다. 색을 12개로 좁힌 것과 같은 결정이다(theme R3).
//
// 왜 30개인가(6의 배수):
//  - 화면: 색 스와치와 **같은 6열 격자**에 올린다(같은 다이얼로그, 같은 리듬). 6의 배수가 아니면
//    마지막 줄이 비어 격자가 어긋난다. 30 = 6×5.
//  - 인지: 한 화면에서 고르는 목록은 훑을 수 있어야 한다. 수백 개짜리 전체 이모지 목록은 검색이
//    필요해지고, 검색은 이 다이얼로그가 감당할 크기가 아니다(§6 범위 밖의 커스텀 HEX 와 같은 이유).
//  - 포괄: 아래 5갈래 × 6개면 할 일 앱에서 실제로 만드는 카테고리(공부·운동·집안일·취미·약속)가
//    모두 자기 칸을 갖는다. 갈래는 **선정 근거**이지 화면의 줄 구분이 아니다(격자는 평평하다).
//
// 목록에 없는 이모지는 **막지 않는다** — 자유 입력 시절에 저장된 값이 남아 있을 수 있고 그것은
// 사용자 데이터다. 도메인 검증(`validateCategoryEmoji`)은 지금처럼 "0 또는 1 grapheme" 만 보고,
// 목록 밖 값은 피커가 "직접 고른 이모지" 칸으로 그대로 보여 준다(`EmojiPicker`).

/** 제공 이모지 한 칸. `name` 은 라디오의 접근 이름이 된다 — 색 이름이 아니라 **뜻**이다(category §5). */
export type CategoryEmoji = {
  /** 저장되는 값. 정확히 1 grapheme. */
  emoji: string;
  /** 한국어 뜻. 낭독·툴팁에 그대로 쓰인다. */
  name: string;
};

/**
 * 제공 목록 30개. 순서는 아래 다섯 갈래를 이어 붙인 것이고, 화면에서는 6열 격자에 평평하게 깔린다.
 *
 * 1. 일·공부 — 가장 흔한 카테고리. 첫 실행 시드가 쓰는 📝 가 맨 앞이다(category R18).
 * 2. 몸·건강 — 운동/식단/수면처럼 매일 반복되는 갈래.
 * 3. 집·생활 — 집안일·장보기·돈 관리.
 * 4. 마음·취미 — 창작·놀이·돌봄.
 * 5. 약속·표시 — 특정 활동이 아니라 "중요" 를 뜻하는 표식까지 남겨 둔다(⭐❤️🔥).
 */
export const CATEGORY_EMOJIS: readonly CategoryEmoji[] = [
  // 1. 일·공부
  { emoji: '📝', name: '메모' },
  { emoji: '📚', name: '책' },
  { emoji: '✏️', name: '연필' },
  { emoji: '💻', name: '노트북' },
  { emoji: '💼', name: '서류 가방' },
  { emoji: '📅', name: '달력' },
  // 2. 몸·건강
  { emoji: '🏃', name: '달리기' },
  { emoji: '💪', name: '근육' },
  { emoji: '🧘', name: '명상' },
  { emoji: '🥗', name: '샐러드' },
  { emoji: '💊', name: '약' },
  { emoji: '😴', name: '잠' },
  // 3. 집·생활
  { emoji: '🏠', name: '집' },
  { emoji: '🧹', name: '청소' },
  { emoji: '🧺', name: '빨래' },
  { emoji: '🍳', name: '요리' },
  { emoji: '🛒', name: '장보기' },
  { emoji: '💰', name: '돈' },
  // 4. 마음·취미
  { emoji: '🎨', name: '그림' },
  { emoji: '🎵', name: '음악' },
  { emoji: '🎮', name: '게임' },
  { emoji: '📷', name: '사진' },
  { emoji: '🌱', name: '새싹' },
  { emoji: '🐾', name: '반려동물' },
  // 5. 약속·표시
  { emoji: '✈️', name: '여행' },
  { emoji: '☕', name: '커피' },
  { emoji: '🎁', name: '선물' },
  { emoji: '⭐', name: '별' },
  { emoji: '❤️', name: '하트' },
  { emoji: '🔥', name: '불' },
];

/** 제공 목록에서 찾는다. 목록 밖 값이면 `undefined` — **오류가 아니다**(theme `findPaletteColor` 와 같은 태도). */
export function findCategoryEmoji(value: string): CategoryEmoji | undefined {
  return CATEGORY_EMOJIS.find((option) => option.emoji === value);
}
