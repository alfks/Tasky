import { createInvite } from './invite-create';
import { previewInvite } from './invite-command';
import { revokeInvite } from './invite-revoke';
import { handled, type Handled } from './http';

import type { SocialActor } from './actor';

export async function handleInvite(
  actor: SocialActor,
  path: string,
  body: unknown,
  key: string | null,
  secret: string,
): Promise<Handled> {
  if (path === '/api/social/invites') {
    const result = await createInvite(actor, key, body);
    return handled(result, result.ok && 'token' in result.value ? 201 : 200);
  }
  if (path === '/api/social/invites/preview') {
    return handled(await previewInvite(actor, secret, body));
  }
  const result = await revokeInvite(actor, key, body);
  return result.ok ? { ok: true, value: { data: { revoked: true } } } : result;
}
