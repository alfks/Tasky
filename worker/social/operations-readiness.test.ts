import { describe, expect, it } from 'vitest';

import { createSocialActor } from './actor';
import { collectSocialGarbage, reserveLimit } from './limits';
import { createD1Fixture } from '../test/d1-harness';

// Expected durations and caps come from docs/social-design.md §8, not limits.ts.
const MINUTE = 60_000;
const DAY = 86_400_000;
const NOW = Date.parse('2026-09-28T12:00:00.000Z');
const SUB = 'readiness-user';
const SID = 'readiness-session';
const PROFILE = 'readiness-profile';
const SESSION = { ok: true as const, sub: SUB, sid: SID, expiresAt: '2099-01-01T00:00:00.000Z' };

async function seedAccount(db: D1Database): Promise<void> {
  await db.batch([
    db
      .prepare('INSERT INTO users(sub,email,created_at) VALUES (?,?,?)')
      .bind(SUB, 'readiness@example.test', SESSION.expiresAt),
    db
      .prepare('INSERT INTO sessions(sid,sub,created_at,expires_at) VALUES (?,?,?,?)')
      .bind(SID, SUB, '2020-01-01T00:00:00.000Z', SESSION.expiresAt),
    db
      .prepare('INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES (?,?,?,?,?)')
      .bind(PROFILE, SUB, 'Readiness', 0, NOW),
  ]);
}

async function count(
  db: D1Database,
  table: 'social_invites' | 'social_commands' | 'social_limits',
): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
  return row?.n ?? -1;
}

describe('social operations readiness against independent D1', () => {
  it('retains rows just before the 7-day and 48-hour deadlines, then removes at and after them', async () => {
    const fixture = await createD1Fixture();
    try {
      await seedAccount(fixture.db);
      for (const [suffix, offset] of [
        ['before', 1],
        ['exact', 0],
        ['after', -1],
      ] as const) {
        await fixture.db.batch([
          fixture.db
            .prepare(
              'INSERT INTO social_invites(hash,owner,expires_at,status,created_at) VALUES (?,?,?,?,?)',
            )
            .bind(`invite-${suffix}`, PROFILE, NOW - 7 * DAY + offset, 'active', NOW - 8 * DAY),
          fixture.db
            .prepare(
              'INSERT INTO social_commands(actor,key,request_hash,execution_nonce,result_code,created_at) VALUES (?,?,?,?,?,?)',
            )
            .bind(PROFILE, `command-${suffix}`, 'hash', 'nonce', 'ok', NOW - 2 * DAY + offset),
        ]);
      }
      // A minute window expires first; retention starts at its end.
      const windowAtCutoff = NOW - 2 * DAY - MINUTE;
      for (const [suffix, offset] of [
        ['before', 1],
        ['exact', 0],
        ['after', -1],
      ] as const) {
        await fixture.db
          .prepare('INSERT INTO social_limits(subject,bucket,window_start,count) VALUES (?,?,?,?)')
          .bind(`limit-${suffix}`, 'read', windowAtCutoff + offset, 1)
          .run();
      }
      expect(await collectSocialGarbage(fixture.db, NOW - 1)).toBe(3);
      expect(await count(fixture.db, 'social_invites')).toBe(2);
      expect(await count(fixture.db, 'social_commands')).toBe(2);
      expect(await count(fixture.db, 'social_limits')).toBe(2);
      expect(await collectSocialGarbage(fixture.db, NOW)).toBe(3);
      expect(await count(fixture.db, 'social_invites')).toBe(1);
      expect(await count(fixture.db, 'social_commands')).toBe(1);
      expect(await count(fixture.db, 'social_limits')).toBe(1);
      expect(await collectSocialGarbage(fixture.db, NOW + 1)).toBe(3);
      expect(await count(fixture.db, 'social_invites')).toBe(0);
      expect(await count(fixture.db, 'social_commands')).toBe(0);
      expect(await count(fixture.db, 'social_limits')).toBe(0);
      expect(await collectSocialGarbage(fixture.db, NOW + 1)).toBe(0);
    } finally {
      await fixture.dispose();
    }
  }, 30_000);

  it('deletes at most 500 rows per call and drains excess on the next call without replay effects', async () => {
    const fixture = await createD1Fixture();
    try {
      await seedAccount(fixture.db);
      for (let start = 0; start < 501; start += 100) {
        const statements = Array.from({ length: Math.min(100, 501 - start) }, (_, i) =>
          fixture.db
            .prepare(
              'INSERT INTO social_commands(actor,key,request_hash,execution_nonce,result_code,created_at) VALUES (?,?,?,?,?,?)',
            )
            .bind(PROFILE, `old-${start + i}`, 'hash', 'nonce', 'ok', NOW - 2 * DAY),
        );
        await fixture.db.batch(statements);
      }
      expect(await collectSocialGarbage(fixture.db, NOW)).toBe(500);
      expect(await count(fixture.db, 'social_commands')).toBe(1);
      expect(await collectSocialGarbage(fixture.db, NOW)).toBe(1);
      expect(await count(fixture.db, 'social_commands')).toBe(0);
      expect(await collectSocialGarbage(fixture.db, NOW)).toBe(0);
    } finally {
      await fixture.dispose();
    }
  }, 30_000);

  it.each([
    { bucket: 'read' as const, duration: MINUTE, cap: 120 },
    { bucket: 'post-create' as const, duration: DAY, cap: 20 },
  ])(
    'rolls $bucket over at the exact UTC fixed-window boundary',
    async ({ bucket, duration, cap }) => {
      const fixture = await createD1Fixture();
      try {
        await seedAccount(fixture.db);
        const boundary = Math.floor(NOW / duration) * duration + duration;
        const subject = `p:${PROFILE}`;
        const before = await createSocialActor(fixture.db, SESSION, boundary - 1);
        for (let i = 0; i < cap; i += 1)
          expect(await reserveLimit(before, subject, bucket)).toBe(true);
        expect(await reserveLimit(before, subject, bucket)).toBe(false);
        const at = await createSocialActor(fixture.db, SESSION, boundary);
        expect(await reserveLimit(at, subject, bucket)).toBe(true);
        const after = await createSocialActor(fixture.db, SESSION, boundary + 1);
        expect(await reserveLimit(after, subject, bucket)).toBe(true);
        const rows = await fixture.db
          .prepare(
            'SELECT window_start,count FROM social_limits WHERE subject=? AND bucket=? ORDER BY window_start',
          )
          .bind(subject, bucket)
          .all<{ window_start: number; count: number }>();
        expect(rows.results).toEqual([
          { window_start: boundary - duration, count: cap },
          { window_start: boundary, count: 2 },
        ]);
      } finally {
        await fixture.dispose();
      }
    },
    30_000,
  );
});
