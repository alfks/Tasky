import { describe, expect, it } from 'vitest';

import { validateCategoryEmoji } from '@/domain/category/category.rules';
import { CATEGORY_EMOJIS, findCategoryEmoji } from '@/domain/theme/emoji';

describe('CATEGORY_EMOJIS', () => {
  it('6열 격자에 꼭 맞는 개수다 (6의 배수)', () => {
    expect(CATEGORY_EMOJIS.length % 6).toBe(0);
    expect(CATEGORY_EMOJIS.length).toBeGreaterThanOrEqual(24);
  });

  // 제공 목록이 도메인 규칙(R4: 0 또는 1 grapheme)을 스스로 어기면 고른 순간 저장이 실패한다.
  // ZWJ·이형 선택자(✏️·✈️·❤️ 는 뒤에 U+FE0F 가 붙는다)가 2 grapheme 으로 세지는 함정을 여기서 막는다.
  it('모든 항목이 카테고리 이모지 검증을 그대로 통과한다 (R4)', () => {
    for (const option of CATEGORY_EMOJIS) {
      expect(validateCategoryEmoji(option.emoji)).toBe(option.emoji);
    }
  });

  it('이모지도 뜻 이름도 중복이 없다', () => {
    expect(new Set(CATEGORY_EMOJIS.map((o) => o.emoji)).size).toBe(CATEGORY_EMOJIS.length);
    expect(new Set(CATEGORY_EMOJIS.map((o) => o.name)).size).toBe(CATEGORY_EMOJIS.length);
  });

  // 이름은 낭독되는 유일한 정보다(그림은 aria-hidden). 빈 이름·이모지를 그대로 쓴 이름은 뜻을 말하지 못한다.
  it('이름은 뜻을 말하는 한국어 문자열이다', () => {
    for (const option of CATEGORY_EMOJIS) {
      expect(option.name.trim()).toBe(option.name);
      expect(option.name.length).toBeGreaterThan(0);
      expect(option.name).not.toContain(option.emoji);
    }
  });

  // 첫 실행 시드가 📝 를 쓴다(category R18) — 목록에 없으면 시드 카테고리를 열자마자
  // "직접 고른 이모지" 칸으로 떨어진다.
  it('첫 실행 시드 이모지가 목록에 있다 (R18)', () => {
    expect(findCategoryEmoji('📝')?.name).toBe('메모');
  });
});

describe('findCategoryEmoji', () => {
  it('목록 밖 값은 오류가 아니라 undefined 다', () => {
    expect(findCategoryEmoji('🦄')).toBeUndefined();
    expect(findCategoryEmoji('')).toBeUndefined();
    expect(findCategoryEmoji('가')).toBeUndefined();
  });
});
