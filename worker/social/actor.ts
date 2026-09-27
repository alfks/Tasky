import { parseNickname } from '@/domain/social/input';
import type { ProfileView, SocialErrorCode } from '@/domain/social/social';

import { sql } from '../db/sql';

import type { SessionOk } from '../auth/session';

export type SocialActor = {
  readonly db: D1Database;
  readonly sub: string;
  readonly sid: string;
  readonly profileId: string | null;
  readonly nowMs: number;
  readonly nowIso: string;
};

export type SocialOutcome<T> = { ok: true; value: T } | { ok: false; code: SocialErrorCode };

/** One instance per verified request. A profile is resolved from D1, never from the body. */
export async function createSocialActor(
  db: D1Database,
  session: SessionOk,
  nowMs: number,
): Promise<SocialActor> {
  if (!Number.isSafeInteger(nowMs)) throw new Error('Invalid server time');
  const nowIso = new Date(nowMs).toISOString();
  const profile = await db
    .prepare(
      sql`SELECT p.id FROM social_profiles p
       JOIN users u ON u.sub = p.sub
       JOIN sessions s ON s.sub = u.sub
       WHERE p.sub = ? AND s.sid = ? AND s.expires_at > ?
         AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)`,
    )
    .bind(session.sub, session.sid, nowIso)
    .first<{ id: string }>();
  return Object.freeze({
    db,
    sub: session.sub,
    sid: session.sid,
    profileId: profile?.id ?? null,
    nowMs,
    nowIso,
  });
}

/** The pre-profile A variant deliberately does not create a profile on sign-in. */
export async function currentAccount(actor: SocialActor): Promise<boolean> {
  const row = await actor.db
    .prepare(
      sql`SELECT 1 AS live FROM sessions s JOIN users u ON u.sub = s.sub
       WHERE s.sid = ? AND s.sub = ? AND s.expires_at > ?
         AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = s.sub)`,
    )
    .bind(actor.sid, actor.sub, actor.nowIso)
    .first<{ live: number }>();
  return row?.live === 1;
}

/** Classify a 0-row A result without interpreting it as success. */
export async function actorFailure(actor: SocialActor): Promise<SocialErrorCode> {
  const row = await actor.db
    .prepare(
      sql`SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM sessions s WHERE s.sid = ?2 AND s.sub = ?1
        AND s.expires_at > ?3) THEN 'unauthorized'
      WHEN EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = ?1) THEN 'account-deleted'
      ELSE 'unavailable' END AS code`,
    )
    .bind(actor.sub, actor.sid, actor.nowIso)
    .first<{ code: SocialErrorCode }>();
  return row?.code ?? 'unavailable';
}

export async function currentProfile(actor: SocialActor): Promise<ProfileView | null> {
  if (actor.profileId === null) return null;
  const row = await actor.db
    .prepare(
      sql`SELECT p.id, p.nickname, p.version FROM social_profiles p
       JOIN users u ON u.sub = p.sub JOIN sessions s ON s.sub = u.sub
       WHERE p.id = ? AND p.sub = ? AND s.sid = ? AND s.expires_at > ?
         AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)`,
    )
    .bind(actor.profileId, actor.sub, actor.sid, actor.nowIso)
    .first<ProfileView>();
  return row ?? null;
}

/** Conditional insert plus UNIQUE(sub) makes duplicate creation keep the first nickname. */
export async function createProfile(
  actor: SocialActor,
  nicknameInput: unknown,
): Promise<SocialOutcome<ProfileView>> {
  const result = await createProfileWithStatus(actor, nicknameInput);
  return result.ok ? { ok: true, value: result.value.profile } : result;
}

/** HTTP 201/200 follows the conditional INSERT row count, not a pre-read guess. */
export async function createProfileWithStatus(
  actor: SocialActor,
  nicknameInput: unknown,
): Promise<SocialOutcome<{ profile: ProfileView; didInsert: boolean }>> {
  const parsed = parseNickname(nicknameInput);
  if (!parsed.ok) return { ok: false, code: 'validation' };
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  const inserted = await actor.db
    .prepare(
      sql`INSERT INTO social_profiles(id,sub,nickname,version,created_at)
       SELECT ?,u.sub,?,0,? FROM users u JOIN sessions s ON s.sub = u.sub
       WHERE u.sub = ? AND s.sid = ? AND s.expires_at > ?
         AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)
       ON CONFLICT(sub) DO NOTHING`,
    )
    .bind(id, parsed.value, actor.nowMs, actor.sub, actor.sid, actor.nowIso)
    .run();
  const row = await actor.db
    .prepare(
      sql`SELECT p.id,p.nickname,p.version FROM social_profiles p
       JOIN users u ON u.sub = p.sub JOIN sessions s ON s.sub = u.sub
       WHERE p.sub = ? AND s.sid = ? AND s.expires_at > ?
         AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)`,
    )
    .bind(actor.sub, actor.sid, actor.nowIso)
    .first<ProfileView>();
  return row
    ? { ok: true, value: { profile: row, didInsert: inserted.meta.changes === 1 } }
    : { ok: false, code: await actorFailure(actor) };
}

/** A and both sides of F are rechecked in the same snapshot as the post body. */
export async function visiblePost(
  actor: SocialActor,
  postId: string,
): Promise<{ id: string; author: string; text: string } | null> {
  if (actor.profileId === null) return null;
  const row = await actor.db
    .prepare(
      sql`SELECT post.id,post.author,post.text FROM social_posts post
       JOIN social_profiles me ON me.id = ? AND me.sub = ?
       JOIN users u ON u.sub = me.sub JOIN sessions s ON s.sub = u.sub
       JOIN social_profiles author ON author.id = post.author JOIN users au ON au.sub = author.sub
       WHERE post.id = ? AND s.sid = ? AND s.expires_at > ?
         AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub IN (u.sub,au.sub))
         AND (post.author = me.id OR (
           EXISTS (SELECT 1 FROM social_pairs pair WHERE pair.lo = MIN(me.id,author.id)
             AND pair.hi = MAX(me.id,author.id) AND pair.state = 'accepted')
           AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE
             (b.blocker = me.id AND b.blocked = author.id)
             OR (b.blocker = author.id AND b.blocked = me.id))))`,
    )
    .bind(actor.profileId, actor.sub, postId, actor.sid, actor.nowIso)
    .first<{ id: string; author: string; text: string }>();
  return row ?? null;
}

export async function readVisiblePost(
  actor: SocialActor,
  postId: string,
): Promise<SocialOutcome<{ id: string; author: string; text: string }>> {
  const row = await visiblePost(actor, postId);
  return row === null ? { ok: false, code: await actorFailure(actor) } : { ok: true, value: row };
}
