import { describe, expect, it } from 'vitest';

import {
  BACKUP_STALE_DAYS,
  BACKUP_UNCONFIRMED_STALE_DAYS,
  BACKUP_WARN_MIN_TODOS,
  daysSinceBackup,
  shouldWarnStaleBackup,
  staleDaysFor,
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

  it('입력에 "사용자가 껐는가" 가 없다 — 가장 너그러운 값으로도 끌 수 없다 (R14)', () => {
    // `confirmation` 은 기간을 늘릴 뿐 조건을 무효화하지 못한다: 백업한 적이 없으면 어느 값이든 참이다.
    expect(
      shouldWarnStaleBackup({
        lastBackupAt: undefined,
        todoCount: BACKUP_WARN_MIN_TODOS,
        now: NOW,
        confirmation: 'confirmed',
      }),
    ).toBe(true);
  });
});

// 사용자 결정(R14): 확인 못 한 백업은 **보통의 절반 기간**만 지나면 다시 경고한다.
describe('확인 못 한 백업의 절반 기간 (R14)', () => {
  const warn = (days: number, confirmation: 'confirmed' | 'unconfirmed'): boolean =>
    shouldWarnStaleBackup({
      lastBackupAt: daysBefore(days),
      todoCount: BACKUP_WARN_MIN_TODOS,
      now: NOW,
      confirmation,
    });

  // **리터럴과 유도식 양쪽으로 단언한다.** 상수만 참조하면 상수를 바꿔도 테스트가 따라가 아무것도 잡지 못한다.
  it('임계값은 30일의 절반인 15일이다', () => {
    expect(BACKUP_STALE_DAYS).toBe(30);
    expect(BACKUP_UNCONFIRMED_STALE_DAYS).toBe(15);
    expect(BACKUP_UNCONFIRMED_STALE_DAYS).toBe(BACKUP_STALE_DAYS / 2);
    expect(Number.isInteger(BACKUP_UNCONFIRMED_STALE_DAYS)).toBe(true);
  });

  it('staleDaysFor 가 기록 종류에 따라 30 / 15 를 준다', () => {
    expect(staleDaysFor('confirmed')).toBe(30);
    expect(staleDaysFor('unconfirmed')).toBe(15);
    expect(staleDaysFor('confirmed')).toBe(BACKUP_STALE_DAYS);
    expect(staleDaysFor('unconfirmed')).toBe(BACKUP_UNCONFIRMED_STALE_DAYS);
  });

  it('16일 지난 기록은 확인 못 했으면 경고하고 확인했으면 경고하지 않는다', () => {
    expect(warn(16, 'unconfirmed')).toBe(true);
    expect(warn(16, 'confirmed')).toBe(false);
  });

  it('정확히 15일째는 "초과" 가 아니라 아직 경고하지 않는다', () => {
    expect(warn(BACKUP_UNCONFIRMED_STALE_DAYS, 'unconfirmed')).toBe(false);
    expect(warn(15, 'unconfirmed')).toBe(false);
    expect(warn(BACKUP_UNCONFIRMED_STALE_DAYS + 1, 'unconfirmed')).toBe(true);
  });

  it('31일 지나면 확인된 기록도 경고한다 — 절반 규칙이 전체 기간을 없애지 않는다', () => {
    expect(warn(BACKUP_STALE_DAYS + 1, 'confirmed')).toBe(true);
  });

  it('생략하면 확인된 것으로 본다 (기존 호출부의 뜻이 바뀌지 않는다)', () => {
    expect(
      shouldWarnStaleBackup({
        lastBackupAt: daysBefore(16),
        todoCount: BACKUP_WARN_MIN_TODOS,
        now: NOW,
      }),
    ).toBe(false);
  });
});
