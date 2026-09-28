import { parsePostIdsInput } from '@/domain/social/command-input';

import { actorFailure, currentProfile, type SocialActor, type SocialOutcome } from './actor';
import { sql } from '../db/sql';

function prepareAllowedIds(actor: SocialActor) {
  return actor.db.prepare(sql`WITH current_actor AS (
    SELECT me.id FROM social_profiles me JOIN users u ON u.sub = me.sub
    JOIN sessions s ON s.sub = u.sub
    WHERE me.id = ?1 AND me.sub = ?2 AND s.sid = ?3 AND s.expires_at > ?4
      AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)
  )
  SELECT post.id FROM json_each(?5) requested
  JOIN social_posts post ON post.id = requested.value
  JOIN social_profiles author ON author.id = post.author
  JOIN users au ON au.sub = author.sub JOIN current_actor me
  WHERE NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = au.sub)
    AND (post.author = me.id OR (
      EXISTS (SELECT 1 FROM social_pairs pair WHERE
        pair.lo = MIN(me.id,author.id) AND pair.hi = MAX(me.id,author.id)
        AND pair.state = 'accepted')
      AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE
        (b.blocker = me.id AND b.blocked = author.id) OR
        (b.blocker = author.id AND b.blocked = me.id))))
  ORDER BY CAST(requested.key AS INTEGER)`);
}

/** The SQL returns IDs only; absent and revoked posts have the same result. */
export async function validatePosts(
  actor: SocialActor,
  input: unknown,
): Promise<SocialOutcome<{ allowedIds: readonly string[] }>> {
  const parsed = parsePostIdsInput(input);
  if (!parsed.ok) return { ok: false, code: 'validation' };
  const profile = await currentProfile(actor);
  if (profile === null) return { ok: false, code: await actorFailure(actor) };
  const rows = await prepareAllowedIds(actor)
    .bind(profile.id, actor.sub, actor.sid, actor.nowIso, JSON.stringify(parsed.value.ids))
    .all<{ id: string }>();
  if (rows.results.length === 0 && (await currentProfile(actor)) === null)
    return { ok: false, code: await actorFailure(actor) };
  return { ok: true, value: { allowedIds: rows.results.map((row) => row.id) } };
}
