import { parseCategoryInput } from '@/domain/social/category-input';
import { isFreshNewKey, keyTimestamp } from '@/domain/social/idempotency';
import type { SocialCategoryView, SocialMode } from '@/domain/social/social';

import { actorFailure, currentProfile, type SocialActor, type SocialOutcome } from './actor';
import { readCategory } from './category-read';
import { commitCategory } from './category-write';
import { fromReceipt, receiptFor, requestHash } from './commands';
import { admitCommand } from './limits';

async function execute(
  actor: SocialActor,
  key: string,
  hash: string,
  input: Parameters<typeof commitCategory>[5],
  id: string,
  create: boolean,
): Promise<SocialOutcome<SocialCategoryView>> {
  const nonce = crypto.randomUUID();
  const results = await commitCategory(actor, key, hash, nonce, id, input, create);
  const receipt = results[3].results[0] as Parameters<typeof fromReceipt>[0] | undefined;
  if (!receipt) return { ok: false, code: await actorFailure(actor) };
  const reply = fromReceipt(receipt, hash, nonce);
  return reply.ok && reply.value.resourceId
    ? readCategory(actor, reply.value.resourceId, true)
    : reply.ok
      ? { ok: false, code: 'temporary' }
      : reply;
}

/** An off/read-only private reduction cannot smuggle a metadata edit or create a projection. */
export async function saveCategory(
  actor: SocialActor,
  key: unknown,
  body: unknown,
  mode: SocialMode = 'enabled',
): Promise<SocialOutcome<SocialCategoryView>> {
  if (!(await currentProfile(actor))) return { ok: false, code: await actorFailure(actor) };
  const parsed = parseCategoryInput(body);
  const reduction =
    parsed.ok && parsed.value.id !== undefined && parsed.value.visibility === 'private'
      ? await readCategory(actor, parsed.value.id, true)
      : null;
  const metadataSame =
    parsed.ok &&
    reduction?.ok &&
    reduction.value.name === parsed.value.name &&
    reduction.value.color === parsed.value.color &&
    reduction.value.emoji === parsed.value.emoji;
  const budget = metadataSame ? 'revoke' : 'write';
  const admission = await admitCommand(actor, budget);
  if (admission) return { ok: false, code: admission };
  if (!parsed.ok || typeof key !== 'string') return { ok: false, code: 'validation' };
  const stamp = keyTimestamp(key);
  if (stamp === null) return { ok: false, code: 'validation' };
  const input = parsed.value;
  const hash = await requestHash('POST', '/api/social/categories', input);
  const old = await receiptFor(actor, key);
  if (old) {
    const reply = fromReceipt(old, hash, 'replay');
    return reply.ok && reply.value.resourceId
      ? readCategory(actor, reply.value.resourceId, true)
      : reply.ok
        ? { ok: false, code: 'temporary' }
        : reply;
  }
  if (mode !== 'enabled') {
    if (!input.id || input.visibility !== 'private') return { ok: false, code: 'social-disabled' };
    const current = reduction ?? (await readCategory(actor, input.id, true));
    if (!current.ok) return current;
    if (
      current.value.name !== input.name ||
      current.value.color !== input.color ||
      current.value.emoji !== input.emoji
    )
      return { ok: false, code: 'social-disabled' };
  }
  if (!isFreshNewKey(stamp, actor.nowMs)) return { ok: false, code: 'request-expired' };
  const id = input.id ?? crypto.randomUUID().replace(/-/gu, '');
  return execute(actor, key, hash, input, id, input.id === undefined);
}
