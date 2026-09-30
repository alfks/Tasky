import { isFreshNewKey, keyTimestamp } from '@/domain/social/idempotency';
import { parsePostInput } from '@/domain/social/input';

import { actorFailure, currentProfile, type SocialActor, type SocialOutcome } from './actor';
import { fromReceipt, receiptFor, requestHash } from './commands';
import { admitCommand } from './limits';
import { sql } from '../db/sql';

const DAY = 86_400_000;

function prepareReceipt(actor: SocialActor) {
  return actor.db.prepare(sql`INSERT INTO social_commands(actor,key,request_hash,execution_nonce,
    result_code,resource_id,result_version,created_at)
  SELECT me.id,?2,?3,?4,
    CASE
      WHEN ?11 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM social_categories cat
        WHERE cat.id = ?11 AND cat.owner = me.id AND cat.deleted_at IS NULL) THEN 'unavailable'
      WHEN ?11 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM social_categories cat
        WHERE cat.id = ?11 AND cat.owner = me.id AND cat.version = ?12) THEN 'conflict'
      WHEN (SELECT COUNT(*) FROM social_posts p WHERE p.author = me.id) >= 1000
        THEN 'limit-reached'
      WHEN COALESCE((SELECT count FROM social_limits lim
        WHERE lim.subject = 'p:' || me.id AND lim.bucket = 'post-create'
          AND lim.window_start = ?7),0) >= 20 THEN 'limit-reached'
      ELSE 'ok' END,
    ?5,COALESCE((SELECT count + 1 FROM social_limits lim
      WHERE lim.subject = 'p:' || me.id AND lim.bucket = 'post-create'
        AND lim.window_start = ?7),1),?6
  FROM social_profiles me JOIN users u ON u.sub = me.sub
  JOIN sessions s ON s.sub = u.sub
  WHERE me.id = ?1 AND me.sub = ?8 AND s.sid = ?9 AND s.expires_at > ?10
    AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)
  ON CONFLICT(actor,key) DO NOTHING`);
}

function preparePostInsert(actor: SocialActor) {
  return actor.db
    .prepare(sql`INSERT INTO social_posts(id,author,text,happened_on,created_at,category_id)
  SELECT ?1,me.id,?2,?3,?4,?11 FROM social_profiles me
  JOIN users u ON u.sub = me.sub JOIN sessions s ON s.sub = u.sub
  WHERE me.id = ?5 AND me.sub = ?6 AND s.sid = ?7 AND s.expires_at > ?8
    AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)
    AND (?11 IS NULL OR EXISTS (SELECT 1 FROM social_categories cat
      WHERE cat.id = ?11 AND cat.owner = me.id AND cat.version = ?12 AND cat.deleted_at IS NULL))
    AND EXISTS (SELECT 1 FROM social_commands c WHERE c.actor = me.id
      AND c.key = ?9 AND c.execution_nonce = ?10 AND c.result_code = 'ok') RETURNING id`);
}

function prepareCounter(actor: SocialActor) {
  return actor.db.prepare(sql`INSERT INTO social_limits(subject,bucket,window_start,count)
  SELECT 'p:' || me.id,'post-create',?,1 FROM social_profiles me
  JOIN users u ON u.sub = me.sub JOIN sessions s ON s.sub = u.sub
  WHERE me.id = ? AND me.sub = ? AND s.sid = ? AND s.expires_at > ?
    AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)
    AND EXISTS (SELECT 1 FROM social_commands c WHERE c.actor = me.id
      AND c.key = ? AND c.execution_nonce = ? AND c.result_code = 'ok')
  ON CONFLICT(subject,bucket,window_start) DO UPDATE SET count = count + 1
    WHERE count < 20 RETURNING count`);
}

