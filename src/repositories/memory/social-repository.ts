/** 테스트 전용 actor-bound 온라인 저장소. 개인 저장소 묶음이나 앱 번들에 넣지 않는다. */
import {
  parseBlockInput,
  parseInviteIdInput,
  parsePeerVersionInput,
  parsePostIdInput,
  parsePostIdsInput,
  parseProfileInput,
  parseReactionInput,
  parseRenameInput,
  parseTokenInput,
} from '@/domain/social/command-input';
import { canonicalCommandRequest } from '@/domain/social/idempotency';
import { parsePostInput, type Validation } from '@/domain/social/input';
import type { InviteCreated, SocialMode } from '@/domain/social/social';

import { sha256 } from '@/repositories/memory/social/hash';
import { categoryMethods } from '@/repositories/memory/social/categories';
import { createMemoryPublicRepository } from '@/repositories/memory/social/public';
import {
  createInvite,
  listInvites,
  previewInvite,
  revokeInvite,
  sendRequest,
} from '@/repositories/memory/social/invites';
import {
  actor,
  answer,
  command,
  createSocialState,
  fail,
  nextId,
  requireSession,
  type MemorySocialState,
} from '@/repositories/memory/social/model';
import {
  createPost,
  deletePost,
  feed,
  mine,
  setReaction,
  validate,
} from '@/repositories/memory/social/posts';
import { blocks, friends, requests, transition } from '@/repositories/memory/social/relations';
import type { PublicSocialRepository, SocialRepository } from '@/repositories/social-repository';

export type MemorySocialServer = {
  forActor: (sub: string) => SocialRepository;
  publicForActor: (sub?: string) => PublicSocialRepository;
  /** 계약 벡터가 현재 관계·receipt를 주입할 때만 사용한다. */
  state: MemorySocialState;
};

function valid<T>(state: MemorySocialState, parsed: Validation<T>): T {
  return parsed.ok ? parsed.value : fail(parsed.code, state.now());
}

async function signature(path: string, input: object): Promise<string> {
  const fields = Object.entries(input).filter(([, value]) => value !== undefined);
  const canonical = canonicalCommandRequest(
    'POST',
    `/api/social/${path}`,
    1,
    Object.fromEntries(fields),
  );
  return sha256(canonical);
}

export function createMemorySocialServer(
  options: {
    now?: () => number;
    mode?: SocialMode;
  } = {},
): MemorySocialServer {
  const state = createSocialState(options.now ?? Date.now, options.mode ?? 'enabled');
  return {
    state,
    publicForActor: (sub) => createMemoryPublicRepository(state, sub),
    forActor: (sub) => {
      state.sessionActive.add(sub);
      return createMemorySocialRepository(state, sub);
    },
  };
}

