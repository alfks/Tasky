import type { CategoryVisibility } from '@/domain/category/visibility';
import type { PostView } from '@/domain/social/social';

import { sql } from '../db/sql';

import type { SocialActor } from './actor';

export type VisiblePostRow = {
  id: string;
  author: string;
  nickname: string;
  text: string;
  happened_on: string;
  created_at: number;
  reactionCount: number;
  myReaction: number;
  category_id?: string | null;
  category_name?: string;
  category_color?: string;
  category_emoji?: string | null;
  category_visibility?: CategoryVisibility;
  category_version?: number;
  category_updated_at?: number;
};

/** Only projection fields cross the HTTP boundary; owner counts and personal identifiers do not. */
export function visiblePostView(row: VisiblePostRow): PostView {
  return {
    id: row.id,
    author: { id: row.author, nickname: row.nickname },
    text: row.text,
    happenedOn: row.happened_on,
    createdAt: row.created_at,
    reactionCount: row.reactionCount,
    myReaction: row.myReaction === 1,
    ...(row.category_id &&
    row.category_name !== undefined &&
    row.category_color !== undefined &&
    row.category_visibility !== undefined &&
    row.category_version !== undefined &&
    row.category_updated_at !== undefined
      ? {
          category: {
            id: row.category_id,
            name: row.category_name,
            color: row.category_color,
            ...(row.category_emoji ? { emoji: row.category_emoji } : {}),
            visibility: row.category_visibility,
            version: row.category_version,
            updatedAt: row.category_updated_at,
          },
        }
      : {}),
  };
}

export async function queryVisiblePost(
  actor: SocialActor,
  postId: string,
): Promise<VisiblePostRow | null> {
  return actor.db
    .prepare(
      sql`SELECT post.id,post.author,post.text,post.happened_on,post.created_at,author.nickname,
    cat.id AS category_id,cat.name AS category_name,cat.color AS category_color,
    cat.emoji AS category_emoji,cat.visibility AS category_visibility,cat.version AS category_version,
    cat.updated_at AS category_updated_at,
    (SELECT COUNT(*) FROM social_reactions r JOIN social_profiles reactor ON reactor.id = r.reactor
      JOIN users ru ON ru.sub = reactor.sub WHERE r.post_id = post.id AND reactor.id <> post.author
      AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = ru.sub)
      AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE
        (b.blocker = post.author AND b.blocked = reactor.id) OR (b.blocker = reactor.id AND b.blocked = post.author))
      AND ((cat.owner = post.author AND cat.deleted_at IS NULL AND cat.visibility = 'public') OR
        ((post.category_id IS NULL OR (cat.owner = post.author AND cat.deleted_at IS NULL AND cat.visibility = 'friends'))
          AND EXISTS (SELECT 1 FROM social_pairs pair WHERE pair.lo = MIN(post.author,reactor.id)
            AND pair.hi = MAX(post.author,reactor.id) AND pair.state = 'accepted')))) AS reactionCount,
    EXISTS (SELECT 1 FROM social_reactions r WHERE r.post_id = post.id AND r.reactor = me.id
      AND me.id <> post.author) AS myReaction
    FROM social_posts post JOIN social_profiles author ON author.id = post.author
    JOIN users au ON au.sub = author.sub
    LEFT JOIN social_categories cat ON cat.id = post.category_id AND cat.owner = post.author
    JOIN social_profiles me ON me.id = ?1 AND me.sub = ?2
    JOIN users u ON u.sub = me.sub JOIN sessions s ON s.sub = u.sub
    WHERE post.id = ?5 AND s.sid = ?3 AND s.expires_at > ?4
      AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub IN (u.sub,au.sub))
      AND (post.author = me.id OR (
        (?6 IS NULL OR author.sub IN (SELECT value FROM json_each(?6)))
        AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE
          (b.blocker = me.id AND b.blocked = author.id) OR (b.blocker = author.id AND b.blocked = me.id))
        AND ((cat.owner = post.author AND cat.deleted_at IS NULL AND cat.visibility = 'public') OR
          ((post.category_id IS NULL OR (cat.owner = post.author AND cat.deleted_at IS NULL AND cat.visibility = 'friends'))
            AND EXISTS (SELECT 1 FROM social_pairs pair WHERE pair.lo = MIN(me.id,author.id)
              AND pair.hi = MAX(me.id,author.id) AND pair.state = 'accepted')))))`,
    )
    .bind(
      actor.profileId,
      actor.sub,
      actor.sid,
      actor.nowIso,
      postId,
      actor.policySubs === undefined ? null : JSON.stringify(actor.policySubs),
    )
    .first<VisiblePostRow>();
}

export async function queryAllowedPostIds(
  actor: SocialActor,
  ids: readonly string[],
  ownerOnly = false,
) {
  return actor.db
    .prepare(
      sql`SELECT post.id FROM json_each(?5) requested
    JOIN social_posts post ON post.id = requested.value
    JOIN social_profiles author ON author.id = post.author JOIN users au ON au.sub = author.sub
    LEFT JOIN social_categories cat ON cat.id = post.category_id AND cat.owner = post.author
    JOIN social_profiles me ON me.id = ?1 AND me.sub = ?2
    JOIN users u ON u.sub = me.sub JOIN sessions s ON s.sub = u.sub
    WHERE s.sid = ?3 AND s.expires_at > ?4
      AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub IN (u.sub,au.sub))
      AND (post.author = me.id OR (?7 = 0 AND (
        (?6 IS NULL OR author.sub IN (SELECT value FROM json_each(?6)))
        AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE
          (b.blocker = me.id AND b.blocked = author.id) OR (b.blocker = author.id AND b.blocked = me.id))
        AND ((cat.owner = post.author AND cat.deleted_at IS NULL AND cat.visibility = 'public') OR
          ((post.category_id IS NULL OR (cat.owner = post.author AND cat.deleted_at IS NULL AND cat.visibility = 'friends'))
            AND EXISTS (SELECT 1 FROM social_pairs pair WHERE pair.lo = MIN(me.id,author.id)
              AND pair.hi = MAX(me.id,author.id) AND pair.state = 'accepted'))))))
    ORDER BY CAST(requested.key AS INTEGER)`,
    )
    .bind(
      actor.profileId,
      actor.sub,
      actor.sid,
      actor.nowIso,
      JSON.stringify(ids),
      actor.policySubs === undefined ? null : JSON.stringify(actor.policySubs),
      ownerOnly ? 1 : 0,
    )
    .all<{ id: string }>();
}
