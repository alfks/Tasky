import { actorAccess } from '@/domain/social/access';
import {
  planCommandAttempt,
  type CommandAttempt,
  type CommandReceipt,
} from '@/domain/social/idempotency';
import type { Pair } from '@/domain/social/relationship';
import type {
  ActorFacts,
  PostView,
  ProfileView,
  SocialErrorCode,
  SocialId,
  SocialMode,
  SocialResponse,
} from '@/domain/social/social';

import type { SocialRepositoryFailure } from '@/repositories/social-repository';

class MemorySocialError extends Error implements SocialRepositoryFailure {
  readonly code: SocialErrorCode;
  readonly serverTime: number;

  constructor(code: SocialErrorCode, serverTime: number) {
    super(code);
    this.name = 'MemorySocialError';
    this.code = code;
    this.serverTime = serverTime;
  }
}

export type MemoryInvite = {
  id: string;
  ownerId: SocialId;
  status: 'active' | 'used' | 'revoked';
  expiresAt: number;
};
export type MemoryPost = Omit<PostView, 'author' | 'reactionCount' | 'myReaction'> & {
  authorId: SocialId;
};
type Receipt = { command: CommandReceipt; data: unknown };
export type CursorReceipt = {
  actorId: SocialId;
  scope: string;
  last: string;
  upper: string | null;
  expiresAt: number;
};

export type MemorySocialState = {
  mode: SocialMode;
  now: () => number;
  serial: number;
  profiles: Map<string, ProfileView>;
  pairs: Map<string, Pair>;
  blocks: Set<string>;
  invites: Map<string, MemoryInvite>;
  posts: Map<SocialId, MemoryPost>;
  reactions: Set<string>;
  reactionTimes: Map<string, number>;
  receipts: Map<string, Receipt>;
  pendingCommands: Map<string, Promise<unknown>>;
  cursors: Map<string, CursorReceipt>;
  sessionActive: Set<string>;
  deleted: Set<string>;
};

export function createSocialState(now: () => number, mode: SocialMode): MemorySocialState {
  return {
    mode,
    now,
    serial: 0,
    profiles: new Map(),
    pairs: new Map(),
    blocks: new Set(),
    invites: new Map(),
    posts: new Map(),
    reactions: new Set(),
    reactionTimes: new Map(),
    receipts: new Map(),
    pendingCommands: new Map(),
    cursors: new Map(),
    sessionActive: new Set(),
    deleted: new Set(),
  };
}

export function nextId(state: MemorySocialState): SocialId {
  state.serial += 1;
  return state.serial.toString(16).padStart(32, '0');
}

export function fail(code: SocialErrorCode, now: number): never {
  throw new MemorySocialError(code, now);
}

export function answer<T>(state: MemorySocialState, data: T): SocialResponse<T> {
  return { data, serverTime: state.now() };
}

export function facts(state: MemorySocialState, sub: string): ActorFacts {
  return {
    actorId: state.profiles.get(sub)?.id ?? '',
    isSessionActive: state.sessionActive.has(sub),
    isAccountActive: !state.deleted.has(sub),
    isProfileActive: state.profiles.has(sub),
  };
}

export function actor(state: MemorySocialState, sub: string): ProfileView {
  const access = actorAccess(facts(state, sub));
  if (!access.allowed) return fail(access.code, state.now());
  const profile = state.profiles.get(sub);
  if (profile === undefined) return fail('unavailable', state.now());
  return profile;
}

export function requireSession(state: MemorySocialState, sub: string): void {
  if (!state.sessionActive.has(sub)) fail('unauthorized', state.now());
  if (state.deleted.has(sub)) fail('account-deleted', state.now());
}

export function attemptCommand(
  actor: ActorFacts,
  key: string,
  signature: string,
  now: number,
  receipt: CommandReceipt | undefined,
): CommandAttempt {
  return planCommandAttempt(actor, key, signature, now, receipt);
}

export async function command<T>(
  state: MemorySocialState,
  sub: string,
  key: string,
  signature: string,
  work: () => T | Promise<T>,
  options: { receiptData?: (data: T) => T | Promise<T>; gate?: 'write' | 'revoke' } = {},
): Promise<SocialResponse<T>> {
  const current = actor(state, sub);
  if (options.gate !== 'revoke' && state.mode !== 'enabled') {
    return fail('social-disabled', state.now());
  }
  const receiptKey = `${current.id}:${key}`;
  const pending = state.pendingCommands.get(receiptKey);
  if (pending !== undefined) {
    await pending;
    return command(state, sub, key, signature, work, options);
  }
  const receipt = state.receipts.get(receiptKey);
  const plan = attemptCommand(facts(state, sub), key, signature, state.now(), receipt?.command);
  if (plan.kind === 'reject') return fail(plan.code, state.now());
  if (plan.kind === 'replay') {
    if (receipt?.command.resultCode !== 'ok') {
      return fail(receipt?.command.resultCode ?? 'temporary', state.now());
    }
    return answer(state, receipt.data as T);
  }
  const record = (resultCode: 'ok' | SocialErrorCode, data: unknown): void => {
    state.receipts.set(receiptKey, {
      command: {
        actorId: current.id,
        key,
        requestHash: signature,
        executionNonce: nextId(state),
        resultCode,
        resourceId: null,
        resultVersion: null,
      },
      data,
    });
  };
  const running = (async () => {
    try {
      const data = await work();
      record('ok', options.receiptData === undefined ? data : await options.receiptData(data));
      return answer(state, data);
    } catch (error) {
      if (
        error instanceof MemorySocialError &&
        ['conflict', 'request-pending', 'request-expired', 'unavailable', 'limit-reached'].includes(
          error.code,
        )
      )
        record(error.code, null);
      throw error;
    }
  })();
  const completion = running.then(
    () => undefined,
    () => undefined,
  );
  state.pendingCommands.set(receiptKey, completion);
  try {
    return await running;
  } finally {
    if (state.pendingCommands.get(receiptKey) === completion)
      state.pendingCommands.delete(receiptKey);
  }
}
