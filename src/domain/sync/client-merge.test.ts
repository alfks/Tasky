import { describe, expect, it } from 'vitest';

import { planClientMerge } from '@/domain/sync/client-merge';
import { CLIENT_MERGE_VECTORS } from '@/domain/sync/client-merge.vectors';

describe('planClientMerge — ①-5 표 고정 벡터', () => {
  for (const vector of CLIENT_MERGE_VECTORS) {
    it(vector.name, () => {
      expect(planClientMerge(vector.input)).toEqual(vector.expected);
    });
  }
});

describe('planClientMerge — 표 밖 확인', () => {
  it('아웃박스에 없으면 rev 값과 무관하게 항상 덮어쓴다(서버가 진실)', () => {
    const highRev = { id: 'x', createdAt: 't', updatedAt: 't', rev: 99 };
    expect(planClientMerge({ local: highRev, inOutbox: false })).toEqual({
      action: 'adopt-remote',
    });
  });
});
