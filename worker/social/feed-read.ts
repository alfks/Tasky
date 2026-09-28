import { parsePageInput } from '@/domain/social/input';
import type { Page, PostView } from '@/domain/social/social';

import { actorFailure, currentProfile, type SocialActor, type SocialOutcome } from './actor';
import {
  decodeFeedCursor,
  encodeFeedCursor,
  type FeedCursor,
  type FeedScope,
  type FeedTuple,
} from './cursor';
import { sql } from '../db/sql';

export type FeedRow = {
  id: string;
  author: string;
  text: string;
  happened_on: string;
  created_at: number;
  nickname: string;
  reactionCount: number;
  myReaction: number;
};

export type FeedSeek = { beforeCreatedAt: number; beforeId: string };

/** One statement keeps the current ACL and selected post bodies on one D1 snapshot. */
function prepareFeedRead(actor: SocialActor) {
  return actor.db.prepare(sql`WITH current_actor AS (
    SELECT me.id FROM social_profiles me
    JOIN users u ON u.sub = me.sub JOIN sessions s ON s.sub = u.sub
    WHERE me.id = ?1 AND me.sub = ?2 AND s.sid = ?3 AND s.expires_at > ?4
      AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)
  ), eligible_authors AS MATERIALIZED (
    SELECT me.id FROM current_actor me
    UNION ALL
    SELECT peer.id FROM current_actor me
    JOIN social_pairs pair ON (pair.lo = me.id OR pair.hi = me.id)
      AND pair.state = 'accepted'
    JOIN social_profiles peer ON peer.id =
      CASE WHEN pair.lo = me.id THEN pair.hi ELSE pair.lo END
    JOIN users pu ON pu.sub = peer.sub
    WHERE ?8 = 'feed'
      AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = pu.sub)
      AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE
        (b.blocker = me.id AND b.blocked = peer.id) OR
        (b.blocker = peer.id AND b.blocked = me.id))
  ), seed_rows AS (
    SELECT json_extract(j.value,'$.id') AS id,
      json_extract(j.value,'$.createdAt') AS created_at
    FROM eligible_authors a
    CROSS JOIN json_each((SELECT json_group_array(json_object('id',id,'createdAt',created_at))
      FROM (
        SELECT p.id,p.created_at FROM social_posts p
        WHERE p.author = a.id AND (p.created_at,p.id) < (?5,?6)
        ORDER BY p.created_at DESC,p.id DESC LIMIT min(3,?7)
      ))) j
  ), seed_top AS MATERIALIZED (
    SELECT id,created_at FROM seed_rows
    ORDER BY created_at DESC,id DESC LIMIT ?7
  ), bounds AS MATERIALIZED (
    SELECT CASE WHEN COUNT(*) = ?7
        THEN (SELECT created_at FROM seed_top ORDER BY created_at,id LIMIT 1)
        ELSE CAST('-9223372036854775808' AS INTEGER) END AS lo_created_at,
      CASE WHEN COUNT(*) = ?7
        THEN (SELECT id FROM seed_top ORDER BY created_at,id LIMIT 1)
        ELSE '' END AS lo_id
    FROM seed_top
  ), candidate_rows AS (
    SELECT json_extract(j.value,'$.id') AS id,
      json_extract(j.value,'$.createdAt') AS created_at
    FROM eligible_authors a CROSS JOIN bounds b
    CROSS JOIN json_each((SELECT json_group_array(json_object('id',id,'createdAt',created_at))
      FROM (
        SELECT p.id,p.created_at FROM social_posts p
        WHERE p.author = a.id
          AND (p.created_at,p.id) >= (b.lo_created_at,b.lo_id)
          AND (p.created_at,p.id) < (?5,?6)
        ORDER BY p.created_at DESC,p.id DESC LIMIT ?7
      ))) j
  ), page_ids AS (
    SELECT c.id,c.created_at FROM candidate_rows c
    ORDER BY c.created_at DESC,c.id DESC LIMIT ?7
  )
  SELECT post.id,post.author,post.text,post.happened_on,post.created_at,
    author.nickname,
    (SELECT COUNT(*) FROM social_reactions r
      JOIN social_profiles reactor ON reactor.id = r.reactor
      JOIN users ru ON ru.sub = reactor.sub
      JOIN social_pairs pair ON pair.lo = MIN(post.author,reactor.id)
        AND pair.hi = MAX(post.author,reactor.id) AND pair.state = 'accepted'
      WHERE r.post_id = post.id
        AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = ru.sub)
        AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE
          (b.blocker = post.author AND b.blocked = reactor.id) OR
          (b.blocker = reactor.id AND b.blocked = post.author))) AS reactionCount,
    EXISTS (SELECT 1 FROM social_reactions mine
      WHERE mine.post_id = post.id AND mine.reactor = ?1) AS myReaction
  FROM page_ids page
  JOIN social_posts post ON post.id = page.id
  JOIN social_profiles author ON author.id = post.author
  ORDER BY post.created_at DESC,post.id DESC`);
}

