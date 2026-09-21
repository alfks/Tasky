import { describe, expect, it } from 'vitest';

import { applyServerRules } from '@/domain/sync/server-rules';
import { SERVER_RULE_VECTORS } from '@/domain/sync/server-rules.vectors';

describe('applyServerRules — 고정 벡터', () => {
  for (const vector of SERVER_RULE_VECTORS) {
    it(vector.name, () => {
      expect(applyServerRules(vector.existing, vector.change)).toBe(vector.expected);
    });
  }
});

describe('applyServerRules — 두 줄 규칙의 경계', () => {
  it('생성 판정은 오직 baseSeq === 0 여부로만 갈린다(음수·소수 등은 도메인이 만들지 않는다고 가정)', () => {
    expect(applyServerRules(undefined, { tbl: 'todos', id: 'x', baseSeq: 1 })).toBe('insert');
    expect(applyServerRules(undefined, { tbl: 'todos', id: 'x', baseSeq: 0 })).toBe('insert');
  });

  it('existing 이 있고 baseSeq 가 0 초과면 existing.deleted 값과 무관하게 항상 update', () => {
    expect(
      applyServerRules(
        { tbl: 'todos', id: 'x', deleted: false },
        { tbl: 'todos', id: 'x', baseSeq: 5 },
      ),
    ).toBe('update');
    expect(
      applyServerRules(
        { tbl: 'todos', id: 'x', deleted: true },
        { tbl: 'todos', id: 'x', baseSeq: 5 },
      ),
    ).toBe('update');
  });
});
