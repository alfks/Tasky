import { acceptPair } from './pair-command';
import { blockPeer } from './block-command';
import { consumeInvite } from './invite-command';
import { removeFriend } from './remove-friend';
import { transitionPair } from './pair-transition';
import { unblockPeer } from './unblock-command';
import type { Handled } from './http';
import type { SocialActor } from './actor';
import type { CommandReply } from './commands';

function pairReply(
  result: CommandReply,
  state?: 'none' | 'accepted' | 'pending',
  status = 200,
): Handled {
  return result.ok
    ? {
        ok: true,
        value: {
          status,
          data: {
            peerId: result.value.resourceId,
            pairVersion: result.value.resultVersion,
            ...(state === undefined ? {} : { state }),
          },
        },
      }
    : result;
}

export async function handleRelation(
  actor: SocialActor,
  path: string,
  body: unknown,
  key: string | null,
): Promise<Handled> {
  if (path === '/api/social/requests')
    return pairReply(await consumeInvite(actor, key, body), undefined, 201);
  if (path === '/api/social/requests/accept')
    return pairReply(await acceptPair(actor, key, body), 'accepted');
  if (path === '/api/social/requests/decline')
    return pairReply(await transitionPair(actor, key, body, 'decline'), 'none');
  if (path === '/api/social/requests/cancel')
    return pairReply(await transitionPair(actor, key, body, 'cancel'), 'none');
  if (path === '/api/social/friends/remove')
    return pairReply(await removeFriend(actor, key, body), 'none');
  const input = body as { blocked?: unknown } | null;
  const result =
    input?.blocked === false
      ? await unblockPeer(actor, key, body)
      : await blockPeer(actor, key, body);
  return result.ok
    ? {
        ok: true,
        value: {
          data: {
            blocked: input?.blocked,
            pairVersion: result.value.resultVersion,
          },
        },
      }
    : result;
}
