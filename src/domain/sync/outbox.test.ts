import { describe, expect, it } from 'vitest';

import {
  deriveBaseSeq,
  QUARANTINE_AFTER_CONSECUTIVE_INVALID,
  reconcileAck,
  shouldQuarantine,
  takeOutboxBatch,
  toSyncChange,
  type OutboxEntry,
} from '@/domain/sync/outbox';

describe('deriveBaseSeq', () => {
  it('rev 1(생성 후 미변경)은 baseSeq 0 — 생성 시도', () => {
    expect(deriveBaseSeq(1)).toBe(0);
  });

  it('rev 1 미만(방어적 — 실제로는 생기지 않음)도 0으로 취급', () => {
    expect(deriveBaseSeq(0)).toBe(0);
  });

  it('rev 2 이상은 0이 아닌 값 — 갱신 시도', () => {
    expect(deriveBaseSeq(2)).not.toBe(0);
    expect(deriveBaseSeq(9)).not.toBe(0);
  });
});

describe('toSyncChange', () => {
  it('OutboxEntry + row 를 SyncChange 모양으로 조립한다', () => {
    const entry: OutboxEntry = { tbl: 'todos', id: 'a', rev: 3 };
    expect(toSyncChange(entry, { hello: 'world' })).toEqual({
      tbl: 'todos',
      id: 'a',
      baseSeq: 3,
      row: { hello: 'world' },
    });
  });
});

describe('reconcileAck', () => {
  it('큐 항목과 방금 푸시한 rev 가 같으면 remove', () => {
    const queued: OutboxEntry = { tbl: 'todos', id: 'a', rev: 2 };
    expect(reconcileAck(queued, { tbl: 'todos', id: 'a', rev: 2 })).toBe('remove');
  });

  it('그 사이 다시 써져 rev 가 올라갔으면 keep(ack 가 새 변경을 지우지 않는다)', () => {
    const queued: OutboxEntry = { tbl: 'todos', id: 'a', rev: 3 };
    expect(reconcileAck(queued, { tbl: 'todos', id: 'a', rev: 2 })).toBe('keep');
  });

  it('다른 (tbl,id) 면 keep', () => {
    const queued: OutboxEntry = { tbl: 'todos', id: 'a', rev: 2 };
    expect(reconcileAck(queued, { tbl: 'todos', id: 'b', rev: 2 })).toBe('keep');
  });
});

describe('takeOutboxBatch', () => {
  it('limit 만큼 앞에서부터 자른다', () => {
    const entries: OutboxEntry[] = [
      { tbl: 'todos', id: 'a', rev: 1 },
      { tbl: 'todos', id: 'b', rev: 1 },
      { tbl: 'todos', id: 'c', rev: 1 },
    ];
    expect(takeOutboxBatch(entries, 2)).toEqual(entries.slice(0, 2));
  });

  it('limit 이 0 이하면 빈 배열', () => {
    const entries: OutboxEntry[] = [{ tbl: 'todos', id: 'a', rev: 1 }];
    expect(takeOutboxBatch(entries, 0)).toEqual([]);
    expect(takeOutboxBatch(entries, -5)).toEqual([]);
  });
});

describe('shouldQuarantine', () => {
  it('3회 미만이면 재시도', () => {
    expect(shouldQuarantine(0)).toBe(false);
    expect(shouldQuarantine(QUARANTINE_AFTER_CONSECUTIVE_INVALID - 1)).toBe(false);
  });

  it('3회부터 격리', () => {
    expect(shouldQuarantine(QUARANTINE_AFTER_CONSECUTIVE_INVALID)).toBe(true);
    expect(shouldQuarantine(QUARANTINE_AFTER_CONSECUTIVE_INVALID + 1)).toBe(true);
  });
});
