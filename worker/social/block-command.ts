import { parseBlockInput } from '@/domain/social/command-input';
import { isFreshNewKey, keyTimestamp } from '@/domain/social/idempotency';

import { actorFailure, currentProfile, type SocialActor } from './actor';
import { fromReceipt, receiptFor, requestHash, type CommandReply } from './commands';
import { admitCommand } from './limits';
import { sql } from '../db/sql';

/** Emergency block cuts a relationship even when no pair row existed. */
export async function blockPeer(
  actor: SocialActor,
  key: unknown,
  dto: unknown,
): Promise<CommandReply> {
  const profile = await currentProfile(actor);
  if (profile === null) return { ok: false, code: await actorFailure(actor) };
  const admission = await admitCommand(actor, 'revoke');
  if (admission !== null) return { ok: false, code: admission };
  const input = parseBlockInput(dto);
  if (!input.ok || !input.value.blocked) return { ok: false, code: 'validation' };
  if (input.value.peerId === profile.id) return { ok: false, code: 'validation' };
  const timestamp = keyTimestamp(key);
  if (timestamp === null || typeof key !== 'string') return { ok: false, code: 'validation' };
  const hash = await requestHash('POST', '/api/social/blocks/set', input.value);
  const old = await receiptFor(actor, key);
  if (old !== null) return fromReceipt(old, hash, 'new-request');
  if (!isFreshNewKey(timestamp, actor.nowMs)) return { ok: false, code: 'request-expired' };
  const nonce = crypto.randomUUID();
  const peerId = input.value.peerId;
  const lo = profile.id < peerId ? profile.id : peerId;
  const hi = profile.id < peerId ? peerId : profile.id;
  const results = await actor.db.batch([
    actor.db
      .prepare(
        sql`INSERT INTO social_commands(actor,key,request_hash,execution_nonce,
        result_code,resource_id,result_version,created_at)
      SELECT me.id,?,?,?,CASE
        WHEN NOT EXISTS (SELECT 1 FROM social_profiles peer JOIN users pu ON pu.sub = peer.sub
          WHERE peer.id = ? AND NOT EXISTS
            (SELECT 1 FROM deleted_users pd WHERE pd.sub = pu.sub)) THEN 'unavailable'
        WHEN (SELECT COUNT(*) FROM social_blocks b WHERE b.blocker = me.id) >= 1000
          AND NOT EXISTS (SELECT 1 FROM social_blocks b
            WHERE b.blocker = me.id AND b.blocked = ?) THEN 'limit-reached'
        ELSE 'ok' END,
        ?,COALESCE((SELECT pair.version + 1 FROM social_pairs pair
          WHERE pair.lo = ? AND pair.hi = ?),1),?
      FROM social_profiles me JOIN users u ON u.sub = me.sub
      JOIN sessions s ON s.sub = u.sub
      WHERE me.id = ? AND me.sub = ? AND s.sid = ? AND s.expires_at > ?
        AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)
      ON CONFLICT(actor,key) DO NOTHING`,
      )
      .bind(
        key,
        hash,
        nonce,
        peerId,
        peerId,
        peerId,
        lo,
        hi,
        actor.nowMs,
        profile.id,
        actor.sub,
        actor.sid,
        actor.nowIso,
      ),
    actor.db
      .prepare(
        sql`INSERT INTO social_pairs(lo,hi,state,requester,version,requested_at)
      SELECT ?,?,'none',NULL,COALESCE((SELECT version + 1 FROM social_pairs
        WHERE lo = ? AND hi = ?),1),NULL
      WHERE EXISTS (SELECT 1 FROM social_commands c WHERE c.actor = ? AND c.key = ?
        AND c.execution_nonce = ? AND c.result_code = 'ok')
        AND EXISTS (SELECT 1 FROM social_profiles me JOIN users u ON u.sub = me.sub
          JOIN sessions s ON s.sub = u.sub
          WHERE me.id = ? AND me.sub = ? AND s.sid = ? AND s.expires_at > ?
            AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub))
      ON CONFLICT(lo,hi) DO UPDATE SET state = 'none',requester = NULL,
        requested_at = NULL,version = excluded.version`,
      )
      .bind(lo, hi, lo, hi, profile.id, key, nonce, profile.id, actor.sub, actor.sid, actor.nowIso),
    actor.db
      .prepare(
        sql`INSERT INTO social_blocks(blocker,blocked,created_at)
      SELECT ?,?,? WHERE EXISTS
        (SELECT 1 FROM social_commands c WHERE c.actor = ? AND c.key = ?
          AND c.execution_nonce = ? AND c.result_code = 'ok')
        AND EXISTS (SELECT 1 FROM social_profiles me JOIN users u ON u.sub = me.sub
          JOIN sessions s ON s.sub = u.sub
          WHERE me.id = ? AND me.sub = ? AND s.sid = ? AND s.expires_at > ?
            AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub))
      ON CONFLICT(blocker,blocked) DO NOTHING`,
      )
      .bind(
        profile.id,
        peerId,
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
        sql`DELETE FROM social_reactions WHERE
        ((reactor = ? AND post_id IN (SELECT id FROM social_posts WHERE author = ?))
        OR (reactor = ? AND post_id IN (SELECT id FROM social_posts WHERE author = ?)))
        AND EXISTS (SELECT 1 FROM social_commands c WHERE c.actor = ? AND c.key = ?
          AND c.execution_nonce = ? AND c.result_code = 'ok')
        AND EXISTS (SELECT 1 FROM social_profiles me JOIN users u ON u.sub = me.sub
          JOIN sessions s ON s.sub = u.sub
          WHERE me.id = ? AND me.sub = ? AND s.sid = ? AND s.expires_at > ?
            AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub))`,
      )
      .bind(
        profile.id,
        peerId,
        peerId,
        profile.id,
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
        sql`UPDATE social_commands SET result_version = CASE
        WHEN EXISTS (SELECT 1 FROM social_pairs pair WHERE pair.lo = ? AND pair.hi = ?
          AND pair.state = 'none' AND pair.version = social_commands.result_version)
          AND EXISTS (SELECT 1 FROM social_blocks b WHERE b.blocker = social_commands.actor
            AND b.blocked = social_commands.resource_id)
        THEN result_version ELSE -1 END
      WHERE actor = ? AND key = ? AND execution_nonce = ? AND result_code = 'ok'
        AND EXISTS (SELECT 1 FROM social_profiles me JOIN users u ON u.sub = me.sub
          JOIN sessions s ON s.sub = u.sub WHERE me.id = social_commands.actor
            AND me.sub = ? AND s.sid = ? AND s.expires_at > ?
            AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub))`,
      )
      .bind(lo, hi, profile.id, key, nonce, actor.sub, actor.sid, actor.nowIso),
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
  return reply.ok && reply.value.didApply && results[1].meta.changes !== 1
    ? { ok: false, code: 'temporary' }
    : reply;
}
