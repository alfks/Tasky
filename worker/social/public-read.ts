import { isSocialId } from '@/domain/social/input';
import type { PostView, SocialCategoryView } from '@/domain/social/social';

import { categoryView, type CategoryRow } from './category-read';
import { visiblePostView, type VisiblePostRow } from './visibility-sql';
import { sql } from '../db/sql';

import type { SocialActor, SocialOutcome } from './actor';

export type PublicContext = {
  db: D1Database;
  actor: SocialActor | null;
  policySubs: readonly string[];
  nowMs: number;
};

export function publicViewer(context: PublicContext): string {
  return context.actor
    ? `account:${context.actor.sub}:${context.actor.profileId ?? '-'}`
    : 'anonymous';
}

/** A presented verified account remains guarded inside the same snapshot as public bodies. */
export async function queryPublicPosts(
  context: PublicContext,
  ids: readonly string[],
  limit: number,
  categoryId: string | null = null,
) {
  const actor = context.actor;
  return context.db
    .prepare(
      sql`SELECT post.id,post.author,post.text,post.happened_on,post.created_at,author.nickname,
    cat.id AS category_id,cat.name AS category_name,cat.color AS category_color,
    cat.emoji AS category_emoji,cat.visibility AS category_visibility,cat.version AS category_version,
    cat.updated_at AS category_updated_at,
    (SELECT COUNT(*) FROM social_reactions r JOIN social_profiles reactor ON reactor.id = r.reactor
      JOIN users ru ON ru.sub = reactor.sub WHERE r.post_id = post.id AND reactor.id <> post.author
      AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = ru.sub)
      AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE
        (b.blocker = post.author AND b.blocked = reactor.id) OR (b.blocker = reactor.id AND b.blocked = post.author))) AS reactionCount,
    EXISTS (SELECT 1 FROM social_reactions r WHERE r.post_id = post.id AND r.reactor = ?2
      AND r.reactor <> post.author) AS myReaction
    FROM json_each(?1) requested JOIN social_posts post ON post.id = requested.value
    JOIN social_categories cat ON cat.id = post.category_id AND cat.owner = post.author
    JOIN social_profiles author ON author.id = post.author JOIN users au ON au.sub = author.sub
    WHERE cat.visibility = 'public' AND cat.deleted_at IS NULL
      AND (?8 IS NULL OR cat.id = ?8)
      AND author.sub IN (SELECT value FROM json_each(?6))
      AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = au.sub)
      AND (?3 IS NULL OR EXISTS (SELECT 1 FROM sessions s JOIN users u ON u.sub = s.sub
        WHERE s.sub = ?3 AND s.sid = ?4 AND s.expires_at > ?5
          AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)))
      AND (?2 IS NULL OR EXISTS (SELECT 1 FROM social_profiles me WHERE me.id = ?2 AND me.sub = ?3))
      AND (?2 IS NULL OR NOT EXISTS (SELECT 1 FROM social_blocks b WHERE
        (b.blocker = ?2 AND b.blocked = author.id) OR (b.blocker = author.id AND b.blocked = ?2)))
    ORDER BY post.created_at DESC,post.id DESC LIMIT ?7`,
    )
    .bind(
      JSON.stringify(ids),
      actor?.profileId ?? null,
      actor?.sub ?? null,
      actor?.sid ?? null,
      new Date(context.nowMs).toISOString(),
      JSON.stringify(context.policySubs),
      limit,
      categoryId,
    )
    .all<VisiblePostRow>();
}

