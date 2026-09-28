import { parsePostIdInput } from '@/domain/social/command-input';
import { isFreshNewKey, keyTimestamp } from '@/domain/social/idempotency';

import { actorFailure, currentProfile, type SocialActor, type SocialOutcome } from './actor';
import { fromReceipt, receiptFor, requestHash } from './commands';
import { admitCommand } from './limits';
import { sql } from '../db/sql';

function prepareReceipt(actor: SocialActor) {
  return actor.db.prepare(sql`INSERT INTO social_commands(actor,key,request_hash,execution_nonce,
    result_code,resource_id,created_at)
  SELECT me.id,?,?,?,'ok',?,? FROM social_profiles me
  JOIN users u ON u.sub = me.sub JOIN sessions s ON s.sub = u.sub
  WHERE me.id = ? AND me.sub = ? AND s.sid = ? AND s.expires_at > ?
    AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)
  ON CONFLICT(actor,key) DO NOTHING`);
}

function prepareDelete(actor: SocialActor) {
  return actor.db.prepare(sql`DELETE FROM social_posts WHERE id = ? AND author = ?
    AND EXISTS (SELECT 1 FROM social_commands c WHERE c.actor = ?
      AND c.key = ? AND c.execution_nonce = ? AND c.result_code = 'ok')
    AND EXISTS (SELECT 1 FROM social_profiles me JOIN users u ON u.sub = me.sub
      JOIN sessions s ON s.sub = u.sub
      WHERE me.id = social_posts.author AND me.sub = ? AND s.sid = ?
        AND s.expires_at > ?
        AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub))`);
}

function prepareSelect(actor: SocialActor) {
  return actor.db.prepare(sql`SELECT c.actor,c.key,c.request_hash,c.execution_nonce,c.result_code,
    c.resource_id,c.result_version FROM social_commands c
  JOIN social_profiles me ON me.id = c.actor JOIN users u ON u.sub = me.sub
  JOIN sessions s ON s.sub = u.sub
  WHERE c.actor = ? AND c.key = ? AND me.sub = ? AND s.sid = ? AND s.expires_at > ?
    AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)`);
}

/** A missing or foreign post has the same successful response and no foreign mutation. */
export async function deletePost(
  actor: SocialActor,
  key: unknown,
  input: unknown,
): Promise<SocialOutcome<{ deleted: true }>> {
  const profile = await currentProfile(actor);
  if (profile === null) return { ok: false, code: await actorFailure(actor) };
  const admission = await admitCommand(actor, 'revoke');
  if (admission !== null) return { ok: false, code: admission };
  const parsed = parsePostIdInput(input);
  if (!parsed.ok || typeof key !== 'string') return { ok: false, code: 'validation' };
  const stamp = keyTimestamp(key);
  if (stamp === null) return { ok: false, code: 'validation' };
  const hash = await requestHash('POST', '/api/social/posts/delete', parsed.value);
  const old = await receiptFor(actor, key);
  if (old) {
    const reply = fromReceipt(old, hash, 'replay');
    return reply.ok ? { ok: true, value: { deleted: true } } : reply;
  }
  if (!isFreshNewKey(stamp, actor.nowMs)) return { ok: false, code: 'request-expired' };
  const nonce = crypto.randomUUID();
  const result = await actor.db.batch([
    prepareReceipt(actor).bind(
      key,
      hash,
      nonce,
      parsed.value.id,
      actor.nowMs,
      profile.id,
      actor.sub,
      actor.sid,
      actor.nowIso,
    ),
    prepareDelete(actor).bind(
      parsed.value.id,
      profile.id,
      profile.id,
      key,
      nonce,
      actor.sub,
      actor.sid,
      actor.nowIso,
    ),
    prepareSelect(actor).bind(profile.id, key, actor.sub, actor.sid, actor.nowIso),
  ]);
  const receipt = result[2].results[0] as Parameters<typeof fromReceipt>[0] | undefined;
  if (!receipt) return { ok: false, code: await actorFailure(actor) };
  const reply = fromReceipt(receipt, hash, nonce);
  return reply.ok ? { ok: true, value: { deleted: true } } : reply;
}