function createMemorySocialRepository(state: MemorySocialState, sub: string): SocialRepository {
  return {
    ...categoryMethods(state, sub),
    me: async () => {
      requireSession(state, sub);
      return answer(state, { profile: state.profiles.get(sub) ?? null, mode: state.mode });
    },
    createProfile: async (input) => {
      requireSession(state, sub);
      if (state.mode !== 'enabled') return fail('social-disabled', state.now());
      const parsed = valid(state, parseProfileInput(input));
      const existing = state.profiles.get(sub);
      if (existing !== undefined) return answer(state, existing);
      const profile = { id: nextId(state), nickname: parsed.nickname, version: 0 };
      state.profiles.set(sub, profile);
      return answer(state, profile);
    },
    renameProfile: async (input, { key }) => {
      const parsed = valid(state, parseRenameInput(input));
      return command(state, sub, key, await signature('profile/name', parsed), () => {
        const self = actor(state, sub);
        if (state.mode !== 'enabled') return fail('social-disabled', state.now());
        if (self.version !== parsed.expectedVersion) return fail('conflict', state.now());
        const renamed = { ...self, nickname: parsed.nickname, version: self.version + 1 };
        state.profiles.set(sub, renamed);
        return { id: renamed.id, version: renamed.version };
      });
    },
    friends: async (input) => answer(state, friends(state, sub, input)),
    requests: async (direction, input) => answer(state, requests(state, sub, direction, input)),
    createInvite: async ({ key }) =>
      command<InviteCreated>(
        state,
        sub,
        key,
        await signature('invites', {}),
        () => createInvite(state, sub),
        {
          receiptData: async (first) =>
            'token' in first
              ? {
                  inviteId: state.invites.get(await sha256(first.token))?.id ?? '',
                  tokenUnavailable: true,
                }
              : first,
        },
      ),
    invites: async (input) => answer(state, listInvites(state, sub, input)),
    revokeInvite: async (input, { key }) => {
      const parsed = valid(state, parseInviteIdInput(input));
      return command(
        state,
        sub,
        key,
        await signature('invites/revoke', parsed),
        () => {
          revokeInvite(state, sub, parsed.inviteId);
          return { revoked: true as const };
        },
        { gate: 'revoke' },
      );
    },
    previewInvite: async (input) => {
      const parsed = valid(state, parseTokenInput(input));
      return answer(state, await previewInvite(state, sub, parsed.token));
    },
    sendRequest: async (input, { key }) => {
      const parsed = valid(state, parseTokenInput(input));
      return command(state, sub, key, await signature('requests', parsed), async () => {
        const result = await sendRequest(state, sub, parsed.token);
        return { peerId: result.peerId, pairVersion: result.pairVersion };
      });
    },
    acceptRequest: async (input, { key }) => {
      const parsed = valid(state, parsePeerVersionInput(input));
      return command(state, sub, key, await signature('requests/accept', parsed), () =>
        transition(state, sub, parsed.peerId, 'accept', parsed.expectedVersion),
      );
    },
    declineRequest: async (input, { key }) => {
      const parsed = valid(state, parsePeerVersionInput(input));
      return command(
        state,
        sub,
        key,
        await signature('requests/decline', parsed),
        () => transition(state, sub, parsed.peerId, 'decline', parsed.expectedVersion),
        { gate: 'revoke' },
      );
    },
    cancelRequest: async (input, { key }) => {
      const parsed = valid(state, parsePeerVersionInput(input));
      return command(
        state,
        sub,
        key,
        await signature('requests/cancel', parsed),
        () => transition(state, sub, parsed.peerId, 'cancel', parsed.expectedVersion),
        { gate: 'revoke' },
      );
    },
    removeFriend: async (input, { key }) => {
      const parsed = valid(state, parsePeerVersionInput(input));
      return command(
        state,
        sub,
        key,
        await signature('friends/remove', parsed),
        () => transition(state, sub, parsed.peerId, 'remove', parsed.expectedVersion),
        { gate: 'revoke' },
      );
    },
    blocks: async (input) => answer(state, blocks(state, sub, input)),
    setBlock: async (input, { key }) => {
      const parsed = valid(state, parseBlockInput(input));
      return command(
        state,
        sub,
        key,
        await signature('blocks/set', parsed),
        () => {
          const result = transition(
            state,
            sub,
            parsed.peerId,
            parsed.blocked ? 'block' : 'unblock',
            parsed.expectedVersion,
          );
          return { blocked: parsed.blocked, pairVersion: result.pairVersion };
        },
        { gate: parsed.blocked ? 'write' : 'revoke' },
      );
    },
    feed: async (input) => answer(state, feed(state, sub, input)),
    validatePosts: async (input) => {
      const parsed = valid(state, parsePostIdsInput(input));
      return answer(state, { allowedIds: validate(state, sub, parsed.ids) });
    },
    myPosts: async (input) => answer(state, mine(state, sub, input)),
    createPost: async (input, { key }) => {
      const parsed = valid(state, parsePostInput(input));
      return command(state, sub, key, await signature('posts', parsed), () => ({
        id: createPost(state, sub, parsed),
      }));
    },
    deletePost: async (input, { key }) => {
      const parsed = valid(state, parsePostIdInput(input));
      return command(
        state,
        sub,
        key,
        await signature('posts/delete', parsed),
        () => {
          deletePost(state, sub, parsed.id);
          return { deleted: true as const };
        },
        { gate: 'revoke' },
      );
    },
    setReaction: async (input, { key }) => {
      const parsed = valid(state, parseReactionInput(input));
      return command(
        state,
        sub,
        key,
        await signature('reactions/set', parsed),
        () => {
          setReaction(state, sub, parsed.postId, parsed.active);
          return { postId: parsed.postId, active: parsed.active };
        },
        { gate: parsed.active ? 'write' : 'revoke' },
      );
    },
  };
}
