import { isSocialId, parsePageInput } from '@/domain/social/input';
import type { Page, PostView, SocialCategoryView } from '@/domain/social/social';

import {
  decodeProjectionCursor,
  encodeProjectionCursor,
  type ProjectionCursor,
} from './category-cursor';
import { categoryView } from './category-read';
import {
  publicViewer,
  queryPublicCategories,
  queryPublicPosts,
  type PublicContext,
} from './public-read';
import { visiblePostView } from './visibility-sql';
import { sql } from '../db/sql';

import type { SocialOutcome } from './actor';
import type { FeedTuple } from './cursor';

export const PUBLIC_SCAN_LIMIT = 1000;

type PublicPage = {
  limit: number;
  categoryId: string | null;
  cursor: ProjectionCursor | null;
  scope: string;
};

async function parsePublicPage(
  context: PublicContext,
  url: URL,
  secret: string,
  feed: boolean,
): Promise<PublicPage | null> {
  const keys = [...url.searchParams.keys()];
  const allowed = feed ? ['cursor', 'limit', 'categoryId'] : ['cursor', 'limit'];
  if (keys.some((key) => !allowed.includes(key)) || new Set(keys).size !== keys.length) return null;
  const categoryId = url.searchParams.get('categoryId');
  if (categoryId !== null && !isSocialId(categoryId)) return null;
  const page = parsePageInput({
    ...(url.searchParams.has('limit') ? { limit: Number(url.searchParams.get('limit')) } : {}),
    ...(url.searchParams.has('cursor') ? { cursor: url.searchParams.get('cursor') } : {}),
  });
  if (!page.ok) return null;
  const scope = feed ? `public:feed:${categoryId ?? '*'}` : 'public:categories';
  const cursor = page.value.cursor
    ? await decodeProjectionCursor(
        secret,
        page.value.cursor,
        publicViewer(context),
        scope,
        context.nowMs,
      )
    : null;
  if (page.value.cursor && (!cursor || feed === (typeof cursor.last === 'string'))) return null;
  return { limit: page.value.limit ?? 20, categoryId, cursor, scope };
}

async function candidates(context: PublicContext, categoryId: string | null, seek: FeedTuple) {
  if (categoryId !== null)
    return context.db
      .prepare(
        sql`SELECT id,created_at AS createdAt
    FROM social_public_posts WHERE category_id = ?1 AND (created_at,id) < (?2,?3)
    ORDER BY created_at DESC,id DESC LIMIT 1000`,
      )
      .bind(categoryId, seek.createdAt, seek.id)
      .all<FeedTuple>();
  return context.db
    .prepare(
      sql`SELECT id,created_at AS createdAt FROM social_public_posts
    WHERE (created_at,id) < (?1,?2) ORDER BY created_at DESC,id DESC LIMIT 1000`,
    )
    .bind(seek.createdAt, seek.id)
    .all<FeedTuple>();
}

/** IDs are bounded before body reads; the final body statement applies current ACL before LIMIT. */
export async function readPublicFeed(
  context: PublicContext,
  url: URL,
  secret: string,
): Promise<SocialOutcome<Page<PostView>>> {
  const page = await parsePublicPage(context, url, secret, true);
  if (!page) return { ok: false, code: 'validation' };
  const seek =
    page.cursor?.last && typeof page.cursor.last !== 'string'
      ? page.cursor.last
      : { createdAt: context.nowMs + 1, id: '0'.repeat(32) };
  const scanned = (await candidates(context, page.categoryId, seek)).results;
  const rows = (
    await queryPublicPosts(
      context,
      scanned.map((row) => row.id),
      page.limit + 1,
      page.categoryId,
    )
  ).results;
  const items = rows.slice(0, page.limit);
  const visibleLast = items.at(-1);
  const last =
    rows.length > page.limit && visibleLast
      ? { id: visibleLast.id, createdAt: visibleLast.created_at }
      : scanned.length === PUBLIC_SCAN_LIMIT
        ? scanned.at(-1)
        : undefined;
  const upper = page.cursor?.upper ?? scanned[0] ?? null;
  const nextCursor =
    last && upper
      ? await encodeProjectionCursor(
          secret,
          publicViewer(context),
          page.scope,
          last,
          upper,
          context.nowMs,
          page.cursor?.expiresAt,
        )
      : null;
  return { ok: true, value: { items: items.map(visiblePostView), nextCursor } };
}

/** Sparse pages still advance the encrypted scan cursor without exposing hidden category IDs. */
export async function readPublicCategories(
  context: PublicContext,
  url: URL,
  secret: string,
): Promise<SocialOutcome<Page<SocialCategoryView>>> {
  const page = await parsePublicPage(context, url, secret, false);
  if (!page) return { ok: false, code: 'validation' };
  const lastId = typeof page.cursor?.last === 'string' ? page.cursor.last : '';
  const scanned = (
    await context.db
      .prepare(
        sql`SELECT id FROM social_public_categories
    WHERE id > ?1 ORDER BY id LIMIT 1000`,
      )
      .bind(lastId)
      .all<{ id: string }>()
  ).results;
  const rows = (
    await queryPublicCategories(
      context,
      scanned.map((row) => row.id),
      page.limit + 1,
    )
  ).results;
  const items = rows.slice(0, page.limit);
  const last =
    rows.length > page.limit
      ? items.at(-1)?.id
      : scanned.length === PUBLIC_SCAN_LIMIT
        ? scanned.at(-1)?.id
        : undefined;
  return {
    ok: true,
    value: {
      items: items.map(categoryView),
      nextCursor: last
        ? await encodeProjectionCursor(
            secret,
            publicViewer(context),
            page.scope,
            last,
            null,
            context.nowMs,
            page.cursor?.expiresAt,
          )
        : null,
    },
  };
}
