import type { SocialErrorCode, SocialResponse } from '@/domain/social/social';

import type { CommandKey, SocialRepository } from '@/repositories/social-repository';

import { onSocialInvalidation, onSocialReady } from '@/features/social/session-lifecycle';

export type CommandIntent = {
  operation: string;
  signature: string;
  key: string;
  actor: string | null;
  account: number;
  command: (repository: SocialRepository, options: CommandKey) => Promise<SocialResponse<unknown>>;
  uncertain: boolean;
  blocked: boolean;
  inFlight: boolean;
  error: SocialErrorCode | null;
};

/** 선택적 소셜 청크의 탭 메모리. 원래 DTO 호출만 보존하며 결과·UI 콜백은 보관하지 않는다. */
const intents = new Map<string, CommandIntent>();
const reservations = new Set<string>();
const listeners = new Set<() => void>();
export type PendingCommandDescriptor = {
  namespace: string;
  operation: string;
  inFlight: boolean;
  uncertain: boolean;
  blocked: boolean;
};
let descriptors: readonly PendingCommandDescriptor[] = [];
let generation = 0;
let account = 0;
let verifiedActor: string | null = null;
export const commandIntentStore = {
  get: (namespace: string) => intents.get(namespace),
  epoch: () => generation,
  account: () => account,
  descriptors: () => descriptors,
  verifyActor(actor: string | null): 'match' | 'changed' | 'unverified' {
    if (verifiedActor !== null && actor === null) return 'unverified';
    if (verifiedActor !== null && actor !== verifiedActor) return 'changed';
    if (actor !== null) verifiedActor = actor;
    return 'match';
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  publish() {
    descriptors = [...intents].map(([namespace, intent]) => ({
      namespace,
      operation: intent.operation,
      inFlight: intent.inFlight,
      uncertain: intent.uncertain,
      blocked: intent.blocked,
    }));
    listeners.forEach((listener) => listener());
  },
  reserve(namespace: string) {
    if (reservations.has(namespace) || intents.get(namespace)?.inFlight) return false;
    if (!intents.has(namespace) && intents.size + reservations.size >= 64) return false;
    reservations.add(namespace);
    return true;
  },
  release(namespace: string) {
    reservations.delete(namespace);
  },
  set(namespace: string, intent: CommandIntent) {
    reservations.delete(namespace);
    intents.set(namespace, intent);
    this.publish();
  },
  remove(namespace: string, expected?: CommandIntent) {
    if (expected !== undefined && intents.get(namespace) !== expected) return;
    intents.delete(namespace);
    reservations.delete(namespace);
    this.publish();
  },
};

// 화면의 일시적 unmount는 미확정 의도를 버리지 않는다. 명시적 계정 종료만 전부 지운다.
onSocialInvalidation((reason) => {
  generation += 1;
  reservations.clear();
  if (reason === 'account') {
    account += 1;
    verifiedActor = null;
    intents.clear();
  } else {
    for (const intent of intents.values()) {
      if (intent.inFlight) intent.uncertain = true;
      intent.inFlight = false;
    }
  }
  commandIntentStore.publish();
});

onSocialReady(() => commandIntentStore.publish());
