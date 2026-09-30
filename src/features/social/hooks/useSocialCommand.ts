import { useEffect, useRef, useState } from 'react';

import type { SocialErrorCode, SocialResponse } from '@/domain/social/social';

import { getSocialRepository } from '@/repositories/container';
import type { CommandKey, SocialRepository } from '@/repositories/social-repository';

import { socialErrorCode } from '@/features/social/lib/feed-validation';
import {
  captureSocialDispatch,
  invalidateSocialSession,
  onSocialInvalidation,
} from '@/features/social/session-lifecycle';

export function socialFailureMessage(code: SocialErrorCode | null): string {
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
  return '요청 결과를 확인하지 못했어요. 다시 시도하면 같은 요청을 확인해요.';
}

export function useSocialCommand() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SocialErrorCode | null>(null);
  const locked = useRef(false);
  const generation = useRef(0);
  const keys = useRef(new Map<string, { signature: string; key: string }>());
  useEffect(
    () =>
      onSocialInvalidation((reason) => {
        generation.current += 1;
        locked.current = false;
        setBusy(false);
        setError((previous) =>
          reason === 'offline' ||
          reason === 'hidden' ||
          reason === 'recheck' ||
          reason === 'activation'
            ? previous
            : null,
        );
        if (['auth', 'account', 'closed', 'revoked', 'cross-tab', 'provider'].includes(reason))
          keys.current.clear();
      }),
    [],
  );

  async function run<T>(
    operation: string,
    signature: string,
    command: (repository: SocialRepository, options: CommandKey) => Promise<SocialResponse<T>>,
    onFailure?: (code: SocialErrorCode) => void | Promise<void>,
  ): Promise<T | null> {
    if (locked.current || !navigator.onLine || document.hidden) return null;
    const allowed = captureSocialDispatch();
    if (!allowed()) return null;
    const existing = keys.current.get(operation);
    if (existing !== undefined && existing.signature !== signature) {
      setError('request-pending');
      await onFailure?.('request-pending');
      return null;
    }
    const key = existing?.key ?? `v1.${Date.now()}.${crypto.randomUUID().replaceAll('-', '')}`;
    keys.current.set(operation, { signature, key });
    const captured = generation.current;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await command(getSocialRepository(), { key });
      if (!allowed() || generation.current !== captured) return null;
      keys.current.delete(operation);
      return response.data;
    } catch (thrown) {
      if (!allowed() || generation.current !== captured) return null;
      const code = socialErrorCode(thrown);
      if (code !== 'temporary' && code !== 'request-pending') keys.current.delete(operation);
      if (code === 'unauthorized' || code === 'account-deleted')
        invalidateSocialSession(code === 'unauthorized' ? 'auth' : 'account');
      else setError(code);
      await onFailure?.(code);
      return null;
    } finally {
      if (generation.current === captured) {
        locked.current = false;
        setBusy(false);
      }
    }
  }
  return { busy, error, run, clearError: () => setError(null) };
}
