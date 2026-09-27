import { parsePageInput } from '@/domain/social/input';
import { effectiveInviteStatus } from '@/domain/social/invite';
import type { Page } from '@/domain/social/social';

import { actorFailure, currentProfile, type SocialActor, type SocialOutcome } from './actor';
import { sql } from '../db/sql';

const friends = sql`SELECT peer.id,peer.nickname,pair.version AS pairVersion
  FROM social_pairs pair JOIN social_profiles peer ON peer.id = CASE
    WHEN pair.lo = ? THEN pair.hi ELSE pair.lo END
  JOIN users pu ON pu.sub = peer.sub JOIN social_profiles me ON me.id = ?
  JOIN users u ON u.sub = me.sub JOIN sessions s ON s.sub = u.sub
  WHERE (pair.lo = me.id OR pair.hi = me.id) AND pair.state = 'accepted'
    AND peer.id > ? AND me.sub = ? AND s.sid = ? AND s.expires_at > ?
    AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub IN (u.sub,pu.sub))
    AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE
      (b.blocker = me.id AND b.blocked = peer.id) OR
      (b.blocker = peer.id AND b.blocked = me.id))
  ORDER BY peer.id LIMIT ?`;

const requests = sql`SELECT peer.id,peer.nickname,pair.version AS pairVersion,
  pair.requested_at + 604800000 AS expiresAt
  FROM social_pairs pair JOIN social_profiles peer ON peer.id = CASE
    WHEN pair.lo = ? THEN pair.hi ELSE pair.lo END
  JOIN users pu ON pu.sub = peer.sub JOIN social_profiles me ON me.id = ?
  JOIN users u ON u.sub = me.sub JOIN sessions s ON s.sub = u.sub
  WHERE (pair.lo = me.id OR pair.hi = me.id) AND pair.state = 'pending'
    AND pair.requester = CASE WHEN ? = 'outgoing' THEN me.id ELSE peer.id END
    AND pair.requested_at > ? AND peer.id > ?
    AND me.sub = ? AND s.sid = ? AND s.expires_at > ?
    AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub IN (u.sub,pu.sub))
    AND NOT EXISTS (SELECT 1 FROM social_blocks b WHERE
      (b.blocker = me.id AND b.blocked = peer.id) OR
      (b.blocker = peer.id AND b.blocked = me.id))
  ORDER BY peer.id LIMIT ?`;

const invites = sql`SELECT i.hash AS inviteId,i.status,i.expires_at AS expiresAt
  FROM social_invites i JOIN social_profiles me ON me.id = i.owner
  JOIN users u ON u.sub = me.sub JOIN sessions s ON s.sub = u.sub
  WHERE i.owner = ? AND i.hash > ? AND me.sub = ? AND s.sid = ?
    AND s.expires_at > ? AND NOT EXISTS
      (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)
  ORDER BY i.hash LIMIT ?`;

const blocks = sql`SELECT peer.id,peer.nickname,COALESCE(pair.version,0) AS pairVersion
  FROM social_blocks b JOIN social_profiles peer ON peer.id = b.blocked
  JOIN users pu ON pu.sub = peer.sub JOIN social_profiles me ON me.id = b.blocker
  JOIN users u ON u.sub = me.sub JOIN sessions s ON s.sub = u.sub
  LEFT JOIN social_pairs pair ON pair.lo = MIN(me.id,peer.id)
    AND pair.hi = MAX(me.id,peer.id)
  WHERE b.blocker = ? AND peer.id > ? AND me.sub = ? AND s.sid = ?
    AND s.expires_at > ? AND NOT EXISTS
      (SELECT 1 FROM deleted_users d WHERE d.sub IN (u.sub,pu.sub))
  ORDER BY peer.id LIMIT ?`;

type Row = Record<string, string | number> & { id?: string; inviteId?: string };

export async function readSocialList(
  actor: SocialActor,
  path: string,
  url: URL,
): Promise<SocialOutcome<Page<unknown>>> {
  const profile = await currentProfile(actor);
  if (profile === null) return { ok: false, code: await actorFailure(actor) };
  const direction = url.searchParams.get('direction');
  const allowed =
    path === '/api/social/requests' ? ['direction', 'cursor', 'limit'] : ['cursor', 'limit'];
  if (
    [...url.searchParams.keys()].some((key) => !allowed.includes(key)) ||
    (path === '/api/social/requests' && direction !== 'incoming' && direction !== 'outgoing')
  )
    return { ok: false, code: 'validation' };
  const raw = {
    ...(url.searchParams.has('cursor') ? { cursor: url.searchParams.get('cursor') } : {}),
    ...(url.searchParams.has('limit') ? { limit: Number(url.searchParams.get('limit')) } : {}),
  };
  const page = parsePageInput(raw);
  if (!page.ok) return { ok: false, code: 'validation' };
  const cursor = page.value.cursor ?? '';
  const valid = path === '/api/social/invites' ? /^[0-9a-f]{64}$/u : /^[0-9a-f]{32}$/u;
  if (cursor && !valid.test(cursor)) return { ok: false, code: 'validation' };
  const shared = [profile.id, cursor, actor.sub, actor.sid, actor.nowIso, page.value.limit! + 1];
  const statement =
    path === '/api/social/friends'
      ? actor.db.prepare(friends).bind(profile.id, ...shared)
      : path === '/api/social/requests'
        ? actor.db
            .prepare(requests)
            .bind(
              profile.id,
              profile.id,
              direction,
              actor.nowMs - 604800000,
              cursor,
              actor.sub,
              actor.sid,
              actor.nowIso,
              page.value.limit! + 1,
            )
        : path === '/api/social/invites'
          ? actor.db.prepare(invites).bind(...shared)
          : actor.db.prepare(blocks).bind(...shared);
  const result = await statement.all<Row>();
  const rows = result.results.slice(0, page.value.limit!);
  const items = rows.map((row) =>
    path === '/api/social/requests'
      ? {
          peer: { id: row.id, nickname: row.nickname },
          pairVersion: row.pairVersion,
          expiresAt: row.expiresAt,
        }
      : path === '/api/social/invites'
        ? {
            inviteId: row.inviteId,
            status: effectiveInviteStatus(
              row.status as 'active' | 'used' | 'revoked',
              row.expiresAt as number,
              actor.nowMs,
            ),
            expiresAt: row.expiresAt,
          }
        : { id: row.id, nickname: row.nickname, pairVersion: row.pairVersion },
  );
  const last = rows.at(-1);
  return {
    ok: true,
    value: {
      items,
      nextCursor: result.results.length > rows.length ? (last?.id ?? last?.inviteId ?? null) : null,
    },
  };
}