export async function queryPublicCategories(
  context: PublicContext,
  ids: readonly string[],
  limit: number,
) {
  const actor = context.actor;
  return context.db
    .prepare(
      sql`SELECT cat.id,cat.name,cat.color,cat.emoji,cat.visibility,cat.version,cat.updated_at
    FROM json_each(?1) requested JOIN social_categories cat ON cat.id = requested.value
    JOIN social_profiles owner ON owner.id = cat.owner JOIN users ou ON ou.sub = owner.sub
    WHERE cat.visibility = 'public' AND cat.deleted_at IS NULL
      AND owner.sub IN (SELECT value FROM json_each(?6))
      AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = ou.sub)
      AND (?3 IS NULL OR EXISTS (SELECT 1 FROM sessions s JOIN users u ON u.sub = s.sub
        WHERE s.sub = ?3 AND s.sid = ?4 AND s.expires_at > ?5
          AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)))
      AND (?2 IS NULL OR EXISTS (SELECT 1 FROM social_profiles me WHERE me.id = ?2 AND me.sub = ?3))
      AND (?2 IS NULL OR NOT EXISTS (SELECT 1 FROM social_blocks b WHERE
        (b.blocker = ?2 AND b.blocked = owner.id) OR (b.blocker = owner.id AND b.blocked = ?2)))
    ORDER BY cat.id LIMIT ?7`,
    )
    .bind(
      JSON.stringify(ids),
      actor?.profileId ?? null,
      actor?.sub ?? null,
      actor?.sid ?? null,
      new Date(context.nowMs).toISOString(),
      JSON.stringify(context.policySubs),
      limit,
    )
    .all<CategoryRow>();
}

export async function readPublicPost(
  context: PublicContext,
  id: string,
): Promise<SocialOutcome<PostView>> {
  if (!isSocialId(id)) return { ok: false, code: 'validation' };
  const rows = await queryPublicPosts(context, [id], 1);
  return rows.results[0]
    ? { ok: true, value: visiblePostView(rows.results[0]) }
    : { ok: false, code: 'unavailable' };
}

export async function readPublicCategory(
  context: PublicContext,
  id: string,
): Promise<SocialOutcome<SocialCategoryView>> {
  if (!isSocialId(id)) return { ok: false, code: 'validation' };
  const rows = await queryPublicCategories(context, [id], 1);
  return rows.results[0]
    ? { ok: true, value: categoryView(rows.results[0]) }
    : { ok: false, code: 'unavailable' };
}

/** Validate only returns IDs, so public leases never refresh bodies through a validation path. */
export async function validatePublicPosts(context: PublicContext, ids: readonly string[]) {
  const actor = context.actor;
  const rows = await context.db
    .prepare(
      sql`SELECT post.id FROM json_each(?1) requested
    JOIN social_posts post ON post.id = requested.value
    JOIN social_categories cat ON cat.id = post.category_id AND cat.owner = post.author
    JOIN social_profiles author ON author.id = post.author JOIN users au ON au.sub = author.sub
    WHERE cat.visibility = 'public' AND cat.deleted_at IS NULL
      AND author.sub IN (SELECT value FROM json_each(?6))
      AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = au.sub)
      AND (?3 IS NULL OR EXISTS (SELECT 1 FROM sessions s JOIN users u ON u.sub = s.sub
        WHERE s.sub = ?3 AND s.sid = ?4 AND s.expires_at > ?5
          AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)))
      AND (?2 IS NULL OR EXISTS (SELECT 1 FROM social_profiles me WHERE me.id = ?2 AND me.sub = ?3))
      AND (?2 IS NULL OR NOT EXISTS (SELECT 1 FROM social_blocks b WHERE
        (b.blocker = ?2 AND b.blocked = author.id) OR (b.blocker = author.id AND b.blocked = ?2)))
    ORDER BY CAST(requested.key AS INTEGER)`,
    )
    .bind(
      JSON.stringify(ids),
      actor?.profileId ?? null,
      actor?.sub ?? null,
      actor?.sid ?? null,
      new Date(context.nowMs).toISOString(),
      JSON.stringify(context.policySubs),
    )
    .all<{ id: string }>();
  return { ok: true as const, value: { allowedIds: rows.results.map((row) => row.id) } };
}
