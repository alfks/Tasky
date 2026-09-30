import { useEffect, useId, useRef, useState } from 'react';

import type { SocialErrorCode, SocialResponse } from '@/domain/social/social';

import { getSocialRepository } from '@/repositories/container';
import type { CommandKey, SocialRepository } from '@/repositories/social-repository';

import {
  commandIntentStore,
  type CommandIntent,
} from '@/features/social/hooks/social-command-intents';
import { socialErrorCode } from '@/features/social/lib/feed-validation';
import {
  captureSocialDispatch,
  invalidateSocialSession,
} from '@/features/social/session-lifecycle';

export function socialFailureMessage(code: SocialErrorCode | null): string {
  if (code === 'request-pending') return '확인되지 않은 요청을 먼저 확인해 주세요.';
  if (code === 'conflict')
    return '다른 곳에서 상태가 바뀌었어요. 새 상태를 확인한 뒤 다시 결정해 주세요.';
  if (code === 'unavailable')
    return '더 이상 이용할 수 없는 항목이에요. 목록을 다시 확인해 주세요.';
  if (code === 'limit-reached')
    return '이용 가능한 수에 도달했어요. 친구나 공유를 정리한 뒤 다시 시도해 주세요.';
  if (code === 'rate-limited') return '잠시 후 다시 시도해 주세요.';
  if (code === 'validation') return '이름은 20자, 공유 문장은 280자 이내로 입력해 주세요.';
  if (code === 'social-disabled')
    return '지금은 공유 기능을 사용할 수 없어요. 내 공유 기록은 확인하고 삭제할 수 있어요.';
  if (code === 'request-expired' || code === 'idempotency-conflict')
    return '같은 요청을 더 이상 확인할 수 없어요. 내 공유나 현재 목록에서 완료 여부를 직접 확인해 주세요.';
  return '요청 결과를 확인하지 못했어요. 다시 시도하면 같은 요청을 확인해요.';
}

type Failure = (code: SocialErrorCode, uncertain: boolean) => void | Promise<void>;
export function useSocialCommand(namespace?: string) {
  const id = useId();
  const owner = namespace ?? id;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SocialErrorCode | null>(null);
  const [, redraw] = useState(0);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    const stop = commandIntentStore.subscribe(() => {
      setBusy(commandIntentStore.get(owner)?.inFlight ?? false);
      redraw((value) => value + 1);
    });
    return () => {
      alive.current = false;
      stop();
    };
  }, [owner]);

  async function run<T>(
    operation: string,
    signature: string,
    command: (repository: SocialRepository, options: CommandKey) => Promise<SocialResponse<T>>,
    onFailure?: Failure,
  ): Promise<T | null> {
    if (!navigator.onLine || document.hidden) return null;
    const allowed = captureSocialDispatch();
    if (!allowed()) return null;
    const existing = commandIntentStore.get(owner);
    if (existing && (existing.operation !== operation || existing.signature !== signature)) {
      setError('request-pending');
      await onFailure?.('request-pending', true);
      return null;
    }
    if (existing?.blocked) return null;
    if (!commandIntentStore.reserve(owner)) {
      if (!existing) setError('request-pending');
      return null;
    }
    const epoch = commandIntentStore.epoch();
    const current = () => allowed() && commandIntentStore.epoch() === epoch;
    let intent: CommandIntent | undefined = existing;
    setBusy(true);
    setError(null);
    try {
      const repository = getSocialRepository();
      const me = await repository.me();
      if (!current()) return null;
      const actor = me.data.profile?.id ?? null;
      const witness = commandIntentStore.verifyActor(actor);
      if (witness === 'changed') {
        invalidateSocialSession('account');
        return null;
      }
      if (witness === 'unverified') return null;
      if (
        existing &&
        (existing.account !== commandIntentStore.account() ||
          (existing.actor !== null && existing.actor !== actor))
      ) {
        invalidateSocialSession('account');
        return null;
      }
      if (operation === 'profile' && existing && me.data.profile !== null) {
        commandIntentStore.remove(owner, existing);
        return alive.current ? (me.data.profile as T) : null;
      }
      if (actor === null && operation !== 'profile') return null;
      intent = existing ?? {
        operation,
        signature,
        actor,
        account: commandIntentStore.account(),
        key: `v1.${Date.now()}.${crypto.randomUUID().replaceAll('-', '')}`,
        command,
        uncertain: false,
        blocked: false,
        inFlight: false,
        error: null,
      };
      intent.inFlight = true;
      intent.error = null;
      commandIntentStore.set(owner, intent);
      const response = await intent.command(repository, { key: intent.key });
      if (!current() || commandIntentStore.get(owner) !== intent) return null;
      commandIntentStore.remove(owner, intent);
      return alive.current ? (response.data as T) : null;
    } catch (thrown) {
      if (!current()) return null;
      const code = socialErrorCode(thrown);
      const uncertain =
        intent !== undefined &&
        ((intent.uncertain && code !== 'conflict' && code !== 'limit-reached') ||
          [
            'temporary',
            'request-pending',
            'request-expired',
            'idempotency-conflict',
            'unauthorized',
          ].includes(code));
      if (intent) {
        intent.inFlight = false;
        intent.uncertain = uncertain;
        intent.error = code;
        intent.blocked = code === 'request-expired' || code === 'idempotency-conflict';
        if (!uncertain) commandIntentStore.remove(owner, intent);
        else commandIntentStore.publish();
      }
      if (code === 'unauthorized' || code === 'account-deleted') {
        invalidateSocialSession(code === 'unauthorized' ? 'auth' : 'account');
      }
      if (alive.current) {
        setError(code);
        await onFailure?.(code, uncertain);
      }
      return null;
    } finally {
      // 늦은 promise가 새 관측의 잠금을 풀지 않도록 세대를 확인한다.
      if (commandIntentStore.epoch() === epoch) {
        commandIntentStore.release(owner);
        if (intent) intent.inFlight = false;
        commandIntentStore.publish();
        if (alive.current) setBusy(false);
      }
    }
  }
  const pending = commandIntentStore.get(owner);
  const retry = async <T = unknown>(onFailure?: Failure): Promise<T | null> => {
    const original = commandIntentStore.get(owner);
    if (!original) return null;
    return run(
      original.operation,
      original.signature,
      original.command,
      onFailure,
    ) as Promise<T | null>;
  };
  return {
    busy,
    error: pending?.error ?? error,
    run,
    retry,
    uncertain: pending?.uncertain ?? false,
    retryAllowed:
      pending?.blocked !== true &&
      captureSocialDispatch()() &&
      navigator.onLine &&
      !document.hidden,
    hasIntent: () => commandIntentStore.get(owner) !== undefined,
    pending: pending ? { operation: pending.operation, signature: pending.signature } : null,
    clearError: () => setError(null),
    abandon: () => {
      commandIntentStore.remove(owner);
      setError(null);
    },
  };
}