function prepareVerify(actor: SocialActor) {
  return actor.db.prepare(sql`UPDATE social_commands SET result_version = CASE
    WHEN EXISTS (SELECT 1 FROM social_posts p WHERE p.id = social_commands.resource_id
      AND p.author = social_commands.actor)
      AND NOT EXISTS (SELECT 1 FROM social_posts p JOIN social_categories cat ON cat.id = p.category_id
        WHERE p.id = social_commands.resource_id AND cat.visibility = 'public' AND cat.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM social_public_posts hint WHERE hint.id = p.id
            AND hint.category_id = cat.id AND hint.created_at = p.created_at))
      AND NOT EXISTS (SELECT 1 FROM social_posts p LEFT JOIN social_categories cat ON cat.id = p.category_id
        WHERE p.id = social_commands.resource_id
          AND (p.category_id IS NULL OR (cat.owner = p.author AND cat.visibility IN ('friends','public') AND cat.deleted_at IS NULL))
          AND NOT EXISTS (SELECT 1 FROM social_friend_posts hint WHERE hint.id = p.id
            AND hint.author = p.author AND hint.category_id IS p.category_id AND hint.created_at = p.created_at))
      AND EXISTS (SELECT 1 FROM social_limits lim
        WHERE lim.subject = 'p:' || social_commands.actor AND lim.bucket = 'post-create'
          AND lim.window_start = ? AND lim.count = social_commands.result_version)
    THEN result_version ELSE -1 END
  WHERE actor = ? AND key = ? AND execution_nonce = ? AND result_code = 'ok'
    AND EXISTS (SELECT 1 FROM social_profiles me JOIN users u ON u.sub = me.sub
      JOIN sessions s ON s.sub = u.sub WHERE me.id = social_commands.actor
        AND me.sub = ? AND s.sid = ? AND s.expires_at > ?
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

function randomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function commitPost(
  actor: SocialActor,
  profileId: string,
  key: string,
  hash: string,
  nonce: string,
  id: string,
  text: string,
  happenedOn: string,
  categoryId: string | null,
  categoryVersion: number | null,
) {
  const dayStart = Math.floor(actor.nowMs / DAY) * DAY;
  return actor.db.batch([
    prepareReceipt(actor).bind(
      profileId,
      key,
      hash,
      nonce,
      id,
      actor.nowMs,
      dayStart,
      actor.sub,
      actor.sid,
      actor.nowIso,
      categoryId,
      categoryVersion,
    ),
    preparePostInsert(actor).bind(
      id,
      text,
      happenedOn,
      actor.nowMs,
      profileId,
      actor.sub,
      actor.sid,
      actor.nowIso,
      key,
      nonce,
      categoryId,
      categoryVersion,
    ),
    prepareCounter(actor).bind(dayStart, profileId, actor.sub, actor.sid, actor.nowIso, key, nonce),
    prepareVerify(actor).bind(dayStart, profileId, key, nonce, actor.sub, actor.sid, actor.nowIso),
    prepareSelect(actor).bind(profileId, key, actor.sub, actor.sid, actor.nowIso),
  ]);
}

/** Receipt, immutable post copy and successful daily count are one transaction. */
export async function createPost(
  actor: SocialActor,
  key: unknown,
  input: unknown,
): Promise<SocialOutcome<{ id: string; didApply: boolean }>> {
  const profile = await currentProfile(actor);
  if (profile === null) return { ok: false, code: await actorFailure(actor) };
  const admission = await admitCommand(actor, 'write');
  if (admission !== null) return { ok: false, code: admission };
  const parsed = parsePostInput(input);
  if (!parsed.ok || typeof key !== 'string') return { ok: false, code: 'validation' };
  const stamp = keyTimestamp(key);
  if (stamp === null) return { ok: false, code: 'validation' };
  const hash = await requestHash('POST', '/api/social/posts', parsed.value);
  const old = await receiptFor(actor, key);
  if (old) {
    const reply = fromReceipt(old, hash, 'replay');
    return reply.ok && reply.value.resourceId
      ? { ok: true, value: { id: reply.value.resourceId, didApply: false } }
      : reply.ok
        ? { ok: false, code: 'temporary' }
        : reply;
  }
  if (!isFreshNewKey(stamp, actor.nowMs)) return { ok: false, code: 'request-expired' };
  const nonce = crypto.randomUUID();
  const id = randomId();
  const result = await commitPost(
    actor,
    profile.id,
    key,
    hash,
    nonce,
    id,
    parsed.value.text,
    parsed.value.happenedOn,
    parsed.value.categoryId ?? null,
    parsed.value.categoryVersion ?? null,
  );
  const receipt = result[4].results[0] as Parameters<typeof fromReceipt>[0] | undefined;
  if (!receipt) return { ok: false, code: await actorFailure(actor) };
  const reply = fromReceipt(receipt, hash, nonce);
  if (!reply.ok) return reply;
  if (
    !reply.value.resourceId ||
    (reply.value.didApply && (result[1].results.length !== 1 || result[2].results.length !== 1))
  )
    return { ok: false, code: 'temporary' };
  return { ok: true, value: { id: reply.value.resourceId, didApply: reply.value.didApply } };
}
