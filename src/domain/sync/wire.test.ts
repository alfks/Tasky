import { describe, expect, it } from 'vitest';

import { isResyncResponse, isSyncTable, SYNC_TABLES, type SyncResponse } from '@/domain/sync/wire';

describe('SYNC_TABLES / isSyncTable', () => {
  it('DatasetSnapshot 의 7테이블과 정확히 같다', () => {
    expect([...SYNC_TABLES].sort()).toEqual(
      [
        'categories',
        'ddays',
        'diaryEntries',
        'focusSessions',
        'routines',
        'settings',
        'todos',
      ].sort(),
    );
  });

  it('알려진 테이블은 true', () => {
    for (const tbl of SYNC_TABLES) {
      expect(isSyncTable(tbl)).toBe(true);
    }
  });

  it('모르는 문자열은 false(unknown-table 거절의 관문)', () => {
    expect(isSyncTable('friends')).toBe(false);
    expect(isSyncTable('')).toBe(false);
    // Object.prototype 의 키를 흉내 낸 값도 진짜 테이블로 오인하지 않는다.
    expect(isSyncTable('toString')).toBe(false);
    expect(isSyncTable('constructor')).toBe(false);
  });
});

describe('isResyncResponse', () => {
  it('resync 응답을 구분한다', () => {
    const resync: SyncResponse = { resync: true, gcFloor: 10 };
    expect(isResyncResponse(resync)).toBe(true);
  });

  it('일반 응답은 false', () => {
    const ok: SyncResponse = {
      cursor: 5,
      applied: [],
      rejected: [],
      pulled: [],
      more: false,
      gcFloor: 0,
    };
    expect(isResyncResponse(ok)).toBe(false);
  });
});
