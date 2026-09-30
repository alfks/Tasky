import { parseReactionInput } from '@/domain/social/command-input';
import { isFreshNewKey, keyTimestamp } from '@/domain/social/idempotency';

import {
  actorFailure,
  currentProfile,
  visiblePost,
  type SocialActor,
  type SocialOutcome,
} from './actor';
import { fromReceipt, receiptFor, requestHash } from './commands';
import { admitCommand } from './limits';
import { sql } from '../db/sql';

function prepareReceipt(actor: SocialActor) {
  return actor.db.prepare(sql`INSERT INTO social_commands(actor,key,request_hash,execution_nonce,
    result_code,resource_id,created_at)
  SELECT me.id,?2,?3,?4,
    CASE WHEN EXISTS (
      SELECT 1 FROM social_posts post
      JOIN social_profiles author ON author.id = post.author
      JOIN users au ON au.sub = author.sub
      LEFT JOIN social_categories cat ON cat.id = post.category_id
      LEFT JOIN social_pairs pair ON pair.lo = MIN(me.id,author.id)
        AND pair.hi = MAX(me.id,author.id) AND pair.state = 'accepted'
      WHERE post.id = ?5 AND post.author <> me.id
        AND ((cat.owner = post.author AND cat.deleted_at IS NULL AND cat.visibility = 'public')
          OR ((post.category_id IS NULL OR (cat.owner = post.author AND cat.deleted_at IS NULL AND cat.visibility = 'friends')) AND pair.state = 'accepted'))
        AND (?10 IS NULL OR author.sub IN (SELECT value FROM json_each(?10)))
        AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = au.sub)
        AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE
          (b.blocker = me.id AND b.blocked = author.id) OR
          (b.blocker = author.id AND b.blocked = me.id))
    ) THEN 'ok' ELSE 'unavailable' END,?5,?6
  FROM social_profiles me JOIN users u ON u.sub = me.sub
  JOIN sessions s ON s.sub = u.sub
  WHERE me.id = ?1 AND me.sub = ?7 AND s.sid = ?8 AND s.expires_at > ?9
    AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)
  ON CONFLICT(actor,key) DO NOTHING`);
}

function prepareSetActive(actor: SocialActor) {
  return actor.db.prepare(sql`INSERT OR IGNORE INTO social_reactions(post_id,reactor,created_at)
  SELECT post.id,me.id,? FROM social_profiles me
  JOIN users u ON u.sub = me.sub JOIN sessions s ON s.sub = u.sub
  JOIN social_posts post ON post.id = ?
  JOIN social_profiles author ON author.id = post.author
  JOIN users au ON au.sub = author.sub
  LEFT JOIN social_categories cat ON cat.id = post.category_id
  LEFT JOIN social_pairs pair ON pair.lo = MIN(me.id,author.id)
    AND pair.hi = MAX(me.id,author.id) AND pair.state = 'accepted'
  WHERE me.id = ? AND me.sub = ? AND s.sid = ? AND s.expires_at > ?
    AND post.author <> me.id
    AND ((cat.owner = post.author AND cat.deleted_at IS NULL AND cat.visibility = 'public')
      OR ((post.category_id IS NULL OR (cat.owner = post.author AND cat.deleted_at IS NULL AND cat.visibility = 'friends')) AND pair.state = 'accepted'))
    AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub IN (u.sub,au.sub))
    AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE
      (b.blocker = me.id AND b.blocked = author.id) OR
      (b.blocker = author.id AND b.blocked = me.id))
    AND EXISTS (SELECT 1 FROM social_commands c WHERE c.actor = me.id
      AND c.key = ? AND c.execution_nonce = ? AND c.result_code = 'ok')
    AND (? IS NULL OR author.sub IN (SELECT value FROM json_each(?)))`);
}

