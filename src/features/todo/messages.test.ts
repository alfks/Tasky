import { describe, expect, it } from 'vitest';

import { TODO_MESSAGES as M } from '@/features/todo/messages';

describe('pickDateHint — 제목이 길면 제목 쪽을 자르고 질문은 남긴다(R10-b, 리뷰 라운드2 Minor)', () => {
  it('짧은 제목은 그대로 + 목적격 조사', () => {
    expect(M.pickDateHint('산책')).toBe("'산책'을 어느 날로 옮길까요?");
    expect(M.pickDateHint('독서')).toBe("'독서'를 어느 날로 옮길까요?");
  });

  it('14자를 넘으면 14자 + … 로 자르고, 조사는 잘린 뒤 글자(…)를 기준으로 붙는다', () => {
    const long = '아주 긴 제목의 할 일 이름이 여기까지 이어지면 어떻게 될까';
    const hint = M.pickDateHint(long);
    expect(hint).toBe("'아주 긴 제목의 할 일 이…'를 어느 날로 옮길까요?");
    expect(hint.endsWith('어느 날로 옮길까요?')).toBe(true);
  });

  it('정확히 14자면 자르지 않는다', () => {
    const exact = '가나다라마바사아자차카타파하';
    expect(exact).toHaveLength(14);
    expect(M.pickDateHint(exact)).toBe("'가나다라마바사아자차카타파하'를 어느 날로 옮길까요?");
  });
});
