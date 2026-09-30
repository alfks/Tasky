import type { SocialErrorCode } from '@/domain/social/social';

import { actorFailure, currentProfile, type SocialActor } from './actor';
import { sql } from '../db/sql';

export type LimitBucket = 'read' | 'preview' | 'write' | 'revoke' | 'invite-create' | 'post-create';

const MINUTE = 60_000;
const DAY = 86_400_000;
const CAPS: Readonly<Record<LimitBucket, number>> = {
  read: 120,
  preview: 20,
  write: 60,
  revoke: 60,
  'invite-create': 20,
  'post-create': 20,
};

/** Raw sub never appears in subject, even before profile creation. */
export async function preProfileSubject(secret: string, sub: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(sub)),
  );
  return `pre:${Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** Caller selects pre for /me, profile and preview, p for all other routes. */
export async function limitSubject(
  actor: SocialActor,
  secret: string,
  scope: 'pre' | 'profile',
): Promise<string | null> {
  return scope === 'pre'
    ? preProfileSubject(secret, actor.sub)
    : actor.profileId === null
      ? null
      : `p:${actor.profileId}`;
}

/** A guarded atomic UPSERT: rejected requests leave the count unchanged. */
export async function reserveLimit(
  actor: SocialActor,
  subject: string,
  bucket: LimitBucket,
): Promise<boolean> {
  const duration = bucket === 'invite-create' || bucket === 'post-create' ? DAY : MINUTE;
  const windowStart = Math.floor(actor.nowMs / duration) * duration;
  const result = await actor.db
    .prepare(
      sql`INSERT INTO social_limits(subject,bucket,window_start,count)
        SELECT ?,?,?,1 WHERE EXISTS (
          SELECT 1 FROM sessions s JOIN users u ON u.sub = s.sub
          WHERE s.sid = ? AND s.sub = ? AND s.expires_at > ?
            AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)
        )
        ON CONFLICT(subject,bucket,window_start) DO UPDATE SET count = count + 1
          WHERE count < ? RETURNING count`,
    )
    .bind(subject, bucket, windowStart, actor.sid, actor.sub, actor.nowIso, CAPS[bucket])
    .run<{ count: number }>();
  return result.results.length === 1;
}

/** Every authenticated command attempt spends one frequency slot, including replay and 4xx. */
export async function admitCommand(
  actor: SocialActor,
  bucket: 'write' | 'revoke',
): Promise<SocialErrorCode | null> {
  if (actor.profileId === null) return actorFailure(actor);
  if (await reserveLimit(actor, `p:${actor.profileId}`, bucket)) return null;
  if ((await currentProfile(actor)) === null) return actorFailure(actor);
  return 'rate-limited';
}

/** At most 500 rows across all tables, including sparse/empty tables. */
export async function collectSocialGarbage(db: D1Database, nowMs: number): Promise<number> {
  const sevenDays = 7 * DAY;
  const fortyEightHours = 2 * DAY;
  const invites = await db
    .prepare(
      sql`DELETE FROM social_invites WHERE hash IN
      (SELECT hash FROM social_invites WHERE expires_at <= ? LIMIT 500) RETURNING hash`,
    )
    .bind(nowMs - sevenDays)
    .run<{ hash: string }>();
  let removed = invites.results.length;
  if (removed < 500) {
    const commands = await db
      .prepare(
        sql`DELETE FROM social_commands WHERE rowid IN
        (SELECT rowid FROM social_commands WHERE created_at <= ? LIMIT ?) RETURNING key`,
      )
      .bind(nowMs - fortyEightHours, 500 - removed)
      .run<{ key: string }>();
    removed += commands.results.length;
  }
  if (removed < 500) {
    const limits = await db
      .prepare(
        sql`DELETE FROM social_limits WHERE rowid IN
        (SELECT rowid FROM social_limits WHERE
          window_start + CASE WHEN bucket IN ('invite-create','post-create') THEN 86400000 ELSE 60000 END <= ?
          LIMIT ?) RETURNING subject`,
      )
      .bind(nowMs - fortyEightHours, 500 - removed)
      .run<{ subject: string }>();
    removed += limits.results.length;
  }
  if (removed < 500) {
    const categories = await db
      .prepare(
        sql`DELETE FROM social_categories WHERE id IN
      (SELECT cat.id FROM social_categories cat WHERE cat.deleted_at IS NOT NULL AND cat.updated_at <= ?1
        AND NOT EXISTS (SELECT 1 FROM social_posts post WHERE post.category_id = cat.id)
        ORDER BY cat.updated_at,cat.id LIMIT ?2)
      AND deleted_at IS NOT NULL AND updated_at <= ?1
      AND NOT EXISTS (SELECT 1 FROM social_posts post WHERE post.category_id = social_categories.id)
      RETURNING id`,
      )
      .bind(nowMs - fortyEightHours, 500 - removed)
      .run<{ id: string }>();
    removed += categories.results.length;
  }
  return removed;
}
