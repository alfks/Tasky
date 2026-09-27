import { parseRenameInput } from '@/domain/social/command-input';
import { canonicalCommandRequest, isFreshNewKey, keyTimestamp } from '@/domain/social/idempotency';
import type { SocialErrorCode } from '@/domain/social/social';

import { currentProfile, type SocialActor, type SocialOutcome } from './actor';
import { reserveLimit } from './limits';

import { sql } from '../db/sql';

type Receipt = {
  actor: string;
  key: string;
  request_hash: string;
  execution_nonce: string;
  result_code: 'ok' | SocialErrorCode;
  resource_id: string | null;
  result_version: number | null;
};

export type CommandReply = SocialOutcome<{
  resourceId: string | null;
  resultVersion: number | null;
  didApply: boolean;
}>;

function bytesHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function requestHash(method: string, path: string, dto: Record<string, string | number>): Promise<string> {
  const canonical = canonicalCommandRequest(method, path, 1, dto);
  return bytesHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))));
}

export async function receiptFor(actor: SocialActor, key: string): Promise<Receipt | null> {
  if (actor.profileId === null) return null;
  const row = await actor.db
    .prepare(sql`SELECT c.actor,c.key,c.request_hash,c.execution_nonce,c.result_code,
        c.resource_id,c.result_version FROM social_commands c
        JOIN social_profiles p ON p.id = c.actor JOIN users u ON u.sub = p.sub
        JOIN sessions s ON s.sub = u.sub
        WHERE c.actor = ? AND c.key = ? AND p.sub = ? AND s.sid = ? AND s.expires_at > ?
          AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)`)
    .bind(actor.profileId, key, actor.sub, actor.sid, actor.nowIso)
    .first<Receipt>();
  return row ?? null;
}

export function fromReceipt(receipt: Receipt | null, hash: string, nonce: string): CommandReply {
  if (receipt === null) return { ok: false, code: 'unavailable' };
  if (receipt.request_hash !== hash) return { ok: false, code: 'idempotency-conflict' };
  if (receipt.result_code !== 'ok') return { ok: false, code: receipt.result_code };
  return {
    ok: true,
    value: {
      resourceId: receipt.resource_id,
      resultVersion: receipt.result_version,
      didApply: receipt.execution_nonce === nonce,
    },
  };
}

/** Auth, scoped receipt lookup, then new-key freshness; every SQL effect rechecks A. */
export async function renameProfile(
  actor: SocialActor,
  key: unknown,
  dto: unknown,
): Promise<CommandReply> {
  const parsed = parseRenameInput(dto);
  if (!parsed.ok) return { ok: false, code: 'validation' };
  const profile = await currentProfile(actor);
  if (profile === null) return { ok: false, code: 'unavailable' };
  const timestamp = keyTimestamp(key);
  if (timestamp === null || typeof key !== 'string') return { ok: false, code: 'validation' };
  const hash = await requestHash('POST', '/api/social/profile/name', parsed.value);
  const existing = await receiptFor(actor, key);
  if (existing !== null) return fromReceipt(existing, hash, 'new-request');
  if (!isFreshNewKey(timestamp, actor.nowMs)) return { ok: false, code: 'request-expired' };
  const allowed = await reserveLimit(actor, `p:${profile.id}`, 'write');
  if (!allowed) return { ok: false, code: 'rate-limited' };
  const nonce = crypto.randomUUID();

  const results = await actor.db.batch([
    actor.db
      .prepare(sql`INSERT INTO social_commands(actor,key,request_hash,execution_nonce,
          result_code,resource_id,result_version,created_at)
        SELECT p.id,?,?,?,CASE WHEN p.version = ? THEN 'ok' ELSE 'conflict' END,
          p.id,CASE WHEN p.version = ? THEN p.version + 1 ELSE p.version END,?
        FROM social_profiles p JOIN users u ON u.sub = p.sub JOIN sessions s ON s.sub = u.sub
        WHERE p.id = ? AND p.sub = ? AND s.sid = ? AND s.expires_at > ?
          AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)
        ON CONFLICT(actor,key) DO NOTHING`)
      .bind(key, hash, nonce, parsed.value.expectedVersion, parsed.value.expectedVersion,
        actor.nowMs, profile.id, actor.sub, actor.sid, actor.nowIso),
    actor.db
      .prepare(sql`UPDATE social_profiles SET nickname = ?, version = version + 1
        WHERE id = ? AND sub = ? AND version = ?
          AND EXISTS (SELECT 1 FROM sessions s JOIN users u ON u.sub = s.sub
            WHERE s.sid = ? AND s.sub = ? AND s.expires_at > ?
              AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub))
          AND EXISTS (SELECT 1 FROM social_commands c WHERE c.actor = ? AND c.key = ?
            AND c.execution_nonce = ? AND c.result_code = 'ok')`)
      .bind(parsed.value.nickname, profile.id, actor.sub, parsed.value.expectedVersion,
        actor.sid, actor.sub, actor.nowIso, profile.id, key, nonce),
    actor.db
      .prepare(sql`SELECT c.actor,c.key,c.request_hash,c.execution_nonce,c.result_code,
          c.resource_id,c.result_version FROM social_commands c
        JOIN social_profiles p ON p.id = c.actor JOIN users u ON u.sub = p.sub
        JOIN sessions s ON s.sub = u.sub
        WHERE c.actor = ? AND c.key = ? AND p.sub = ? AND s.sid = ? AND s.expires_at > ?
          AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)`)
      .bind(profile.id, key, actor.sub, actor.sid, actor.nowIso),
  ]);
  const receipt = (results[2].results[0] as Receipt | undefined) ?? null;
  const reply = fromReceipt(receipt, hash, nonce);
  if (reply.ok && reply.value.didApply && results[1].meta.changes !== 1) {
    return { ok: false, code: 'temporary' };
  }
  return reply;
}
