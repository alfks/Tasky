import { parseProfileInput } from '@/domain/social/command-input';
import type { SocialMode } from '@/domain/social/social';

import {
  actorFailure,
  createProfile,
  currentAccount,
  currentProfile,
  type SocialActor,
} from './actor';
import { renameProfile } from './commands';
import { handled, type Handled } from './http';

export async function handleProfile(
  actor: SocialActor,
  path: string,
  body: unknown,
  key: string | null,
  mode: SocialMode,
): Promise<Handled> {
  if (path === '/api/social/me') {
    if (!(await currentAccount(actor))) return { ok: false, code: await actorFailure(actor) };
    return { ok: true, value: { data: { profile: await currentProfile(actor), mode } } };
  }
  if (path === '/api/social/profile') {
    const parsed = parseProfileInput(body);
    if (!parsed.ok) return { ok: false, code: 'validation' };
    const result = await createProfile(actor, parsed.value.nickname);
    return handled(result, actor.profileId === null ? 201 : 200);
  }
  const result = await renameProfile(actor, key, body);
  return result.ok
    ? {
        ok: true,
        value: { data: { id: result.value.resourceId, version: result.value.resultVersion } },
      }
    : result;
}
