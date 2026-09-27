import { parsePeerVersionInput } from '@/domain/social/command-input';
import { isFreshNewKey, keyTimestamp } from '@/domain/social/idempotency';

import { actorFailure, currentProfile, type SocialActor } from './actor';
import { fromReceipt, receiptFor, requestHash, type CommandReply } from './commands';
import { admitCommand } from './limits';
import { sql } from '../db/sql';

const insertReceipt = sql`INSERT INTO social_commands(actor,key,request_hash,execution_nonce,
  result_code,resource_id,result_version,created_at)
  SELECT me.id,?,?,?,CASE
    WHEN NOT EXISTS (SELECT 1 FROM social_profiles peer JOIN users pu ON pu.sub = peer.sub
      WHERE peer.id = ? AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = pu.sub))
      THEN 'unavailable'
    WHEN NOT EXISTS (SELECT 1 FROM social_pairs pair WHERE pair.lo = MIN(me.id,?)
      AND pair.hi = MAX(me.id,?) AND pair.state = 'pending' AND pair.requester = ?)
      THEN 'unavailable'
    WHEN NOT EXISTS (SELECT 1 FROM social_pairs pair WHERE pair.lo = MIN(me.id,?)
      AND pair.hi = MAX(me.id,?) AND pair.version = ?) THEN 'conflict'
    WHEN EXISTS (SELECT 1 FROM social_pairs pair WHERE pair.lo = MIN(me.id,?)
      AND pair.hi = MAX(me.id,?) AND pair.requested_at <= ?) THEN 'request-expired'
    ELSE 'ok' END, ?, (SELECT pair.version + 1 FROM social_pairs pair
      WHERE pair.lo = MIN(me.id,?) AND pair.hi = MAX(me.id,?)), ?
  FROM social_profiles me JOIN users u ON u.sub = me.sub JOIN sessions s ON s.sub = u.sub
  WHERE me.id = ? AND me.sub = ? AND s.sid = ? AND s.expires_at > ?
    AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)
  ON CONFLICT(actor,key) DO NOTHING`;

const updatePair = sql`UPDATE social_pairs SET state = 'none',requester = NULL,
  requested_at = NULL,version = version + 1
  WHERE lo = MIN(?,?) AND hi = MAX(?,?) AND state = 'pending'
    AND requester = ? AND version = ?
    AND EXISTS (SELECT 1 FROM social_commands c WHERE c.actor = ? AND c.key = ?
      AND c.execution_nonce = ? AND c.result_code = 'ok')
    AND EXISTS (SELECT 1 FROM social_profiles me JOIN users u ON u.sub = me.sub
      JOIN sessions s ON s.sub = u.sub WHERE me.id = ? AND me.sub = ?
      AND s.sid = ? AND s.expires_at > ?
      AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub))`;

const selectReceipt = sql`SELECT c.actor,c.key,c.request_hash,c.execution_nonce,c.result_code,
  c.resource_id,c.result_version FROM social_commands c
  JOIN social_profiles me ON me.id = c.actor JOIN users u ON u.sub = me.sub
  JOIN sessions s ON s.sub = u.sub WHERE c.actor = ? AND c.key = ?
    AND me.sub = ? AND s.sid = ? AND s.expires_at > ?
    AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)`;

export async function transitionPair(
  actor: SocialActor,
  key: unknown,
  dto: unknown,
  action: 'decline' | 'cancel',
): Promise<CommandReply> {
  const profile = await currentProfile(actor);
  if (profile === null) return { ok: false, code: await actorFailure(actor) };
  const admission = await admitCommand(actor, 'revoke');
  if (admission !== null) return { ok: false, code: admission };
  const input = parsePeerVersionInput(dto);
  if (!input.ok || input.value.peerId === profile.id || typeof key !== 'string')
    return { ok: false, code: 'validation' };
  const stamp = keyTimestamp(key);
  if (stamp === null) return { ok: false, code: 'validation' };
  const path = `/api/social/requests/${action}`;
  const hash = await requestHash('POST', path, input.value);
  const old = await receiptFor(actor, key);
  if (old) return fromReceipt(old, hash, 'replay');
  if (!isFreshNewKey(stamp, actor.nowMs)) return { ok: false, code: 'request-expired' };
  const peer = input.value.peerId;
  const requester = action === 'cancel' ? profile.id : peer;
  const nonce = crypto.randomUUID();
  const result = await actor.db.batch([
    actor.db
      .prepare(insertReceipt)
      .bind(
        key,
        hash,
        nonce,
        peer,
        peer,
        peer,
        requester,
        peer,
        peer,
        input.value.expectedVersion,
        peer,
        peer,
        actor.nowMs - 604800000,
        peer,
        peer,
        peer,
        actor.nowMs,
        profile.id,
        actor.sub,
        actor.sid,
        actor.nowIso,
      ),
    actor.db
      .prepare(updatePair)
      .bind(
        profile.id,
        peer,
        profile.id,
        peer,
        requester,
        input.value.expectedVersion,
        profile.id,
        key,
        nonce,
        profile.id,
        actor.sub,
        actor.sid,
        actor.nowIso,
      ),
    actor.db.prepare(selectReceipt).bind(profile.id, key, actor.sub, actor.sid, actor.nowIso),
  ]);
  const receipt = result[2].results[0] as Parameters<typeof fromReceipt>[0] | undefined;
  if (!receipt) return { ok: false, code: await actorFailure(actor) };
  const reply = fromReceipt(receipt, hash, nonce);
  return reply.ok && reply.value.didApply && result[1].meta.changes !== 1
    ? { ok: false, code: 'temporary' }
    : reply;
}
