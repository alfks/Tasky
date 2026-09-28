import { handled, type Handled } from './http';
import { setReaction } from './reaction-command';

import type { SocialActor } from './actor';

export async function handleReaction(
  actor: SocialActor,
  body: unknown,
  key: string | null,
): Promise<Handled> {
  return handled(await setReaction(actor, key, body));
}
