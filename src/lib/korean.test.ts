import { describe, expect, it } from 'vitest';

import { objectParticle } from '@/lib/korean';

describe('objectParticle', () => {
  it('받침이 있으면 을', () => {
    expect(objectParticle('운동')).toBe('을');
  });

  it('받침이 없으면 를', () => {
    expect(objectParticle('공부')).toBe('를');
  });

  it('한글이 아닌 글자로 끝나면 를', () => {
    expect(objectParticle('Tasky')).toBe('를');
  });

  it('빈 문자열이면 를', () => {
    expect(objectParticle('')).toBe('를');
  });

  it('이모지로 끝나면 를 — 서러게이트 쌍의 뒤쪽 코드 유닛도 한글 범위 밖이다', () => {
    expect(objectParticle('생일🎂')).toBe('를');
  });
});
