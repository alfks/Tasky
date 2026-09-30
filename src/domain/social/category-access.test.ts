import { describe, expect, it } from 'vitest';

import { canReadCategory, canReactToCategory } from '@/domain/social/category-access';
import { VISIBILITY_READ_VECTORS } from '@/domain/social/visibility-vectors';

describe('현재 category 권한', () => {
  for (const vector of VISIBILITY_READ_VECTORS) {
    it(`R4/R12/R13 ${vector.name}`, () => {
      expect(canReadCategory(vector.facts)).toBe(vector.readable);
      expect(canReactToCategory(vector.facts)).toBe(vector.reactive);
    });
  }
  it('R6 삭제/비활성 작성자/만료 viewer에서 새 읽기를 허용하지 않는다', () => {
    const facts = VISIBILITY_READ_VECTORS.find(
      (vector) => vector.name === 'public/stranger',
    )!.facts;
    expect(canReadCategory({ ...facts, categoryActive: false })).toBe(false);
    expect(canReadCategory({ ...facts, ownerActive: false })).toBe(false);
    expect(canReadCategory({ ...facts, viewerActive: false })).toBe(false);
  });
});