export async function queryFeedRows(
  actor: SocialActor,
  profileId: string,
  seek: FeedSeek,
  pageSize: number,
  scope: FeedScope,
): Promise<D1Result<FeedRow>> {
  const result = await prepareFeedRead(actor)
    .bind(
      profileId,
      actor.sub,
      actor.sid,
      actor.nowIso,
      seek.beforeCreatedAt,
      seek.beforeId,
      pageSize + 1,
      scope,
    )
    .all<FeedRow>();
  return result;
}

type FeedPageInput = {
  limit: number;
  scope: FeedScope;
  cursor: FeedCursor | null;
};

async function parseFeedPage(
  actor: SocialActor,
  url: URL,
  secret: string,
  scope: FeedScope,
): Promise<FeedPageInput | null> {
  const keys = [...url.searchParams.keys()];
  if (keys.some((key) => key !== 'cursor' && key !== 'limit') || new Set(keys).size !== keys.length)
    return null;
  const raw = {
    ...(url.searchParams.has('cursor') ? { cursor: url.searchParams.get('cursor') } : {}),
    ...(url.searchParams.has('limit') ? { limit: Number(url.searchParams.get('limit')) } : {}),
  };
  const parsed = parsePageInput(raw);
  if (!parsed.ok || actor.profileId === null) return null;
  const cursor =
    parsed.value.cursor === undefined
      ? null
      : await decodeFeedCursor(secret, parsed.value.cursor, actor.profileId, scope, actor.nowMs);
  if (parsed.value.cursor !== undefined && cursor === null) return null;
  return { limit: parsed.value.limit ?? 20, scope, cursor };
}

function initialSeek(nowMs: number): FeedSeek {
  return { beforeCreatedAt: nowMs + 1, beforeId: '0'.repeat(32) };
}

function rowTuple(row: FeedRow): FeedTuple {
  return { createdAt: row.created_at, id: row.id };
}

function postView(row: FeedRow): PostView {
  return {
    id: row.id,
    author: { id: row.author, nickname: row.nickname },
    text: row.text,
    happenedOn: row.happened_on,
    createdAt: row.created_at,
    reactionCount: row.reactionCount,
    myReaction: row.myReaction === 1,
  };
}

/** Cursor validation precedes the body SQL, which repeats A/F/V in one snapshot. */
export async function readFeedPage(
  actor: SocialActor,
  url: URL,
  secret: string,
  scope: FeedScope,
): Promise<SocialOutcome<Page<PostView>>> {
  const profile = await currentProfile(actor);
  if (profile === null) return { ok: false, code: await actorFailure(actor) };
  const page = await parseFeedPage(actor, url, secret, scope);
  if (page === null) return { ok: false, code: 'validation' };
  const cursor = page.cursor;
  const seek = cursor
    ? {
        beforeCreatedAt: cursor.last.createdAt,
        beforeId: cursor.last.id,
      }
    : initialSeek(actor.nowMs);
  const { results: rows } = await queryFeedRows(actor, profile.id, seek, page.limit, scope);
  if (rows.length === 0 && (await currentProfile(actor)) === null)
    return { ok: false, code: await actorFailure(actor) };
  const items = rows.slice(0, page.limit);
  const last = items.at(-1);
  const upper = cursor?.upper ?? (items[0] ? rowTuple(items[0]) : null);
  const nextCursor =
    rows.length > items.length && last && upper
      ? await encodeFeedCursor(
          secret,
          profile.id,
          scope,
          upper,
          rowTuple(last),
          actor.nowMs,
          cursor?.expiresAt,
        )
      : null;
  return { ok: true, value: { items: items.map(postView), nextCursor } };
}
