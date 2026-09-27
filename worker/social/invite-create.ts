import { parseEmptyInput } from '@/domain/social/command-input';
import { isFreshNewKey, keyTimestamp } from '@/domain/social/idempotency';
import type { InviteCreated } from '@/domain/social/social';

import { actorFailure, currentProfile, type SocialActor, type SocialOutcome } from './actor';
import { fromReceipt, receiptFor, requestHash } from './commands';
import { tokenHash } from './invite-command';
import { admitCommand } from './limits';
import { sql } from '../db/sql';

const DAY = 86_400_000;

/** Representative success-count operation: receipt, invite and daily counter commit together. */
export async function createInvite(
  actor: SocialActor,
  key: unknown,
  input: unknown,
): Promise<SocialOutcome<InviteCreated>> {
  const profile = await currentProfile(actor);
  if (profile === null) return { ok: false, code: await actorFailure(actor) };
  const admission = await admitCommand(actor, 'write');
  if (admission !== null) return { ok: false, code: admission };
  if (!parseEmptyInput(input).ok) return { ok: false, code: 'validation' };
  const timestamp = keyTimestamp(key);
  if (timestamp === null || typeof key !== 'string') return { ok: false, code: 'validation' };
  const hash = await requestHash('POST', '/api/social/invites', {});
  const old = await receiptFor(actor, key);
  if (old !== null) {
    const prior = fromReceipt(old, hash, 'new-request');
    if (!prior.ok) return prior;
    return prior.value.resourceId === null
      ? { ok: false, code: 'temporary' }
      : { ok: true, value: { inviteId: prior.value.resourceId, tokenUnavailable: true } };
  }
  if (!isFreshNewKey(timestamp, actor.nowMs)) return { ok: false, code: 'request-expired' };
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  const inviteHash = await tokenHash(token);
  const nonce = crypto.randomUUID();
  const dayStart = Math.floor(actor.nowMs / DAY) * DAY;
  const results = await actor.db.batch([
    actor.db
      .prepare(
        sql`INSERT INTO social_commands(actor,key,request_hash,execution_nonce,
        result_code,resource_id,result_version,created_at)
      SELECT me.id,?2,?3,?4,
        CASE
          WHEN (SELECT COUNT(*) FROM social_invites i WHERE i.owner = me.id
            AND i.status = 'active' AND i.expires_at > ?6) >= 5 THEN 'limit-reached'
          WHEN COALESCE((SELECT count FROM social_limits lim WHERE lim.subject = 'p:' || me.id
            AND lim.bucket = 'invite-create' AND lim.window_start = ?7),0) >= 20
            THEN 'limit-reached'
          ELSE 'ok' END,
        ?5,COALESCE((SELECT count + 1 FROM social_limits lim
          WHERE lim.subject = 'p:' || me.id AND lim.bucket = 'invite-create'
            AND lim.window_start = ?7),1),?6
      FROM social_profiles me JOIN users u ON u.sub = me.sub
      JOIN sessions s ON s.sub = u.sub
      WHERE me.id = ?1 AND me.sub = ?8 AND s.sid = ?9 AND s.expires_at > ?10
        AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)
      ON CONFLICT(actor,key) DO NOTHING`,
      )
      .bind(
        profile.id,
        key,
        hash,
        nonce,
        inviteHash,
        actor.nowMs,
        dayStart,
        actor.sub,
        actor.sid,
        actor.nowIso,
      ),
    actor.db
      .prepare(
        sql`INSERT INTO social_invites(hash,owner,expires_at,status,created_at)
      SELECT ?,me.id,?,'active',? FROM social_profiles me
      JOIN users u ON u.sub = me.sub JOIN sessions s ON s.sub = u.sub
      WHERE me.id = ? AND me.sub = ? AND s.sid = ? AND s.expires_at > ?
        AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)
        AND EXISTS (SELECT 1 FROM social_commands c WHERE c.actor = me.id
          AND c.key = ? AND c.execution_nonce = ? AND c.result_code = 'ok')`,
      )
      .bind(
        inviteHash,
        actor.nowMs + DAY,
        actor.nowMs,
        profile.id,
        actor.sub,
        actor.sid,
        actor.nowIso,
        key,
        nonce,
      ),
    actor.db
      .prepare(
        sql`INSERT INTO social_limits(subject,bucket,window_start,count)
      SELECT 'p:' || me.id,'invite-create',?,1 FROM social_profiles me
      JOIN users u ON u.sub = me.sub JOIN sessions s ON s.sub = u.sub
      WHERE me.id = ? AND me.sub = ? AND s.sid = ? AND s.expires_at > ?
        AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)
        AND EXISTS (SELECT 1 FROM social_commands c WHERE c.actor = me.id
          AND c.key = ? AND c.execution_nonce = ? AND c.result_code = 'ok')
      ON CONFLICT(subject,bucket,window_start) DO UPDATE SET count = count + 1
        WHERE count < 20 RETURNING count`,
      )
      .bind(dayStart, profile.id, actor.sub, actor.sid, actor.nowIso, key, nonce),
    actor.db
      .prepare(
        sql`UPDATE social_commands SET result_version = CASE
        WHEN EXISTS (SELECT 1 FROM social_invites i WHERE i.hash = social_commands.resource_id
          AND i.owner = social_commands.actor AND i.status = 'active' AND i.expires_at > ?)
          AND EXISTS (SELECT 1 FROM social_limits lim
            WHERE lim.subject = 'p:' || social_commands.actor
              AND lim.bucket = 'invite-create' AND lim.window_start = ?
              AND lim.count = social_commands.result_version)
        THEN result_version ELSE -1 END
      WHERE actor = ? AND key = ? AND execution_nonce = ? AND result_code = 'ok'
        AND EXISTS (SELECT 1 FROM social_profiles me JOIN users u ON u.sub = me.sub
          JOIN sessions s ON s.sub = u.sub WHERE me.id = social_commands.actor
            AND me.sub = ? AND s.sid = ? AND s.expires_at > ?
            AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub))`,
      )
      .bind(actor.nowMs, dayStart, profile.id, key, nonce, actor.sub, actor.sid, actor.nowIso),
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
  const receipt = results[4].results[0] as Parameters<typeof fromReceipt>[0] | undefined;
  if (receipt === undefined) return { ok: false, code: await actorFailure(actor) };
  const reply = fromReceipt(receipt, hash, nonce);
  if (!reply.ok) return reply;
  if (!reply.value.didApply) {
    return reply.value.resourceId === null
      ? { ok: false, code: 'temporary' }
      : { ok: true, value: { inviteId: reply.value.resourceId, tokenUnavailable: true } };
  }
  if (results[1].meta.changes !== 1 || results[2].results.length !== 1) {
    return { ok: false, code: 'temporary' };
  }
  return { ok: true, value: { token, expiresAt: actor.nowMs + DAY } };
}
