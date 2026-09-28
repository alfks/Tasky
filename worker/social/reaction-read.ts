import { parsePageInput } from '@/domain/social/input';
import type { OwnReactionView, Page } from '@/domain/social/social';

import {
  actorFailure,
  currentAccount,
  currentProfile,
  type SocialActor,
  type SocialOutcome,
} from './actor';
import { decodeListCursor, encodeListCursor, ownReactionCursorActorId } from './cursor';
import { sql } from '../db/sql';

type ReactionRow = { postId: string; createdAt: number };

/** postId는 본인 명령의 target 식별자이며, 공개 게시물 표시 권한을 주지 않는다. */
export async function readOwnReactions(
  actor: SocialActor,
  url: URL,
  secret: string,
): Promise<SocialOutcome<Page<OwnReactionView>>> {
  const profile = await currentProfile(actor);
  if (profile === null) return { ok: false, code: await actorFailure(actor) };
  if ([...url.searchParams.keys()].some((key) => key !== 'cursor' && key !== 'limit'))
    return { ok: false, code: 'validation' };
  const input = {
    ...(url.searchParams.has('cursor') ? { cursor: url.searchParams.get('cursor') } : {}),
    ...(url.searchParams.has('limit') ? { limit: Number(url.searchParams.get('limit')) } : {}),
  };
  const page = parsePageInput(input);
  if (!page.ok) return { ok: false, code: 'validation' };
  const scopedActor = await ownReactionCursorActorId(secret, profile.id, actor.sid);
  const cursor =
    page.value.cursor === undefined
      ? null
      : await decodeListCursor(
          secret,
          page.value.cursor,
          scopedActor,
          'reactions:mine',
          actor.nowMs,
        );
  if (page.value.cursor !== undefined && cursor === null) return { ok: false, code: 'validation' };
  const limit = page.value.limit ?? 20;
  /** 본인 활성 응원과 지금 철회 가능한 target만 같은 SQL에서 읽는다. 본문은 조회하지 않는다. */
  const result = await actor.db
    .prepare(
      sql`SELECT r.post_id AS postId,r.created_at AS createdAt
  FROM social_reactions r INDEXED BY social_reactions_reactor_post
  JOIN social_posts post ON post.id = r.post_id
  JOIN social_profiles author ON author.id = post.author
  JOIN users au ON au.sub = author.sub
  JOIN social_profiles me ON me.id = r.reactor
  JOIN users u ON u.sub = me.sub JOIN sessions s ON s.sub = u.sub
  JOIN social_pairs pair ON pair.lo = MIN(me.id,author.id)
    AND pair.hi = MAX(me.id,author.id) AND pair.state = 'accepted'
  WHERE r.reactor = ?1 AND r.post_id > ?2 AND me.id = ?3 AND me.sub = ?4
    AND s.sid = ?5 AND s.expires_at > ?6 AND post.author <> me.id
    AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub IN (u.sub,au.sub))
    AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE
      (b.blocker = me.id AND b.blocked = author.id) OR
      (b.blocker = author.id AND b.blocked = me.id))
  ORDER BY r.post_id ASC LIMIT ?7`,
    )
    .bind(profile.id, cursor?.last ?? '', profile.id, actor.sub, actor.sid, actor.nowIso, limit + 1)
    .all<ReactionRow>();
  if (result.results.length === 0) {
    if (!(await currentAccount(actor)) || !(await currentProfile(actor)))
      return { ok: false, code: await actorFailure(actor) };
  }
  const items = result.results.slice(0, limit).map((row) => ({
    postId: row.postId,
    createdAt: row.createdAt,
  }));
  const last = items.at(-1);
  const nextCursor =
    result.results.length > limit && last
      ? await encodeListCursor(
          secret,
          scopedActor,
          'reactions:mine',
          last.postId,
          actor.nowMs,
          cursor?.expiresAt,
        )
      : null;
  return { ok: true, value: { items, nextCursor } };
}
