import { describe, expect, it } from 'vitest';

import { CARD_CLASS } from '@/components/ui/card-class';

// 상시 카드 면의 값은 app-shell.md §2-A-1(R16)이 단일 소스다 — 여기는 그 토큰들이 문자열에서 빠지거나
// 새 그림자·반경 값이 끼어들지 않았는지만 잠근다.
describe('CARD_CLASS', () => {
  const tokens = CARD_CLASS.split(/\s+/);

  it('면의 네 요소(반경·테두리·배경·그림자)와 안쪽 여백을 모두 담는다', () => {
    expect(tokens).toEqual(
      expect.arrayContaining([
        'rounded-[var(--radius-xl)]',
        'border',
        'border-border',
        'bg-surface',
        'shadow-sm',
        'p-[var(--space-3)]',
      ]),
    );
  });

  it('토큰 밖의 그림자·반경·배경 값을 새로 만들지 않는다', () => {
    expect(tokens.filter((t) => t.startsWith('shadow'))).toEqual(['shadow-sm']);
    expect(tokens.filter((t) => t.startsWith('rounded'))).toEqual(['rounded-[var(--radius-xl)]']);
    expect(tokens.filter((t) => t.startsWith('bg-'))).toEqual(['bg-surface']);
    expect(CARD_CLASS).not.toMatch(/#[0-9a-f]{3,8}|rgb\(|hsl\(/i);
  });
});
