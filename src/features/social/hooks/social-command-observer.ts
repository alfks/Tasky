import { getSocialRepository } from '@/repositories/container';

import {
  commandIntentStore,
  type CommandIntent,
} from '@/features/social/hooks/social-command-intents';
import { socialErrorCode } from '@/features/social/lib/feed-validation';
import {
  captureSocialDispatch,
  invalidateSocialSession,
} from '@/features/social/session-lifecycle';

/** 네트워크 취소가 아닌 관측 기한이다. 늦은 응답은 다음 작업을 시작하거나 완료하지 못한다. */
export function createSocialCommandObserver() {
  let active = true;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout>;
  const expired = { code: 'temporary' as const };
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      active = false;
      timedOut = true;
      reject(expired);
    }, 15_000);
  });
  void deadline.catch(() => undefined);
  return {
    active: () => active,
    timedOut: () => timedOut,
    async observe<T>(request: Promise<T>): Promise<T> {
      const value = await Promise.race([request, deadline]);
      if (!active) throw expired;
      return value;
    },
    finish() {
      active = false;
      clearTimeout(timer);
    },
  };
}

export type PendingOwnerProof = {
  actorId: string | null;
  accountGeneration: number;
  isCurrent: () => boolean;
};
export function pendingOwnerMatches(
  proof: PendingOwnerProof | null,
  intent: CommandIntent | undefined,
) {
  return (
    proof !== null &&
    proof.isCurrent() &&
    intent !== undefined &&
    intent.account === proof.accountGeneration &&
    (intent.actor === proof.actorId || (intent.actor === null && intent.operation === 'profile'))
  );
}
/** 내용 표시를 위한 읽기 증명이며 재시도·예약·mutation은 하지 않는다. */
export async function verifyPendingOwner(): Promise<PendingOwnerProof | null> {
  const allowed = captureSocialDispatch();
  const epoch = commandIntentStore.epoch();
  if (!allowed() || !navigator.onLine || document.hidden) return null;
  const observer = createSocialCommandObserver();
  try {
    const response = await observer.observe(getSocialRepository().me());
    if (!allowed() || commandIntentStore.epoch() !== epoch) return null;
    const actor = response.data.profile?.id ?? null;
    const witness = commandIntentStore.verifyActor(actor);
    if (witness === 'changed') {
      invalidateSocialSession('account');
      return null;
    }
    if (witness !== 'match') return null;
    return {
      actorId: actor,
      accountGeneration: commandIntentStore.account(),
      isCurrent: () =>
        allowed() && commandIntentStore.epoch() === epoch && navigator.onLine && !document.hidden,
    };
  } catch (error) {
    if (allowed() && commandIntentStore.epoch() === epoch) {
      const code = socialErrorCode(error);
      if (code === 'unauthorized' || code === 'account-deleted')
        invalidateSocialSession(code === 'unauthorized' ? 'auth' : 'account');
    }
    return null;
  } finally {
    observer.finish();
  }
}
