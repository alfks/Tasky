import { parsePeerVersionInput } from '@/domain/social/command-input';
import { isFreshNewKey, keyTimestamp } from '@/domain/social/idempotency';

import { currentProfile, type SocialActor } from './actor';
import { fromReceipt, receiptFor, requestHash, type CommandReply } from './commands';
import { reserveLimit } from './limits';

import { sql } from '../db/sql';

const REQUEST_MS = 7 * 24 * 60 * 60 * 1000;

/** Acceptance is one D1 transaction: current A, peer, blocks, counts and CAS precede effects. */
export async function acceptPair(
  actor: SocialActor,
  key: unknown,
  dto: unknown,
): Promise<CommandReply> {
  const input = parsePeerVersionInput(dto);
  if (!input.ok) return { ok: false, code: 'validation' };
  const profile = await currentProfile(actor);
  if (profile === null) return { ok: false, code: 'unavailable' };
  if (input.value.peerId === profile.id) return { ok: false, code: 'validation' };
  const timestamp = keyTimestamp(key);
  if (timestamp === null || typeof key !== 'string') return { ok: false, code: 'validation' };
  const hash = await requestHash('POST', '/api/social/requests/accept', input.value);
  const old = await receiptFor(actor, key);
  if (old !== null) return fromReceipt(old, hash, 'new-request');
  if (!isFreshNewKey(timestamp, actor.nowMs)) return { ok: false, code: 'request-expired' };
  if (!(await reserveLimit(actor, `p:${profile.id}`, 'write'))) {
    return { ok: false, code: 'rate-limited' };
  }
  const nonce = crypto.randomUUID();
  const { peerId, expectedVersion } = input.value;
  const lo = profile.id < peerId ? profile.id : peerId;
  const hi = profile.id < peerId ? peerId : profile.id;
  const results = await actor.db.batch([
    actor.db.prepare(sql`INSERT INTO social_commands(actor,key,request_hash,execution_nonce,
        result_code,resource_id,result_version,created_at)
      SELECT me.id,?3,?4,?5,
        CASE
          WHEN NOT EXISTS (SELECT 1 FROM social_profiles peer JOIN users pu ON pu.sub = peer.sub
            WHERE peer.id = ?2 AND NOT EXISTS
              (SELECT 1 FROM deleted_users pd WHERE pd.sub = pu.sub)) THEN 'unavailable'
          WHEN EXISTS (SELECT 1 FROM social_blocks b WHERE
            (b.blocker = ?1 AND b.blocked = ?2) OR (b.blocker = ?2 AND b.blocked = ?1))
            THEN 'unavailable'
          WHEN EXISTS (SELECT 1 FROM social_pairs pair WHERE pair.lo = MIN(?1,?2)
            AND pair.hi = MAX(?1,?2) AND pair.state = 'pending'
            AND pair.requested_at <= ?7 - 604800000) THEN 'request-expired'
          WHEN NOT EXISTS (SELECT 1 FROM social_pairs pair WHERE pair.lo = MIN(?1,?2)
            AND pair.hi = MAX(?1,?2) AND pair.state = 'pending'
            AND pair.requester = ?2 AND pair.version = ?6
            AND pair.requested_at > ?7 - 604800000) THEN 'conflict'
          WHEN (SELECT COUNT(*) FROM social_pairs pair WHERE pair.state = 'accepted'
            AND (pair.lo = ?1 OR pair.hi = ?1)) >= 50
            OR (SELECT COUNT(*) FROM social_pairs pair WHERE pair.state = 'accepted'
            AND (pair.lo = ?2 OR pair.hi = ?2)) >= 50 THEN 'limit-reached'
          ELSE 'ok' END,
        ?2,(SELECT pair.version + 1 FROM social_pairs pair
          WHERE pair.lo = MIN(?1,?2) AND pair.hi = MAX(?1,?2)),?7
      FROM social_profiles me JOIN users u ON u.sub = me.sub
      JOIN sessions s ON s.sub = u.sub
      WHERE me.id = ?1 AND me.sub = ?9 AND s.sid = ?10 AND s.expires_at > ?8
        AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)
      ON CONFLICT(actor,key) DO NOTHING`)
      .bind(profile.id, peerId, key, hash, nonce, expectedVersion, actor.nowMs,
        actor.nowIso, actor.sub, actor.sid),
    actor.db.prepare(sql`UPDATE social_pairs SET state = 'accepted',requester = NULL,
        requested_at = NULL,version = version + 1
      WHERE lo = ?1 AND hi = ?2 AND state = 'pending' AND requester = ?3
        AND version = ?4 AND requested_at > ?5 - 604800000
        AND EXISTS (SELECT 1 FROM social_commands c WHERE c.actor = ?6 AND c.key = ?7
          AND c.execution_nonce = ?8 AND c.result_code = 'ok')
        AND EXISTS (SELECT 1 FROM sessions s JOIN users u ON u.sub = s.sub
          JOIN social_profiles me ON me.sub = u.sub
          WHERE s.sid = ?9 AND s.sub = ?10 AND s.expires_at > ?11 AND me.id = ?6
            AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub))`)
      .bind(lo, hi, peerId, expectedVersion, actor.nowMs, profile.id, key, nonce,
        actor.sid, actor.sub, actor.nowIso),
    actor.db.prepare(sql`SELECT c.actor,c.key,c.request_hash,c.execution_nonce,c.result_code,
        c.resource_id,c.result_version FROM social_commands c
      JOIN social_profiles me ON me.id = c.actor JOIN users u ON u.sub = me.sub
      JOIN sessions s ON s.sub = u.sub
      WHERE c.actor = ? AND c.key = ? AND me.sub = ? AND s.sid = ? AND s.expires_at > ?
        AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)`)
      .bind(profile.id, key, actor.sub, actor.sid, actor.nowIso),
  ]);
  const receipt = results[2].results[0] as Parameters<typeof fromReceipt>[0] | undefined;
  const reply = fromReceipt(receipt ?? null, hash, nonce);
  return reply.ok && reply.value.didApply && results[1].meta.changes !== 1
    ? { ok: false, code: 'temporary' }
    : reply;
}

/** Expiration is a versioned none tombstone on the next related write. */
export async function expirePendingPair(actor: SocialActor, peerId: string): Promise<boolean> {
  if (actor.profileId === null) return false;
  const lo = actor.profileId < peerId ? actor.profileId : peerId;
  const hi = actor.profileId < peerId ? peerId : actor.profileId;
  const result = await actor.db.prepare(sql`UPDATE social_pairs
      SET state = 'none',requester = NULL,requested_at = NULL,version = version + 1
      WHERE lo = ? AND hi = ? AND state = 'pending' AND requested_at <= ?
        AND EXISTS (SELECT 1 FROM social_profiles p JOIN users u ON u.sub = p.sub
          JOIN sessions s ON s.sub = u.sub WHERE p.id = ? AND p.sub = ?
            AND s.sid = ? AND s.expires_at > ?
            AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub))`)
    .bind(lo, hi, actor.nowMs - REQUEST_MS, actor.profileId, actor.sub, actor.sid, actor.nowIso)
    .run();
  return result.meta.changes === 1;
}
