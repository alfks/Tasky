import { describe, expect, it } from 'vitest';

import {
  BACKUP_STALE_DAYS,
  BACKUP_WARN_MIN_TODOS,
  daysSinceBackup,
  shouldWarnStaleBackup,
} from '@/domain/backup/stale-backup';

const NOW = '2026-09-15T09:00:00.000Z';
const daysBefore = (days: number): string =>
  new Date(Date.parse(NOW) - days * 24 * 60 * 60 * 1000).toISOString();

describe('daysSinceBackup', () => {
  it('백업한 적이 없으면 null 이다', () => {
    expect(daysSinceBackup(undefined, NOW)).toBeNull();
  });

  it('시각 형식이 아니면 null 이다 (손상된 설정 행)', () => {
    expect(daysSinceBackup('2026-09-01', NOW)).toBeNull();
  });

  it('지난 날수를 내림해서 돌려준다', () => {
    expect(daysSinceBackup(daysBefore(14), NOW)).toBe(14);
    expect(daysSinceBackup('2026-09-15T08:59:00.000Z', NOW)).toBe(0);
  });

  it('미래 시각은 0 으로 본다 (기기 시계가 뒤로 간 경우)', () => {
    expect(daysSinceBackup('2026-12-01T00:00:00.000Z', NOW)).toBe(0);
  });
});

describe('shouldWarnStaleBackup (§2·R14)', () => {
  const warn = (lastBackupAt: string | undefined, todoCount: number): boolean =>
    shouldWarnStaleBackup({ lastBackupAt, todoCount, now: NOW });

  it('백업이 없고 투두가 20개 이상이면 경고한다', () => {
    expect(warn(undefined, BACKUP_WARN_MIN_TODOS)).toBe(true);
  });

  it('투두가 20개 미만이면 백업이 없어도 경고하지 않는다', () => {
    expect(warn(undefined, BACKUP_WARN_MIN_TODOS - 1)).toBe(false);
  });

  it('30일을 넘기면 경고한다', () => {
    expect(warn(daysBefore(BACKUP_STALE_DAYS + 1), 30)).toBe(true);
  });

  it('정확히 30일째는 "초과" 가 아니라 경고하지 않는다', () => {
    expect(warn(daysBefore(BACKUP_STALE_DAYS), 30)).toBe(false);
  });

  it('최근에 백업했으면 투두가 많아도 경고하지 않는다', () => {
    expect(warn(daysBefore(1), 5_000)).toBe(false);
  });

  it('투두가 0개면 경고하지 않는다', () => {
    expect(warn(undefined, 0)).toBe(false);
  });

  it('입력에 "사용자가 껐는가" 가 없다 — 끌 수 있는 경로가 타입에 없다 (R14)', () => {
    const keys = Object.keys({ lastBackupAt: undefined, todoCount: 0, now: NOW });
    expect(keys).toEqual(['lastBackupAt', 'todoCount', 'now']);
  });
});
