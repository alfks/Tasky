import { describe, expect, it } from 'vitest';

import { VECTOR_NOW } from '@/domain/social/social-vectors';

import { createSocialActor, type SocialActor } from './actor';
import { previewInvite } from './invite-command';
import { preProfileSubject } from './limits';
import { createD1Fixture } from '../test/d1-harness';

const SESSION = {
  ok: true as const,
  sub: 'preview-user',
  sid: 'preview-session',
  expiresAt: '2099-01-01T00:00:00.000Z',
};
const SECRET = 'preview-test-secret';

async function fixture() {
  const fx = await createD1Fixture();
  await fx.db.batch([
    fx.db
      .prepare('INSERT INTO users(sub,email,created_at) VALUES (?,?,?)')
      .bind(SESSION.sub, 'preview@example.test', SESSION.expiresAt),
    fx.db
      .prepare('INSERT INTO sessions(sid,sub,created_at,expires_at) VALUES (?,?,?,?)')
      .bind(SESSION.sid, SESSION.sub, '2020-01-01T00:00:00.000Z', SESSION.expiresAt),
  ]);
  const actor = await createSocialActor(fx.db, SESSION, VECTOR_NOW);
  return { ...fx, actor };
}

async function previewCount(db: D1Database): Promise<number> {
  const subject = await preProfileSubject(SECRET, SESSION.sub);
  const row = await db
    .prepare("SELECT count FROM social_limits WHERE subject = ? AND bucket = 'preview'")
    .bind(subject)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

/** Pause at a real D1 statement, then change auth state before it executes. */
function withAuthChange(
  actor: SocialActor,
  marker: string,
  stage: 'run' | 'first',
  change: () => Promise<void>,
): SocialActor {
  let changed = false;
  const db = {
    prepare(query: string) {
      const statement = actor.db.prepare(query);
      if (!query.includes(marker)) return statement;
      return {
        bind(...values: Parameters<D1PreparedStatement['bind']>) {
          const bound = statement.bind(...values);
          const before = async () => {
            if (changed) return;
            changed = true;
            await change();
          };
          return {
            run: async () => {
              if (stage === 'run') await before();
              return bound.run();
            },
            first: async <T>() => {
              if (stage === 'first') await before();
              return bound.first<T>();
            },
          } as D1PreparedStatement;
        },
      } as D1PreparedStatement;
    },
  } as D1Database;
  return { ...actor, db };
}

describe('pre-profile invite preview admission', () => {
  it('charges malformed attempts and returns 429 after the twentieth attempt', async () => {
    const fx = await fixture();
    try {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        expect(await previewInvite(fx.actor, SECRET, {})).toEqual({
          ok: false,
          code: 'validation',
        });
      }
      expect(await previewCount(fx.db)).toBe(20);
      expect(await previewInvite(fx.actor, SECRET, {})).toEqual({
        ok: false,
        code: 'rate-limited',
      });
      expect(await previewCount(fx.db)).toBe(20);
    } finally {
      await fx.dispose();
    }
  }, 20_000);

  it('classifies a revoked session before parsing without charging a slot', async () => {
    const fx = await fixture();
    try {
      await fx.db.prepare('DELETE FROM sessions WHERE sid = ?').bind(SESSION.sid).run();
      expect(await previewInvite(fx.actor, SECRET, {})).toEqual({
        ok: false,
        code: 'unauthorized',
      });
      expect(await previewCount(fx.db)).toBe(0);
    } finally {
      await fx.dispose();
    }
  });

  it('classifies a deletion marker before parsing without charging a slot', async () => {
    const fx = await fixture();
    try {
      await fx.db
        .prepare('INSERT INTO deleted_users(sub,deleted_at) VALUES (?,?)')
        .bind(SESSION.sub, SESSION.expiresAt)
        .run();
      expect(await previewInvite(fx.actor, SECRET, {})).toEqual({
        ok: false,
        code: 'account-deleted',
      });
      expect(await previewCount(fx.db)).toBe(0);
    } finally {
      await fx.dispose();
    }
  });

  it('charges a valid but absent invite and preserves auth precedence after exhaustion', async () => {
    const fx = await fixture();
    try {
      expect(await previewInvite(fx.actor, SECRET, { token: 'a'.repeat(64) })).toEqual({
        ok: false,
        code: 'unavailable',
      });
      expect(await previewCount(fx.db)).toBe(1);
      for (let attempt = 1; attempt < 20; attempt += 1) {
        await previewInvite(fx.actor, SECRET, {});
      }
      await fx.db.prepare('DELETE FROM sessions WHERE sid = ?').bind(SESSION.sid).run();
      expect(await previewInvite(fx.actor, SECRET, {})).toEqual({
        ok: false,
        code: 'unauthorized',
      });
      expect(await previewCount(fx.db)).toBe(20);
    } finally {
      await fx.dispose();
    }
  }, 20_000);

  it('classifies 0-row limiter and final lookup after auth changes mid-request', async () => {
    for (const stage of ['run', 'first'] as const) {
      for (const loss of ['session', 'deletion'] as const) {
        const fx = await fixture();
        try {
          const change = async () => {
            if (loss === 'session') {
              await fx.db.prepare('DELETE FROM sessions WHERE sid = ?').bind(SESSION.sid).run();
            } else {
              await fx.db
                .prepare('INSERT INTO deleted_users(sub,deleted_at) VALUES (?,?)')
                .bind(SESSION.sub, SESSION.expiresAt)
                .run();
            }
          };
          const marker =
            stage === 'run'
              ? 'INSERT INTO social_limits'
              : 'FROM social_invites i JOIN social_profiles p';
          const actor = withAuthChange(fx.actor, marker, stage, change);
          expect(await previewInvite(actor, SECRET, { token: 'a'.repeat(64) })).toEqual({
            ok: false,
            code: loss === 'session' ? 'unauthorized' : 'account-deleted',
          });
          expect(await previewCount(fx.db)).toBe(stage === 'run' ? 0 : 1);
        } finally {
          await fx.dispose();
        }
      }
    }
  }, 15_000);
});
