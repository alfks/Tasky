import { describe, expect, it } from 'vitest';

import { parseCategoryInput, parseCategoryRevokeInput } from '@/domain/social/category-input';
import { parsePostInput } from '@/domain/social/input';
import { DEFAULT_ACCENT_COLOR } from '@/domain/theme/palette';
const INPUT = {
  name: '공부',
  color: DEFAULT_ACCENT_COLOR,
  visibility: 'friends',
  expectedVersion: 0,
};
const ID = '00000000000000000000000000000001';
describe('공개 category DTO', () => {
  it('R3 원본/owner/불법 범위를 받지 않는다', () => {
    expect(parseCategoryInput(INPUT).ok).toBe(true);
    for (const extra of [
      { ownerId: ID },
      { sourceId: ID },
      { memo: '비밀' },
      { visibility: 'everyone' },
      { name: '제목\n줄바꿈' },
      { emoji: '\u202e' },
      { emoji: '\u0000' },
    ])
      expect(parseCategoryInput({ ...INPUT, ...extra }).ok).toBe(false);
  });
  it('R7 version와 새 id/철회 입력을 검증한다', () => {
    expect(parseCategoryInput({ ...INPUT, expectedVersion: 1 }).ok).toBe(false);
    expect(parseCategoryInput({ ...INPUT, id: ID, expectedVersion: 1 }).ok).toBe(true);
    expect(parseCategoryRevokeInput({ id: ID, expectedVersion: 1 }).ok).toBe(true);
    expect(parseCategoryRevokeInput({ id: ID, expectedVersion: -1 }).ok).toBe(false);
  });
  it('R2 게시 category/version은 한 쌍이며 legacy와 구분한다', () => {
    const post = { text: '완료', happenedOn: '2026-09-30' };
    expect(parsePostInput(post).ok).toBe(true);
    expect(parsePostInput({ ...post, categoryId: ID }).ok).toBe(false);
    expect(parsePostInput({ ...post, categoryVersion: 1 }).ok).toBe(false);
    expect(parsePostInput({ ...post, categoryId: ID, categoryVersion: 1 }).ok).toBe(true);
  });
});
