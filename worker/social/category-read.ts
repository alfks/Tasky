import type { CategoryVisibility } from '@/domain/category/visibility';
import { isSocialId, parsePageInput } from '@/domain/social/input';
import type { Page, SocialCategoryView } from '@/domain/social/social';

import { actorFailure, currentProfile, type SocialActor, type SocialOutcome } from './actor';
import { decodeProjectionCursor, encodeProjectionCursor } from './category-cursor';
import { sql } from '../db/sql';

export type CategoryRow = {
  id: string;
  name: string;
  color: string;
  emoji: string | null;
  visibility: CategoryVisibility;
  version: number;
  updated_at: number;
  postCount?: number;
  deleted_at?: number | null;
};

/** Owner counts are explicit; visitors only receive approved projection metadata. */
export function categoryView(row: CategoryRow): SocialCategoryView {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    ...(row.emoji === null ? {} : { emoji: row.emoji }),
    visibility: row.visibility,
    version: row.version,
    updatedAt: row.updated_at,
    ...(row.postCount === undefined ? {} : { postCount: row.postCount }),
    ...(row.deleted_at === undefined || row.deleted_at === null ? {} : { revoked: true }),
  };
}

export async function readCategory(
  actor: SocialActor,
  id: string,
  ownerOnly = false,
): Promise<SocialOutcome<SocialCategoryView>> {
  if (!isSocialId(id)) return { ok: false, code: 'validation' };
  if (!(await currentProfile(actor))) return { ok: false, code: await actorFailure(actor) };
  const row = await actor.db
    .prepare(
      sql`SELECT c.id,c.name,c.color,c.emoji,c.visibility,c.version,c.updated_at,
    CASE WHEN c.owner = me.id THEN c.deleted_at ELSE NULL END AS deleted_at,
    CASE WHEN c.owner = me.id THEN (SELECT COUNT(*) FROM social_posts p WHERE p.category_id = c.id
      AND p.author = me.id) ELSE NULL END AS postCount
    FROM social_categories c JOIN social_profiles owner ON owner.id = c.owner
    JOIN users ou ON ou.sub = owner.sub
    JOIN social_profiles me ON me.id = ?1 AND me.sub = ?2
    JOIN users u ON u.sub = me.sub JOIN sessions s ON s.sub = u.sub
    WHERE c.id = ?5 AND s.sid = ?3 AND s.expires_at > ?4
      AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub IN (u.sub,ou.sub))
      AND (c.owner = me.id OR (?6 = 0 AND c.deleted_at IS NULL
        AND (?7 IS NULL OR owner.sub IN (SELECT value FROM json_each(?7)))
        AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE
          (b.blocker = me.id AND b.blocked = owner.id) OR (b.blocker = owner.id AND b.blocked = me.id))
        AND (c.visibility = 'public' OR (c.visibility = 'friends' AND EXISTS
          (SELECT 1 FROM social_pairs pair WHERE pair.lo = MIN(me.id,owner.id)
            AND pair.hi = MAX(me.id,owner.id) AND pair.state = 'accepted')))))`,
    )
    .bind(
      actor.profileId,
      actor.sub,
      actor.sid,
      actor.nowIso,
      id,
      ownerOnly ? 1 : 0,
      actor.policySubs === undefined ? null : JSON.stringify(actor.policySubs),
    )
    .first<CategoryRow & { postCount: number | null }>();
  if (!row) return { ok: false, code: await actorFailure(actor) };
  const { postCount, ...metadata } = row;
  return {
    ok: true,
    value: categoryView({ ...metadata, ...(postCount === null ? {} : { postCount }) }),
  };
}

export async function readMyCategories(
  actor: SocialActor,
  url: URL,
  secret: string,
): Promise<SocialOutcome<Page<SocialCategoryView>>> {
  const profile = await currentProfile(actor);
  if (!profile) return { ok: false, code: await actorFailure(actor) };
  const keys = [...url.searchParams.keys()];
  if (keys.some((key) => !['cursor', 'limit'].includes(key)) || new Set(keys).size !== keys.length)
    return { ok: false, code: 'validation' };
  const parsed = parsePageInput({
    ...(url.searchParams.has('limit') ? { limit: Number(url.searchParams.get('limit')) } : {}),
    ...(url.searchParams.has('cursor') ? { cursor: url.searchParams.get('cursor') } : {}),
  });
  if (!parsed.ok) return parsed;
  const cursor = parsed.value.cursor
    ? await decodeProjectionCursor(
        secret,
        parsed.value.cursor,
        profile.id,
        'categories:mine',
        actor.nowMs,
      )
    : null;
  if (parsed.value.cursor && (!cursor || typeof cursor.last !== 'string'))
    return { ok: false, code: 'validation' };
  const limit = parsed.value.limit ?? 20;
  const rows = await actor.db
    .prepare(
      sql`SELECT c.id,c.name,c.color,c.emoji,c.visibility,c.version,c.updated_at,c.deleted_at,
    (SELECT COUNT(*) FROM social_posts p WHERE p.category_id = c.id AND p.author = me.id) AS postCount
    FROM social_categories c JOIN social_profiles me ON me.id = c.owner
    JOIN users u ON u.sub = me.sub JOIN sessions s ON s.sub = u.sub
    WHERE me.id = ?1 AND me.sub = ?2 AND s.sid = ?3 AND s.expires_at > ?4
      AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)
      AND c.id > ?5 ORDER BY c.id LIMIT ?6`,
    )
    .bind(profile.id, actor.sub, actor.sid, actor.nowIso, cursor?.last ?? '', limit + 1)
    .all<CategoryRow>();
  if (!(await currentProfile(actor))) return { ok: false, code: await actorFailure(actor) };
  const items = rows.results.slice(0, limit);
  const last = items.at(-1);
  return {
    ok: true,
    value: {
      items: items.map(categoryView),
      nextCursor:
        rows.results.length > limit && last
          ? await encodeProjectionCursor(
              secret,
              profile.id,
              'categories:mine',
              last.id,
              null,
              actor.nowMs,
              cursor?.expiresAt,
            )
          : null,
    },
  };
}
