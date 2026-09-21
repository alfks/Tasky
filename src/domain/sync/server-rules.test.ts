import { describe, expect, it } from 'vitest';

import { applyServerRules, clampFutureUpdatedAt } from '@/domain/sync/server-rules';
import { SERVER_RULE_VECTORS } from '@/domain/sync/server-rules.vectors';

describe('applyServerRules — 고정 벡터', () => {
  for (const vector of SERVER_RULE_VECTORS) {
    it(vector.name, () => {
      expect(applyServerRules(vector.existing, vector.change, vector.receivedAt)).toBe(
        vector.expected,
      );
    });
  }
});

describe('applyServerRules — 고정 벡터의 id 는 서로 구별된다(회귀 방지)', () => {
  it('벡터 스프레드 순서 회귀 — updatedAtAt() 스프레드가 리터럴 id 를 덮으면 여러 벡터가 같은 id 로 뭉개진다', () => {
    const idsByTable = new Map<string, Set<string>>();
    for (const vector of SERVER_RULE_VECTORS) {
      for (const row of [vector.existing, vector.change]) {
        if (row === undefined) continue;
        const ids = idsByTable.get(row.tbl) ?? new Set<string>();
        ids.add(row.id);
        idsByTable.set(row.tbl, ids);
      }
    }
    // updatedAtAt() 이 만드는 Meta.id 는 항상 'v' — 벡터의 실제 의도 id('a'~'n') 는 절대 'v' 가
    // 아니어야 한다. 스프레드 순서가 되돌아가 id 를 덮으면 이 단언이 깨진다.
    for (const ids of idsByTable.values()) {
      expect(ids.has('v')).toBe(false);
    }
    // todos 테이블 벡터들의 의도된 id 가 전부 살아있는지도 직접 확인한다(런타임 덤프 — 타입만
    // 보고 됐다고 하지 않는다).
    expect([...(idsByTable.get('todos') ?? [])].sort()).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
      'i',
      'j',
      'k',
      'l',
      'm',
      'n',
    ]);
  });
});

describe('applyServerRules — 규칙의 경계', () => {
  it('생성 판정은 오직 baseSeq === 0(숫자) 여부로만 갈린다', () => {
    expect(
      applyServerRules(undefined, { tbl: 'todos', id: 'x', baseSeq: 1, updatedAt: 'a' }, 'a'),
    ).toBe('insert');
    expect(
      applyServerRules(undefined, { tbl: 'todos', id: 'x', baseSeq: 0, updatedAt: 'a' }, 'a'),
    ).toBe('insert');
  });

  it('existing 이 있고 baseSeq 가 0 초과면 existing.deleted 값과 무관하게 LWW 로만 갈린다', () => {
    expect(
      applyServerRules(
        { tbl: 'todos', id: 'x', deleted: false, updatedAt: '2026-01-01T00:00:00.000Z' },
        { tbl: 'todos', id: 'x', baseSeq: 5, updatedAt: '2026-01-02T00:00:00.000Z' },
        '2026-01-02T00:00:00.000Z',
      ),
    ).toBe('update');
    expect(
      applyServerRules(
        { tbl: 'todos', id: 'x', deleted: true, updatedAt: '2026-01-01T00:00:00.000Z' },
        { tbl: 'todos', id: 'x', baseSeq: 5, updatedAt: '2026-01-02T00:00:00.000Z' },
        '2026-01-02T00:00:00.000Z',
      ),
    ).toBe('update');
    // deleted 값이 바뀌어도, updatedAt 이 지면 여전히 reject-stale — deleted 는 판정에 영향 없다.
    expect(
      applyServerRules(
        { tbl: 'todos', id: 'x', deleted: false, updatedAt: '2026-01-05T00:00:00.000Z' },
        { tbl: 'todos', id: 'x', baseSeq: 5, updatedAt: '2026-01-02T00:00:00.000Z' },
        '2026-01-02T00:00:00.000Z',
      ),
    ).toBe('reject-stale');
    expect(
      applyServerRules(
        { tbl: 'todos', id: 'x', deleted: true, updatedAt: '2026-01-05T00:00:00.000Z' },
        { tbl: 'todos', id: 'x', baseSeq: 5, updatedAt: '2026-01-02T00:00:00.000Z' },
        '2026-01-02T00:00:00.000Z',
      ),
    ).toBe('reject-stale');
  });

  it('(tbl,id) 가 다른 existing/change 조합은 던진다 — 호출부 버그를 조용히 삼키지 않는다', () => {
    expect(() =>
      applyServerRules(
        { tbl: 'todos', id: 'x', deleted: false, updatedAt: '2026-01-01T00:00:00.000Z' },
        { tbl: 'todos', id: 'y', baseSeq: 5, updatedAt: '2026-01-02T00:00:00.000Z' },
        '2026-01-02T00:00:00.000Z',
      ),
    ).toThrow();
    expect(() =>
      applyServerRules(
        { tbl: 'todos', id: 'x', deleted: false, updatedAt: '2026-01-01T00:00:00.000Z' },
        { tbl: 'categories', id: 'x', baseSeq: 5, updatedAt: '2026-01-02T00:00:00.000Z' },
        '2026-01-02T00:00:00.000Z',
      ),
    ).toThrow();
  });

  it('receivedAt 클램프: change.updatedAt 이 receivedAt 보다 미래면 receivedAt 으로 클램프한 뒤 LWW 판정한다', () => {
    expect(
      applyServerRules(
        { tbl: 'todos', id: 'x', deleted: false, updatedAt: '2026-06-01T00:00:00.000Z' },
        { tbl: 'todos', id: 'x', baseSeq: 5, updatedAt: '2099-01-01T00:00:00.000Z' },
        '2026-01-01T00:00:00.000Z', // existing 보다도 이른 수신 시각 — 클램프하면 반드시 진다
      ),
    ).toBe('reject-stale');
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
