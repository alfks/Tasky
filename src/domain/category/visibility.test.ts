import { describe, expect, it } from 'vitest';

import {
  categoryVisibility,
  clearCategoryVisibility,
  confirmCategoryVisibility,
  isCategoryVisibility,
} from '@/domain/category/visibility';

import { makeCategory } from '@/test/fixtures/category';
const deps = { now: () => '2026-09-30T12:00:00.000Z', id: () => 'unused' };
describe('개인 category 공개 표식', () => {
  it('R1 기존 자료와 불법 범위를 나만 보기로 해석한다', () => {
    expect(categoryVisibility(makeCategory())).toBe('private');
    expect(isCategoryVisibility('everyone')).toBe(false);
  });
  it('R7 canonical 결과를 브랜드 쓰기 경로로 저장하고 철회 연결을 지운다', () => {
    const original = makeCategory();
    const confirmed = confirmCategoryVisibility(
      original,
      { id: '00000000000000000000000000000001', visibility: 'public', version: 2 },
      deps,
    );
    expect(confirmed.rev).toBe(original.rev + 1);
    expect(categoryVisibility(confirmed)).toBe('public');
    const cleared = clearCategoryVisibility(confirmed, deps);
    expect(categoryVisibility(cleared)).toBe('private');
    expect(cleared.socialCategoryId).toBeUndefined();
    expect(original.socialCategoryId).toBeUndefined();
  });
  it('R11 위조된 원격 연결은 확인 결과로 저장하지 않는다', () => {
    expect(() =>
      confirmCategoryVisibility(
        makeCategory(),
        { id: 'personal-id', visibility: 'public', version: 1 },
        deps,
      ),
    ).toThrow();
    expect(() =>
      confirmCategoryVisibility(
        makeCategory(),
        { id: '00000000000000000000000000000001', visibility: 'public', version: -1 },
        deps,
      ),
    ).toThrow();
  });
});
