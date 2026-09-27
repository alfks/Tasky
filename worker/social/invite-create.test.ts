import { describe, expect, it } from 'vitest';

import { ACTOR_A, VECTOR_NOW } from '@/domain/social/social-vectors';

import { createSocialActor } from './actor';
import { createInvite } from './invite-create';
import { createD1Fixture } from '../test/d1-harness';

const A = { ok: true as const, sub: 'user-a', sid: 'sid-a', expiresAt: '2099-01-01T00:00:00.000Z' };

async function fixture() {
  const fx = await createD1Fixture();
  await fx.db.batch([
    fx.db
      .prepare('INSERT INTO users(sub,email,created_at) VALUES (?,?,?)')
      .bind(A.sub, 'a@example.test', A.expiresAt),
    fx.db
      .prepare('INSERT INTO sessions(sid,sub,created_at,expires_at) VALUES (?,?,?,?)')
      .bind(A.sid, A.sub, '2020-01-01T00:00:00.000Z', A.expiresAt),
    fx.db
      .prepare('INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES (?,?,?,?,?)')
      .bind(ACTOR_A, A.sub, 'Alice', 0, VECTOR_NOW),
  ]);
  return fx;
}

function key(n: number): string {
  return `v1.${VECTOR_NOW}.${n.toString(16).padStart(32, '0')}`;
}

async function n(db: D1Database, table: 'social_invites' | 'social_commands'): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
  return row?.n ?? -1;
}

describe('invite creation success counter batch', () => {
  it('commits one receipt, invite hash and daily count; replay has no token or increment', async () => {
    const fx = await fixture();
    try {
      const actor = await createSocialActor(fx.db, A, VECTOR_NOW);
      const first = await createInvite(actor, key(1), {});
      expect(first.ok).toBe(true);
      if (!first.ok || !('token' in first.value)) throw new Error('missing first token');
      expect(first.value.token).toMatch(/^[0-9a-f]{64}$/u);
      expect(first.value.expiresAt).toBe(VECTOR_NOW + 86_400_000);
      const invite = await fx.db
        .prepare('SELECT hash,status FROM social_invites')
        .first<{ hash: string; status: string }>();
      expect(invite?.status).toBe('active');
      expect(invite?.hash).not.toBe(first.value.token);
      const receipt = await fx.db
        .prepare('SELECT resource_id,result_code,result_version FROM social_commands')
        .first<{ resource_id: string; result_code: string; result_version: number }>();
      expect(receipt).toMatchObject({
        resource_id: invite?.hash,
        result_code: 'ok',
        result_version: 1,
      });
      expect(await createInvite(actor, key(1), {})).toEqual({
        ok: true,
        value: { inviteId: invite?.hash, tokenUnavailable: true },
      });
      expect(await n(fx.db, 'social_invites')).toBe(1);
      expect(
        (
          await fx.db
            .prepare("SELECT count FROM social_limits WHERE bucket = 'invite-create'")
            .first<{ count: number }>()
        )?.count,
      ).toBe(1);
    } finally {
      await fx.dispose();
    }
  });

  it('stores a fixed 422 receipt at active and daily quotas without success count changes', async () => {
    const fx = await fixture();
    try {
      const actor = await createSocialActor(fx.db, A, VECTOR_NOW);
      for (let i = 1; i <= 5; i += 1) expect((await createInvite(actor, key(i), {})).ok).toBe(true);
      expect(await createInvite(actor, key(6), {})).toEqual({ ok: false, code: 'limit-reached' });
      expect(await n(fx.db, 'social_invites')).toBe(5);
      expect(
        (
          await fx.db
            .prepare("SELECT count FROM social_limits WHERE bucket = 'invite-create'")
            .first<{ count: number }>()
        )?.count,
      ).toBe(5);
      expect(
        (
          await fx.db
            .prepare('SELECT result_code FROM social_commands WHERE key = ?')
            .bind(key(6))
            .first<{ result_code: string }>()
        )?.result_code,
      ).toBe('limit-reached');
      await fx.db
        .prepare("UPDATE social_invites SET status = 'revoked' WHERE owner = ?")
        .bind(ACTOR_A)
        .run();
      for (let i = 7; i <= 21; i += 1) {
        expect((await createInvite(actor, key(i), {})).ok).toBe(true);
        await fx.db
          .prepare(
            "UPDATE social_invites SET status = 'revoked' WHERE owner = ? AND status = 'active'",
          )
          .bind(ACTOR_A)
          .run();
      }
      expect(
        (
          await fx.db
            .prepare("SELECT count FROM social_limits WHERE bucket = 'invite-create'")
            .first<{ count: number }>()
        )?.count,
      ).toBe(20);
      expect(await createInvite(actor, key(22), {})).toEqual({ ok: false, code: 'limit-reached' });
      expect(await n(fx.db, 'social_invites')).toBe(20);
      expect(
        (
          await fx.db
            .prepare("SELECT count FROM social_limits WHERE bucket = 'invite-create'")
            .first<{ count: number }>()
        )?.count,
      ).toBe(20);
      expect(
        (
          await fx.db
            .prepare('SELECT result_code FROM social_commands WHERE key = ?')
            .bind(key(22))
            .first<{ result_code: string }>()
        )?.result_code,
      ).toBe('limit-reached');
    } finally {
      await fx.dispose();
    }
  }, 25_000);

  it('rolls back receipt and invite when the daily success counter statement fails', async () => {
    const fx = await fixture();
    try {
      await fx.db
        .prepare(
          "CREATE TRIGGER fail_counter BEFORE INSERT ON social_limits WHEN NEW.bucket = 'invite-create' BEGIN SELECT RAISE(ABORT,'forced'); END",
        )
        .run();
      const actor = await createSocialActor(fx.db, A, VECTOR_NOW);
      await expect(createInvite(actor, key(1), {})).rejects.toThrow();
      expect(await n(fx.db, 'social_invites')).toBe(0);
      expect(await n(fx.db, 'social_commands')).toBe(0);
      expect(
        (
          await fx.db
            .prepare("SELECT COUNT(*) AS n FROM social_limits WHERE bucket = 'invite-create'")
            .first<{ n: number }>()
        )?.n,
      ).toBe(0);
    } finally {
      await fx.dispose();
    }
  });
});
