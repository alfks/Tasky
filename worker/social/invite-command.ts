import { parseTokenInput } from '@/domain/social/command-input';
import { isFreshNewKey, keyTimestamp } from '@/domain/social/idempotency';

import { actorFailure, currentAccount, currentProfile, type SocialActor } from './actor';
import { fromReceipt, receiptFor, requestHash, type CommandReply } from './commands';
import { admitCommand, limitSubject, reserveLimit } from './limits';
import { sql } from '../db/sql';

import type { SocialOutcome } from './actor';

const DAY = 86_400_000;

export async function tokenHash(token: string): Promise<string> {
  const hash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
  );
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Pre-profile read: no token appears in URL, receipt, log or persisted body. */
export async function previewInvite(
  actor: SocialActor,
  secret: string,
  input: unknown,
): Promise<SocialOutcome<{ nickname: string; expiresAt: number }>> {
  const parsed = parseTokenInput(input);
  if (!parsed.ok) return { ok: false, code: 'validation' };
  if (!(await currentAccount(actor))) return { ok: false, code: await actorFailure(actor) };
  const subject = await limitSubject(actor, secret, 'pre');
  if (subject === null || !(await reserveLimit(actor, subject, 'preview'))) {
    return { ok: false, code: 'rate-limited' };
  }
  const hash = await tokenHash(parsed.value.token);
  const row = await actor.db
    .prepare(
      sql`SELECT p.nickname,i.expires_at AS expiresAt
      FROM social_invites i JOIN social_profiles p ON p.id = i.owner
      JOIN users owner_user ON owner_user.sub = p.sub
      JOIN sessions s ON s.sid = ? AND s.sub = ?
      JOIN users viewer ON viewer.sub = s.sub
      WHERE i.hash = ? AND i.status = 'active' AND i.expires_at > ?
        AND s.expires_at > ?
        AND NOT EXISTS (SELECT 1 FROM deleted_users d
          WHERE d.sub IN (owner_user.sub,viewer.sub))`,
    )
    .bind(actor.sid, actor.sub, hash, actor.nowMs, actor.nowIso)
    .first<{ nickname: string; expiresAt: number }>();
  return row ? { ok: true, value: row } : { ok: false, code: 'unavailable' };
}

