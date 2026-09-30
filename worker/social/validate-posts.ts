import { parsePostIdsInput } from '@/domain/social/command-input';

import { actorFailure, currentProfile, type SocialActor, type SocialOutcome } from './actor';
import { queryAllowedPostIds } from './visibility-sql';

/** The SQL returns IDs only; absent and revoked posts have the same result. */
export async function validatePosts(
  actor: SocialActor,
  input: unknown,
  ownerOnly = false,
): Promise<SocialOutcome<{ allowedIds: readonly string[] }>> {
  const parsed = parsePostIdsInput(input);
  if (!parsed.ok) return { ok: false, code: 'validation' };
  const profile = await currentProfile(actor);
  if (profile === null) return { ok: false, code: await actorFailure(actor) };
  const rows = await queryAllowedPostIds(actor, parsed.value.ids, ownerOnly);
  if (rows.results.length === 0 && (await currentProfile(actor)) === null)
    return { ok: false, code: await actorFailure(actor) };
  return { ok: true, value: { allowedIds: rows.results.map((row) => row.id) } };
}
