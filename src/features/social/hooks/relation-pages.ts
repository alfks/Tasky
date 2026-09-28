import type { FriendView, InviteView, Page, RequestView, SocialMe } from '@/domain/social/social';

import type { SocialRepository } from '@/repositories/social-repository';

export type RelationKind = 'friends' | 'incoming' | 'outgoing' | 'invites' | 'blocks';
export type RelationsSnapshot = {
  me: SocialMe | null;
  friends: readonly FriendView[];
  incoming: readonly RequestView[];
  outgoing: readonly RequestView[];
  invites: readonly InviteView[];
  blocks: readonly FriendView[];
  next: Record<RelationKind, string | null>;
};

export const EMPTY_RELATIONS: RelationsSnapshot = {
  me: null,
  friends: [],
  incoming: [],
  outgoing: [],
  invites: [],
  blocks: [],
  next: { friends: null, incoming: null, outgoing: null, invites: null, blocks: null },
};

export async function readRelationSnapshot(
  repo: SocialRepository,
  me: SocialMe,
): Promise<RelationsSnapshot> {
  const [friends, incoming, outgoing, invites, blocks] = await Promise.all([
    repo.friends(),
    repo.requests('incoming'),
    repo.requests('outgoing'),
    repo.invites(),
    repo.blocks(),
  ]);
  return {
    me,
    friends: friends.data.items,
    incoming: incoming.data.items,
    outgoing: outgoing.data.items,
    invites: invites.data.items,
    blocks: blocks.data.items,
    next: {
      friends: friends.data.nextCursor,
      incoming: incoming.data.nextCursor,
      outgoing: outgoing.data.nextCursor,
      invites: invites.data.nextCursor,
      blocks: blocks.data.nextCursor,
    },
  };
}

export async function readRelationPage(
  repo: SocialRepository,
  kind: RelationKind,
  cursor: string,
): Promise<Page<FriendView | RequestView | InviteView>> {
  const page = { cursor };
  if (kind === 'friends') return (await repo.friends(page)).data;
  if (kind === 'incoming') return (await repo.requests('incoming', page)).data;
  if (kind === 'outgoing') return (await repo.requests('outgoing', page)).data;
  if (kind === 'invites') return (await repo.invites(page)).data;
  return (await repo.blocks(page)).data;
}

export function appendRelationPage(
  previous: RelationsSnapshot,
  kind: RelationKind,
  page: Page<FriendView | RequestView | InviteView>,
): RelationsSnapshot {
  const next = { ...previous.next, [kind]: page.nextCursor };
  if (kind === 'friends')
    return { ...previous, friends: [...previous.friends, ...(page.items as FriendView[])], next };
  if (kind === 'incoming')
    return {
      ...previous,
      incoming: [...previous.incoming, ...(page.items as RequestView[])],
      next,
    };
  if (kind === 'outgoing')
    return {
      ...previous,
      outgoing: [...previous.outgoing, ...(page.items as RequestView[])],
      next,
    };
  if (kind === 'invites')
    return { ...previous, invites: [...previous.invites, ...(page.items as InviteView[])], next };
  return { ...previous, blocks: [...previous.blocks, ...(page.items as FriendView[])], next };
}
