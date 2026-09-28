import { effectiveInviteStatus, planInviteRevoke, planInviteUse } from '@/domain/social/invite';
import type { InviteView, Page, PageInput, PairResult } from '@/domain/social/social';

import { keyPage } from '@/repositories/memory/social/cursor';
import { randomHex, sha256 } from '@/repositories/memory/social/hash';
import {
  actor,
  fail,
  requireSession,
  type MemoryInvite,
  type MemorySocialState,
} from '@/repositories/memory/social/model';
import {
  blockKey,
  isFriend,
  profileById,
  transition,
} from '@/repositories/memory/social/relations';

const INVITE_MS = 7 * 24 * 60 * 60 * 1000;

export async function createInvite(
  state: MemorySocialState,
  sub: string,
): Promise<{ token: string; expiresAt: number }> {
  const token = randomHex(32);
  const tokenHash = await sha256(token);
  const self = actor(state, sub);
  if (state.mode !== 'enabled') return fail('social-disabled', state.now());
  const activeCount = [...state.invites.values()].filter(
    (item) =>
      item.ownerId === self.id &&
      effectiveInviteStatus(item.status, item.expiresAt, state.now()) === 'active',
  ).length;
  if (activeCount >= 5) return fail('limit-reached', state.now());
  const invite: MemoryInvite = {
    id: tokenHash,
    ownerId: self.id,
    status: 'active',
    expiresAt: state.now() + INVITE_MS,
  };
  state.invites.set(tokenHash, invite);
  return { token, expiresAt: invite.expiresAt };
}

export function listInvites(
  state: MemorySocialState,
  sub: string,
  input?: PageInput,
): Page<InviteView> {
  const self = actor(state, sub);
  const items = [...state.invites.values()]
    .filter((item) => item.ownerId === self.id)
    .map((item) => ({
      inviteId: item.id,
      status: effectiveInviteStatus(item.status, item.expiresAt, state.now()),
      expiresAt: item.expiresAt,
    }))
    .sort((a, b) => a.inviteId.localeCompare(b.inviteId));
  return keyPage(state, self.id, 'invites', items, input, (item) => item.inviteId);
}

export function revokeInvite(state: MemorySocialState, sub: string, inviteId: string): void {
  const self = actor(state, sub);
  const invite = [...state.invites.values()].find((item) => item.id === inviteId);
  if (invite === undefined) return fail('unavailable', state.now());
  const plan = planInviteRevoke({
    ownerId: invite.ownerId,
    actorId: self.id,
    status: invite.status,
    expiresAt: invite.expiresAt,
    nowMs: state.now(),
    isBlocked: false,
    isAlreadyFriend: false,
    isAtLimit: false,
  });
  if (!plan.ok) return fail(plan.code, state.now());
  invite.status = 'revoked';
}

export async function previewInvite(
  state: MemorySocialState,
  sub: string,
  token: string,
): Promise<{
  nickname: string;
  expiresAt: number;
}> {
  const tokenHash = await sha256(token);
  requireSession(state, sub);
  if (state.mode === 'off') return fail('social-disabled', state.now());
  const invite = state.invites.get(tokenHash);
  if (
    invite === undefined ||
    effectiveInviteStatus(invite.status, invite.expiresAt, state.now()) !== 'active'
  ) {
    return fail('unavailable', state.now());
  }
  const owner = profileById(state, invite.ownerId);
  if (owner === undefined) return fail('unavailable', state.now());
  return { nickname: owner.nickname, expiresAt: invite.expiresAt };
}

export async function sendRequest(
  state: MemorySocialState,
  sub: string,
  token: string,
): Promise<PairResult> {
  const tokenHash = await sha256(token);
  const self = actor(state, sub);
  if (state.mode !== 'enabled') return fail('social-disabled', state.now());
  const invite = state.invites.get(tokenHash);
  if (invite === undefined) return fail('unavailable', state.now());
  const plan = planInviteUse({
    ownerId: invite.ownerId,
    actorId: self.id,
    status: invite.status,
    expiresAt: invite.expiresAt,
    nowMs: state.now(),
    isBlocked:
      state.blocks.has(blockKey(self.id, invite.ownerId)) ||
      state.blocks.has(blockKey(invite.ownerId, self.id)),
    isAlreadyFriend: isFriend(state, self.id, invite.ownerId),
    isAtLimit: false,
  });
  if (!plan.ok) return fail(plan.code, state.now());
  const result = transition(state, sub, invite.ownerId, 'request');
  invite.status = 'used';
  return result;
}
