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

  // 아래 둘은 회귀가 아니라 **현 동작 고정**이다 — 실제 한국어 관행(숫자 "삼을", 괄호 "함을")과는
  // 다르지만 main 의 두 사본(category·todo)도 정확히 같은 값을 냈다. 테스트가 없으면 "개선"이라며
  // 조용히 값이 뒤집힐 수 있다 — 값을 바꾸려면 이 테스트를 먼저 고치고 근거를 남긴다.
  it('숫자로 끝나면 를 (현 동작 고정 — 한글 받침이 아니라 무조건 를)', () => {
    expect(objectParticle('3')).toBe('를');
  });

  it('괄호로 끝나면 를 (현 동작 고정)', () => {
    expect(objectParticle('장보기(급함)')).toBe('를');
  });
});