/** One-use invite and pending pair are guarded by the same new nonce. */
export async function consumeInvite(
  actor: SocialActor,
  key: unknown,
  input: unknown,
): Promise<CommandReply> {
  const profile = await currentProfile(actor);
  if (profile === null) return { ok: false, code: await actorFailure(actor) };
  const admission = await admitCommand(actor, 'write');
  if (admission !== null) return { ok: false, code: admission };
  const parsed = parseTokenInput(input);
  if (!parsed.ok) return { ok: false, code: 'validation' };
  const timestamp = keyTimestamp(key);
  if (timestamp === null || typeof key !== 'string') return { ok: false, code: 'validation' };
  const hash = await requestHash('POST', '/api/social/requests', parsed.value);
  const old = await receiptFor(actor, key);
  if (old !== null) return fromReceipt(old, hash, 'new-request');
  if (!isFreshNewKey(timestamp, actor.nowMs)) return { ok: false, code: 'request-expired' };
  const inviteHash = await tokenHash(parsed.value.token);
  const nonce = crypto.randomUUID();
  const results = await actor.db.batch([
    actor.db
      .prepare(
        sql`INSERT INTO social_commands(actor,key,request_hash,execution_nonce,
        result_code,resource_id,result_version,created_at)
      SELECT me.id,?3,?4,?5,
        CASE
          WHEN NOT EXISTS (SELECT 1 FROM social_invites i
            JOIN social_profiles owner ON owner.id = i.owner
            JOIN users ou ON ou.sub = owner.sub
            WHERE i.hash = ?2 AND i.status = 'active' AND i.expires_at > ?6
              AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = ou.sub))
            THEN 'unavailable'
          WHEN EXISTS (SELECT 1 FROM social_invites i WHERE i.hash = ?2 AND i.owner = ?1)
            THEN 'unavailable'
          WHEN EXISTS (SELECT 1 FROM social_invites i JOIN social_blocks b
            ON (b.blocker = ?1 AND b.blocked = i.owner)
              OR (b.blocker = i.owner AND b.blocked = ?1)
            WHERE i.hash = ?2) THEN 'unavailable'
          WHEN EXISTS (SELECT 1 FROM social_invites i JOIN social_pairs pair
            ON pair.lo = MIN(?1,i.owner) AND pair.hi = MAX(?1,i.owner)
            WHERE i.hash = ?2 AND pair.state = 'pending'
              AND pair.requested_at > ?6 - 604800000) THEN 'request-pending'
          WHEN EXISTS (SELECT 1 FROM social_invites i JOIN social_pairs pair
            ON pair.lo = MIN(?1,i.owner) AND pair.hi = MAX(?1,i.owner)
            WHERE i.hash = ?2 AND pair.state = 'accepted') THEN 'conflict'
          WHEN (SELECT COUNT(*) FROM social_pairs pair WHERE pair.requester = ?1
            AND pair.state = 'pending' AND pair.requested_at > ?6 - 604800000) >= 10
            OR (SELECT COUNT(*) FROM social_pairs pair JOIN social_invites i ON i.hash = ?2
              WHERE pair.state = 'pending' AND pair.requester <> i.owner
                AND (pair.lo = i.owner OR pair.hi = i.owner)
                AND pair.requested_at > ?6 - 604800000) >= 50
            THEN 'limit-reached'
          ELSE 'ok' END,
        (SELECT owner FROM social_invites WHERE hash = ?2),
        COALESCE((SELECT pair.version + CASE WHEN pair.state = 'pending'
          AND pair.requested_at <= ?6 - 604800000 THEN 2 ELSE 1 END
          FROM social_pairs pair JOIN social_invites i
          ON pair.lo = MIN(?1,i.owner) AND pair.hi = MAX(?1,i.owner)
          WHERE i.hash = ?2),1),?6
      FROM social_profiles me JOIN users u ON u.sub = me.sub
      JOIN sessions s ON s.sub = u.sub
      WHERE me.id = ?1 AND me.sub = ?7 AND s.sid = ?8 AND s.expires_at > ?9
        AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)
      ON CONFLICT(actor,key) DO NOTHING`,
      )
      .bind(
        profile.id,
        inviteHash,
        key,
        hash,
        nonce,
        actor.nowMs,
        actor.sub,
        actor.sid,
        actor.nowIso,
      ),
    actor.db
      .prepare(
        sql`UPDATE social_pairs SET state = 'none',requester = NULL,
        requested_at = NULL,version = version + 1
      WHERE state = 'pending' AND requested_at <= ?
        AND EXISTS (SELECT 1 FROM social_invites i WHERE i.hash = ?
          AND social_pairs.lo = MIN(?,i.owner) AND social_pairs.hi = MAX(?,i.owner))
        AND version = (SELECT c.result_version - 2 FROM social_commands c
          WHERE c.actor = ? AND c.key = ? AND c.execution_nonce = ? AND c.result_code = 'ok')
        AND EXISTS (SELECT 1 FROM social_commands c WHERE c.actor = ? AND c.key = ?
          AND c.execution_nonce = ? AND c.result_code = 'ok')
        AND EXISTS (SELECT 1 FROM social_profiles me JOIN users u ON u.sub = me.sub
          JOIN sessions s ON s.sub = u.sub
          WHERE me.id = ? AND me.sub = ? AND s.sid = ? AND s.expires_at > ?
            AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub))`,
      )
      .bind(
        actor.nowMs - 7 * DAY,
        inviteHash,
        profile.id,
        profile.id,
        profile.id,
        key,
        nonce,
        profile.id,
        key,
        nonce,
        profile.id,
        actor.sub,
        actor.sid,
        actor.nowIso,
      ),
    actor.db
      .prepare(
        sql`UPDATE social_invites SET status = 'used',used_by = ?
      WHERE hash = ? AND status = 'active' AND expires_at > ?
        AND EXISTS (SELECT 1 FROM social_commands c WHERE c.actor = ? AND c.key = ?
          AND c.execution_nonce = ? AND c.result_code = 'ok')
        AND EXISTS (SELECT 1 FROM social_profiles me JOIN users u ON u.sub = me.sub
          JOIN sessions s ON s.sub = u.sub
          WHERE me.id = ? AND me.sub = ? AND s.sid = ? AND s.expires_at > ?
            AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub))`,
      )
      .bind(
        profile.id,
        inviteHash,
        actor.nowMs,
        profile.id,
        key,
        nonce,
        profile.id,
        actor.sub,
        actor.sid,
        actor.nowIso,
      ),
    actor.db
      .prepare(
        sql`INSERT INTO social_pairs(lo,hi,state,requester,version,requested_at)
      SELECT MIN(c.actor,c.resource_id),MAX(c.actor,c.resource_id),'pending',c.actor,
        c.result_version,?
      FROM social_commands c WHERE c.actor = ? AND c.key = ?
        AND c.execution_nonce = ? AND c.result_code = 'ok'
        AND EXISTS (SELECT 1 FROM social_invites i WHERE i.hash = ?
          AND i.status = 'used' AND i.used_by = c.actor AND i.owner = c.resource_id)
        AND EXISTS (SELECT 1 FROM social_profiles me JOIN users u ON u.sub = me.sub
          JOIN sessions s ON s.sub = u.sub
          WHERE me.id = ? AND me.sub = ? AND s.sid = ? AND s.expires_at > ?
            AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub))
      ON CONFLICT(lo,hi) DO UPDATE SET state = 'pending',requester = excluded.requester,
        version = excluded.version,requested_at = excluded.requested_at
        WHERE social_pairs.state = 'none'
          AND social_pairs.version = excluded.version - 1`,
      )
      .bind(
        actor.nowMs,
        profile.id,
        key,
        nonce,
        inviteHash,
        profile.id,
        actor.sub,
        actor.sid,
        actor.nowIso,
      ),
    actor.db
      .prepare(
        sql`UPDATE social_commands SET result_version = CASE
        WHEN EXISTS (SELECT 1 FROM social_pairs pair
          WHERE pair.lo = MIN(social_commands.actor,social_commands.resource_id)
            AND pair.hi = MAX(social_commands.actor,social_commands.resource_id)
            AND pair.state = 'pending' AND pair.requester = social_commands.actor
            AND pair.version = social_commands.result_version)
          AND EXISTS (SELECT 1 FROM social_invites i WHERE i.hash = ?
            AND i.owner = social_commands.resource_id AND i.status = 'used'
            AND i.used_by = social_commands.actor)
        THEN result_version ELSE -1 END
      WHERE actor = ? AND key = ? AND execution_nonce = ? AND result_code = 'ok'
        AND EXISTS (SELECT 1 FROM social_profiles me JOIN users u ON u.sub = me.sub
          JOIN sessions s ON s.sub = u.sub
          WHERE me.id = social_commands.actor AND me.sub = ?
            AND s.sid = ? AND s.expires_at > ?
            AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub))`,
      )
      .bind(inviteHash, profile.id, key, nonce, actor.sub, actor.sid, actor.nowIso),
    actor.db
      .prepare(
        sql`SELECT c.actor,c.key,c.request_hash,c.execution_nonce,c.result_code,
        c.resource_id,c.result_version FROM social_commands c
      JOIN social_profiles me ON me.id = c.actor JOIN users u ON u.sub = me.sub
      JOIN sessions s ON s.sub = u.sub
      WHERE c.actor = ? AND c.key = ? AND me.sub = ? AND s.sid = ? AND s.expires_at > ?
        AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)`,
      )
      .bind(profile.id, key, actor.sub, actor.sid, actor.nowIso),
  ]);
  const receipt = results[5].results[0] as Parameters<typeof fromReceipt>[0] | undefined;
  if (receipt === undefined) return { ok: false, code: await actorFailure(actor) };
  const reply = fromReceipt(receipt ?? null, hash, nonce);
  return reply.ok &&
    reply.value.didApply &&
    (results[2].meta.changes !== 1 || results[3].meta.changes !== 1)
    ? { ok: false, code: 'temporary' }
    : reply;
}

/** The stored status has no expired enum; only active plus time derives expiry. */
export function inviteExpiresAt(createdAt: number): number {
  return createdAt + DAY;
}
