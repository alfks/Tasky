import { parseInviteIdInput } from '@/domain/social/command-input';
import { isFreshNewKey, keyTimestamp } from '@/domain/social/idempotency';

import { actorFailure, currentProfile, type SocialActor } from './actor';
import { fromReceipt, receiptFor, requestHash, type CommandReply } from './commands';
import { admitCommand } from './limits';
import { sql } from '../db/sql';

function prepareInsertReceipt(actor: SocialActor) {
  return actor.db.prepare(sql`INSERT INTO social_commands(actor,key,request_hash,execution_nonce,
  result_code,resource_id,created_at)
  SELECT me.id,?,?,?,CASE WHEN EXISTS
    (SELECT 1 FROM social_invites i WHERE i.hash = ? AND i.owner = me.id
      AND i.status = 'active' AND i.expires_at > ?) THEN 'ok' ELSE 'unavailable' END,
    ?,? FROM social_profiles me JOIN users u ON u.sub = me.sub
    JOIN sessions s ON s.sub = u.sub WHERE me.id = ? AND me.sub = ?
      AND s.sid = ? AND s.expires_at > ?
      AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)
    ON CONFLICT(actor,key) DO NOTHING`);
}

function prepareUpdateInvite(actor: SocialActor) {
  return actor.db.prepare(sql`UPDATE social_invites SET status = 'revoked'
  WHERE hash = ? AND owner = ? AND status = 'active' AND expires_at > ?
    AND EXISTS (SELECT 1 FROM social_commands c WHERE c.actor = ? AND c.key = ?
      AND c.execution_nonce = ? AND c.result_code = 'ok')
    AND EXISTS (SELECT 1 FROM social_profiles me JOIN users u ON u.sub = me.sub
      JOIN sessions s ON s.sub = u.sub WHERE me.id = ? AND me.sub = ?
      AND s.sid = ? AND s.expires_at > ?
      AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub))`);
}

function prepareSelectReceipt(actor: SocialActor) {
  return actor.db.prepare(sql`SELECT c.actor,c.key,c.request_hash,c.execution_nonce,c.result_code,
  c.resource_id,c.result_version FROM social_commands c JOIN social_profiles me ON me.id = c.actor
  JOIN users u ON u.sub = me.sub JOIN sessions s ON s.sub = u.sub
  WHERE c.actor = ? AND c.key = ? AND me.sub = ? AND s.sid = ? AND s.expires_at > ?
    AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)`);
}

export async function revokeInvite(
  actor: SocialActor,
  key: unknown,
  dto: unknown,
): Promise<CommandReply> {
  const profile = await currentProfile(actor);
  if (profile === null) return { ok: false, code: await actorFailure(actor) };
  const admission = await admitCommand(actor, 'revoke');
  if (admission !== null) return { ok: false, code: admission };
  const input = parseInviteIdInput(dto);
  if (!input.ok || typeof key !== 'string') return { ok: false, code: 'validation' };
  const stamp = keyTimestamp(key);
  if (stamp === null) return { ok: false, code: 'validation' };
  const hash = await requestHash('POST', '/api/social/invites/revoke', input.value);
  const old = await receiptFor(actor, key);
  if (old) return fromReceipt(old, hash, 'replay');
  if (!isFreshNewKey(stamp, actor.nowMs)) return { ok: false, code: 'request-expired' };
  const nonce = crypto.randomUUID();
  const result = await actor.db.batch([
    prepareInsertReceipt(actor).bind(
      key,
      hash,
      nonce,
      input.value.inviteId,
      actor.nowMs,
      input.value.inviteId,
      actor.nowMs,
      profile.id,
      actor.sub,
      actor.sid,
      actor.nowIso,
    ),
    prepareUpdateInvite(actor).bind(
      input.value.inviteId,
      profile.id,
      actor.nowMs,
      profile.id,
      key,
      nonce,
      profile.id,
      actor.sub,
      actor.sid,
      actor.nowIso,
    ),
    prepareSelectReceipt(actor).bind(profile.id, key, actor.sub, actor.sid, actor.nowIso),
  ]);
  const receipt = result[2].results[0] as Parameters<typeof fromReceipt>[0] | undefined;
  if (!receipt) return { ok: false, code: await actorFailure(actor) };
  const reply = fromReceipt(receipt, hash, nonce);
  return reply.ok && reply.value.didApply && result[1].meta.changes !== 1
    ? { ok: false, code: 'temporary' }
    : reply;
}
