import { isHappenedOn, isInviteToken, isSocialId } from '@/domain/social/input';
import type {
  FriendView,
  InviteCreated,
  InviteView,
  Page,
  PairResult,
  PostView,
  ProfileView,
  RequestView,
  SocialMe,
} from '@/domain/social/social';
import { category } from '@/infra/social/category-decode';

export class SocialProtocolError extends Error {
  constructor() {
    super('소셜 응답 형식이 올바르지 않습니다.');
    this.name = 'SocialProtocolError';
  }
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SocialProtocolError();
  }
  const object = value as Record<string, unknown>;
  if (Object.keys(object).length !== keys.length || keys.some((key) => !(key in object))) {
    throw new SocialProtocolError();
  }
  return object;
}

function string(value: unknown): string {
  if (typeof value !== 'string') throw new SocialProtocolError();
  return value;
}

function id(value: unknown): string {
  if (!isSocialId(value)) throw new SocialProtocolError();
  return value;
}

function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new SocialProtocolError();
  }
  return value;
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new SocialProtocolError();
  return value;
}

export function profile(value: unknown): ProfileView {
  const data = exact(value, ['id', 'nickname', 'version']);
  return { id: id(data.id), nickname: string(data.nickname), version: number(data.version) };
}

export function me(value: unknown): SocialMe {
  const data = exact(value, ['profile', 'mode']);
  if (data.mode !== 'off' && data.mode !== 'read-only' && data.mode !== 'enabled') {
    throw new SocialProtocolError();
  }
  return { profile: data.profile === null ? null : profile(data.profile), mode: data.mode };
}

export function profileVersion(value: unknown): Pick<ProfileView, 'id' | 'version'> {
  const data = exact(value, ['id', 'version']);
  return { id: id(data.id), version: number(data.version) };
}

export function friend(value: unknown): FriendView {
  const data = exact(value, ['id', 'nickname', 'pairVersion']);
  return {
    id: id(data.id),
    nickname: string(data.nickname),
    pairVersion: number(data.pairVersion),
  };
}

export function request(value: unknown): RequestView {
  const data = exact(value, ['peer', 'pairVersion', 'expiresAt']);
  const peer = exact(data.peer, ['id', 'nickname']);
  return {
    peer: { id: id(peer.id), nickname: string(peer.nickname) },
    pairVersion: number(data.pairVersion),
    expiresAt: number(data.expiresAt),
  };
}

export function invite(value: unknown): InviteView {
  const data = exact(value, ['inviteId', 'status', 'expiresAt']);
  if (
    !isInviteToken(data.inviteId) ||
    !['active', 'used', 'revoked', 'expired'].includes(String(data.status))
  ) {
    throw new SocialProtocolError();
  }
  return {
    inviteId: data.inviteId,
    status: data.status as InviteView['status'],
    expiresAt: number(data.expiresAt),
  };
}

export function inviteCreated(value: unknown): InviteCreated {
  if (typeof value === 'object' && value !== null && 'tokenUnavailable' in value) {
    const data = exact(value, ['inviteId', 'tokenUnavailable']);
    if (data.tokenUnavailable !== true || !isInviteToken(data.inviteId)) {
      throw new SocialProtocolError();
    }
    return { inviteId: data.inviteId, tokenUnavailable: true };
  }
  const data = exact(value, ['token', 'expiresAt']);
  if (!isInviteToken(data.token)) throw new SocialProtocolError();
  return { token: data.token, expiresAt: number(data.expiresAt) };
}

export function pair(value: unknown): PairResult {
  const data = exact(value, ['peerId', 'pairVersion', 'state']);
  if (data.state !== 'none' && data.state !== 'pending' && data.state !== 'accepted') {
    throw new SocialProtocolError();
  }
  return { peerId: id(data.peerId), pairVersion: number(data.pairVersion), state: data.state };
}

export function sentRequest(value: unknown): Pick<PairResult, 'peerId' | 'pairVersion'> {
  const data = exact(value, ['peerId', 'pairVersion']);
  return { peerId: id(data.peerId), pairVersion: number(data.pairVersion) };
}

export function block(value: unknown): { blocked: boolean; pairVersion: number } {
  const data = exact(value, ['blocked', 'pairVersion']);
  return { blocked: boolean(data.blocked), pairVersion: number(data.pairVersion) };
}

export function post(value: unknown): PostView {
  const hasCategory = typeof value === 'object' && value !== null && 'category' in value;
  const data = exact(value, [
    'id',
    'author',
    'text',
    'happenedOn',
    'createdAt',
    'reactionCount',
    'myReaction',
    ...(hasCategory ? ['category'] : []),
  ]);
  const author = exact(data.author, ['id', 'nickname']);
  if (!isHappenedOn(data.happenedOn)) throw new SocialProtocolError();
  return {
    id: id(data.id),
    author: { id: id(author.id), nickname: string(author.nickname) },
    text: string(data.text),
    happenedOn: data.happenedOn,
    createdAt: number(data.createdAt),
    reactionCount: number(data.reactionCount),
    myReaction: boolean(data.myReaction),
    ...(hasCategory ? { category: category(data.category) } : {}),
  };
}

export function page<T>(value: unknown, readItem: (item: unknown) => T): Page<T> {
  const data = exact(value, ['items', 'nextCursor']);
  if (
    !Array.isArray(data.items) ||
    data.items.length > 50 ||
    (data.nextCursor !== null && typeof data.nextCursor !== 'string')
  ) {
    throw new SocialProtocolError();
  }
  return { items: data.items.map(readItem), nextCursor: data.nextCursor };
}

export function allowed(value: unknown): { allowedIds: readonly string[] } {
  const data = exact(value, ['allowedIds']);
  if (
    !Array.isArray(data.allowedIds) ||
    data.allowedIds.length > 50 ||
    !data.allowedIds.every(isSocialId)
  ) {
    throw new SocialProtocolError();
  }
  return { allowedIds: data.allowedIds };
}

export function flag<K extends string>(value: unknown, key: K): Record<K, true> {
  const data = exact(value, [key]);
  if (data[key] !== true) throw new SocialProtocolError();
  return { [key]: true } as Record<K, true>;
}

export function field<K extends string>(value: unknown, key: K): Record<K, string> {
  const data = exact(value, [key]);
  return { [key]: id(data[key]) } as Record<K, string>;
}

export function reaction(value: unknown): { postId: string; active: boolean } {
  const data = exact(value, ['postId', 'active']);
  return { postId: id(data.postId), active: boolean(data.active) };
}

export function preview(value: unknown): { nickname: string; expiresAt: number } {
  const data = exact(value, ['nickname', 'expiresAt']);
  return { nickname: string(data.nickname), expiresAt: number(data.expiresAt) };
}