function prepareSetInactive(actor: SocialActor) {
  return actor.db.prepare(sql`DELETE FROM social_reactions WHERE post_id = ? AND reactor = ?
    AND EXISTS (SELECT 1 FROM social_commands c WHERE c.actor = ?
      AND c.key = ? AND c.execution_nonce = ? AND c.result_code = 'ok')
    AND EXISTS (SELECT 1 FROM social_posts post
      JOIN social_profiles author ON author.id = post.author
      JOIN users au ON au.sub = author.sub
      LEFT JOIN social_categories cat ON cat.id = post.category_id
      LEFT JOIN social_pairs pair ON pair.lo = MIN(social_reactions.reactor,author.id)
        AND pair.hi = MAX(social_reactions.reactor,author.id) AND pair.state = 'accepted'
      WHERE post.id = social_reactions.post_id
        AND post.author <> social_reactions.reactor
        AND ((cat.owner = post.author AND cat.deleted_at IS NULL AND cat.visibility = 'public')
          OR ((post.category_id IS NULL OR (cat.owner = post.author AND cat.deleted_at IS NULL AND cat.visibility = 'friends')) AND pair.state = 'accepted'))
        AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = au.sub)
        AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE
          (b.blocker = social_reactions.reactor AND b.blocked = author.id) OR
          (b.blocker = author.id AND b.blocked = social_reactions.reactor)))
    AND EXISTS (SELECT 1 FROM social_profiles me JOIN users u ON u.sub = me.sub
      JOIN sessions s ON s.sub = u.sub WHERE me.id = social_reactions.reactor
        AND me.sub = ? AND s.sid = ? AND s.expires_at > ?
        AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub))
    AND (? IS NULL OR EXISTS (SELECT 1 FROM social_posts p JOIN social_profiles a ON a.id = p.author
      WHERE p.id = social_reactions.post_id AND a.sub IN (SELECT value FROM json_each(?))))`);
}

function prepareSelect(actor: SocialActor) {
  return actor.db.prepare(sql`SELECT c.actor,c.key,c.request_hash,c.execution_nonce,c.result_code,
    c.resource_id,c.result_version FROM social_commands c
  JOIN social_profiles me ON me.id = c.actor JOIN users u ON u.sub = me.sub
  JOIN sessions s ON s.sub = u.sub
  WHERE c.actor = ? AND c.key = ? AND me.sub = ? AND s.sid = ? AND s.expires_at > ?
    AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)`);
}

async function commitReaction(
  actor: SocialActor,
  profileId: string,
  key: string,
  hash: string,
  nonce: string,
  postId: string,
  active: boolean,
) {
  const policy = actor.policySubs === undefined ? null : JSON.stringify(actor.policySubs);
  const effect = active
    ? prepareSetActive(actor).bind(
        actor.nowMs,
        postId,
        profileId,
        actor.sub,
        actor.sid,
        actor.nowIso,
        key,
        nonce,
        policy,
        policy,
      )
    : prepareSetInactive(actor).bind(
        postId,
        profileId,
        profileId,
        key,
        nonce,
        actor.sub,
        actor.sid,
        actor.nowIso,
        policy,
        policy,
      );
  return actor.db.batch([
    prepareReceipt(actor).bind(
      profileId,
      key,
      hash,
      nonce,
      postId,
      actor.nowMs,
      actor.sub,
      actor.sid,
      actor.nowIso,
      policy,
    ),
    effect,
    prepareSelect(actor).bind(profileId, key, actor.sub, actor.sid, actor.nowIso),
  ]);
}

/** Desired-state setter; false uses revoke budget with the same current post ACL. */
export async function setReaction(
  actor: SocialActor,
  key: unknown,
  input: unknown,
): Promise<SocialOutcome<{ postId: string; active: boolean }>> {
  const profile = await currentProfile(actor);
  if (profile === null) return { ok: false, code: await actorFailure(actor) };
  const raw = input as { active?: unknown } | null;
  const admission = await admitCommand(actor, raw?.active === false ? 'revoke' : 'write');
  if (admission !== null) return { ok: false, code: admission };
  const parsed = parseReactionInput(input);
  if (!parsed.ok || typeof key !== 'string') return { ok: false, code: 'validation' };
  const stamp = keyTimestamp(key);
  if (stamp === null) return { ok: false, code: 'validation' };
  const hash = await requestHash('POST', '/api/social/reactions/set', parsed.value);
  const old = await receiptFor(actor, key);
  if (old) {
    const reply = fromReceipt(old, hash, 'replay');
    if (reply.ok && parsed.value.active) {
      const current = await visiblePost(actor, parsed.value.postId);
      if (!current || current.author === profile.id) return { ok: false, code: 'unavailable' };
    }
    return reply.ok ? { ok: true, value: parsed.value } : reply;
  }
  if (!isFreshNewKey(stamp, actor.nowMs)) return { ok: false, code: 'request-expired' };
  const nonce = crypto.randomUUID();
  const result = await commitReaction(
    actor,
    profile.id,
    key,
    hash,
    nonce,
    parsed.value.postId,
    parsed.value.active,
  );
  const receipt = result[2].results[0] as Parameters<typeof fromReceipt>[0] | undefined;
  if (!receipt) return { ok: false, code: await actorFailure(actor) };
  const reply = fromReceipt(receipt, hash, nonce);
  return reply.ok ? { ok: true, value: parsed.value } : reply;
}
