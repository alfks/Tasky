import { parseProfileInput } from '@/domain/social/command-input';
import type { SocialMode } from '@/domain/social/social';

import {
  actorFailure,
  createProfileWithStatus,
  currentAccount,
  currentProfile,
  type SocialActor,
} from './actor';
import { renameProfile } from './commands';
import type { Handled } from './http';

export async function handleProfile(
  actor: SocialActor,
  path: string,
  body: unknown,
  key: string | null,
  mode: SocialMode,
): Promise<Handled> {
  if (path === '/api/social/me') {
    if (!(await currentAccount(actor))) return { ok: false, code: await actorFailure(actor) };
    const profile = await currentProfile(actor);
    if (!(await currentAccount(actor))) return { ok: false, code: await actorFailure(actor) };
    if (actor.profileId !== null && profile === null)
      return { ok: false, code: await actorFailure(actor) };
    return { ok: true, value: { data: { profile, mode } } };
  }
  if (path === '/api/social/profile') {
    const parsed = parseProfileInput(body);
    if (!parsed.ok) return { ok: false, code: 'validation' };
    const result = await createProfileWithStatus(actor, parsed.value.nickname);
    return result.ok
      ? {
          ok: true,
          value: { data: result.value.profile, status: result.value.didInsert ? 201 : 200 },
        }
      : result;
  }
  const result = await renameProfile(actor, key, body);
  return result.ok
    ? {
        ok: true,
        value: { data: { id: result.value.resourceId, version: result.value.resultVersion } },
      }
    : result;
}
