// 다이어리 기분 이모지 제공 목록 (diary.md §2·R3). category.md R4-a와 같은 결정(자유 입력 아님,
// 제공 목록에서만 고른다) — 하지만 **다른 축**이다. 카테고리 이모지(`@/domain/theme/emoji`)는
// "무슨 활동인가"를 뜻하고, 이 목록은 "오늘 기분이 어땠는가"를 뜻한다. 두 목록을 하나로 묶으면
// 카테고리 칸에 "슬픔"이, 다이어리 칸에 "책"이 섞여 나온다 — 섞이지 않도록 별도 상수로 둔다.
//
// 왜 24개(6의 배수)인가: 화면 `EmojiPicker`(`@/components/ui/EmojiPicker`)가 6열 격자로 그린다 —
// 카테고리 이모지 피커와 **같은 컴포넌트, 같은 조작**(radiogroup, 방향키, Home/End)을 그대로 쓴다
// (diary.md §2 "제공 목록에서 고른다(category.md R4-a와 동일 원칙)"). 24 = 6×4, 네 갈래 × 6개.
//
// "없음" 칸은 이 목록에 넣지 않는다 — `EmojiPicker`가 항상 첫 칸으로 자동으로 붙여 준다(그 컴포넌트
// 주석 `NONE_OPTION` 참고). 여기는 실제로 고를 수 있는 감정 24개만 담는다.

/** 제공 기분 이모지 한 칸. `name`은 라디오의 접근 이름이 된다 — 감정의 **이름**이다. */
export type MoodEmoji = {
  /** 저장되는 값. 정확히 1 grapheme. */
  emoji: string;
  /** 한국어 감정 이름. 낭독·툴팁에 그대로 쓰인다. */
  name: string;
};

/**
 * 제공 목록 24개. 네 갈래를 이어 붙인 것이고, 화면에서는 6열 격자에 평평하게 깔린다(카테고리
 * 이모지와 같은 리듬).
 *
 * 1. 기쁨·설렘 — 좋은 하루를 남길 때 가장 먼저 찾는 칸.
 * 2. 평온·무덤덤 — 특별할 것 없던 하루, 딱히 좋지도 나쁘지도 않은 기분.
 * 3. 슬픔·지침 — 힘들었던 하루.
 * 4. 화남·불안 — 스트레스 받은 하루.
 */
export const MOOD_EMOJIS: readonly MoodEmoji[] = [
  // 1. 기쁨·설렘
  { emoji: '😄', name: '기쁨' },
  { emoji: '🥰', name: '사랑스러움' },
  { emoji: '🥳', name: '신남' },
  { emoji: '😌', name: '편안함' },
  { emoji: '🤩', name: '설렘' },
  { emoji: '😊', name: '미소' },
  // 2. 평온·무덤덤
  { emoji: '😐', name: '무덤덤함' },
  { emoji: '🤔', name: '고민' },
  { emoji: '😶', name: '말없음' },
  { emoji: '🧘', name: '차분함' },
  { emoji: '😴', name: '졸림' },
  { emoji: '🥱', name: '피곤함' },
  // 3. 슬픔·지침
  { emoji: '😢', name: '슬픔' },
  { emoji: '😭', name: '울음' },
  { emoji: '😞', name: '속상함' },
  { emoji: '😔', name: '낙담' },
  { emoji: '🥺', name: '서러움' },
  { emoji: '😪', name: '지침' },
  // 4. 화남·불안
  { emoji: '😠', name: '화남' },
  { emoji: '😡', name: '분노' },
  { emoji: '😤', name: '답답함' },
  { emoji: '😰', name: '불안' },
  { emoji: '😨', name: '긴장' },
  { emoji: '😮', name: '놀람' },
];

/** 제공 목록에서 찾는다. 목록 밖 값이면 `undefined` — 오류가 아니다(`findCategoryEmoji`와 같은 태도). */
export function findMoodEmoji(value: string): MoodEmoji | undefined {
  return MOOD_EMOJIS.find((option) => option.emoji === value);
}
