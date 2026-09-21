import { describe, expect, it } from 'vitest';

import { applyServerRules, clampFutureUpdatedAt } from '@/domain/sync/server-rules';
import { SERVER_RULE_VECTORS } from '@/domain/sync/server-rules.vectors';

describe('applyServerRules — 고정 벡터', () => {
  for (const vector of SERVER_RULE_VECTORS) {
    it(vector.name, () => {
      expect(applyServerRules(vector.existing, vector.change)).toBe(vector.expected);
    });
  }
});

describe('applyServerRules — 규칙의 경계', () => {
  it('생성 판정은 오직 baseSeq === 0(숫자) 여부로만 갈린다', () => {
    expect(applyServerRules(undefined, { tbl: 'todos', id: 'x', baseSeq: 1, updatedAt: 'a' })).toBe(
      'insert',
    );
    expect(applyServerRules(undefined, { tbl: 'todos', id: 'x', baseSeq: 0, updatedAt: 'a' })).toBe(
      'insert',
    );
  });

  it('existing 이 있고 baseSeq 가 0 초과면 existing.deleted 값과 무관하게 LWW 로만 갈린다', () => {
    expect(
      applyServerRules(
        { tbl: 'todos', id: 'x', deleted: false, updatedAt: '2026-01-01T00:00:00.000Z' },
        { tbl: 'todos', id: 'x', baseSeq: 5, updatedAt: '2026-01-02T00:00:00.000Z' },
      ),
    ).toBe('update');
    expect(
      applyServerRules(
        { tbl: 'todos', id: 'x', deleted: true, updatedAt: '2026-01-01T00:00:00.000Z' },
        { tbl: 'todos', id: 'x', baseSeq: 5, updatedAt: '2026-01-02T00:00:00.000Z' },
      ),
    ).toBe('update');
    // deleted 값이 바뀌어도, updatedAt 이 지면 여전히 reject-stale — deleted 는 판정에 영향 없다.
    expect(
      applyServerRules(
        { tbl: 'todos', id: 'x', deleted: false, updatedAt: '2026-01-05T00:00:00.000Z' },
        { tbl: 'todos', id: 'x', baseSeq: 5, updatedAt: '2026-01-02T00:00:00.000Z' },
      ),
    ).toBe('reject-stale');
    expect(
      applyServerRules(
        { tbl: 'todos', id: 'x', deleted: true, updatedAt: '2026-01-05T00:00:00.000Z' },
        { tbl: 'todos', id: 'x', baseSeq: 5, updatedAt: '2026-01-02T00:00:00.000Z' },
      ),
    ).toBe('reject-stale');
  });

  it('(tbl,id) 가 다른 existing/change 조합은 던진다 — 호출부 버그를 조용히 삼키지 않는다', () => {
    expect(() =>
      applyServerRules(
        { tbl: 'todos', id: 'x', deleted: false, updatedAt: '2026-01-01T00:00:00.000Z' },
        { tbl: 'todos', id: 'y', baseSeq: 5, updatedAt: '2026-01-02T00:00:00.000Z' },
      ),
    ).toThrow();
    expect(() =>
      applyServerRules(
        { tbl: 'todos', id: 'x', deleted: false, updatedAt: '2026-01-01T00:00:00.000Z' },
        { tbl: 'categories', id: 'x', baseSeq: 5, updatedAt: '2026-01-02T00:00:00.000Z' },
      ),
    ).toThrow();
  });
});

describe('clampFutureUpdatedAt', () => {
  it('updatedAt 이 수신 시각보다 미래면 수신 시각으로 내려 앉힌다', () => {
    expect(clampFutureUpdatedAt('2026-06-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });

  it('updatedAt 이 수신 시각보다 과거면 그대로 둔다', () => {
    expect(clampFutureUpdatedAt('2026-01-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z')).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });

  it('정확히 같으면 그대로 둔다(멱등)', () => {
    expect(clampFutureUpdatedAt('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });
});
