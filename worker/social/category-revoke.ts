import { parseCategoryRevokeInput } from '@/domain/social/category-input';
import { isFreshNewKey, keyTimestamp } from '@/domain/social/idempotency';
import type { SocialCategoryView } from '@/domain/social/social';

import { actorFailure, currentProfile, type SocialActor, type SocialOutcome } from './actor';
import { readCategory } from './category-read';
import { commitCategory } from './category-write';
import { fromReceipt, receiptFor, requestHash } from './commands';
import { admitCommand } from './limits';

/** Tombstones keep owner copies manageable without restoring their former public metadata. */
export async function revokeCategory(
  actor: SocialActor,
  key: unknown,
  body: unknown,
): Promise<SocialOutcome<SocialCategoryView>> {
  if (!(await currentProfile(actor))) return { ok: false, code: await actorFailure(actor) };
  const admission = await admitCommand(actor, 'revoke');
  if (admission) return { ok: false, code: admission };
  const parsed = parseCategoryRevokeInput(body);
  if (!parsed.ok || typeof key !== 'string') return { ok: false, code: 'validation' };
  const stamp = keyTimestamp(key);
  if (stamp === null) return { ok: false, code: 'validation' };
  const hash = await requestHash('POST', '/api/social/categories/revoke', parsed.value);
  const old = await receiptFor(actor, key);
  if (old) {
    const reply = fromReceipt(old, hash, 'replay');
    return reply.ok && reply.value.resourceId
      ? readCategory(actor, reply.value.resourceId, true)
      : reply.ok
        ? { ok: false, code: 'temporary' }
        : reply;
  }
  if (!isFreshNewKey(stamp, actor.nowMs)) return { ok: false, code: 'request-expired' };
  const nonce = crypto.randomUUID();
  const results = await commitCategory(
    actor,
    key,
    hash,
    nonce,
    parsed.value.id,
    parsed.value,
    false,
  );
  const receipt = results[3].results[0] as Parameters<typeof fromReceipt>[0] | undefined;
  if (!receipt) return { ok: false, code: await actorFailure(actor) };
  const reply = fromReceipt(receipt, hash, nonce);
  return reply.ok ? readCategory(actor, parsed.value.id, true) : reply;
}
