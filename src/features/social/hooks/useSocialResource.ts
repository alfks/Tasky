import { useEffect, useRef, useState } from 'react';

import type { Page, SocialErrorCode, SocialResponse } from '@/domain/social/social';

import { getSocialRepository } from '@/repositories/container';
import type { SocialRepository } from '@/repositories/social-repository';

import { socialErrorCode } from '@/features/social/lib/feed-validation';
import {
  captureSocialDispatch,
  invalidateSocialSession,
  onSocialInvalidation,
  onSocialReady,
} from '@/features/social/session-lifecycle';

type Loader<T> = (
  repository: SocialRepository,
  cursor?: string,
) => Promise<SocialResponse<Page<T>>>;

export function useSocialResource<T>(load: Loader<T>) {
  const [items, setItems] = useState<readonly T[]>([]);
  const [error, setError] = useState<SocialErrorCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [stack, setStack] = useState<readonly (string | null)[]>([null]);
  const sequence = useRef(0);
  const loader = useRef(load);
  loader.current = load;
  const refresh = async (
    cursor: string | null = null,
    pages: readonly (string | null)[] = [null],
  ): Promise<void> => {
    const captured = ++sequence.current;
    const allowed = captureSocialDispatch();
    setItems([]);
    setNextCursor(null);
    setError(null);
    setBusy(true);
    if (!allowed() || !navigator.onLine || document.hidden) {
      setBusy(false);
      return;
    }
    try {
      const result = await loader.current(getSocialRepository(), cursor ?? undefined);
      if (captured !== sequence.current || !allowed()) return;
      setItems(result.data.items);
      setNextCursor(result.data.nextCursor);
      setStack(pages);
    } catch (thrown) {
      if (captured !== sequence.current || !allowed()) return;
      const code = socialErrorCode(thrown);
      if (code === 'unauthorized' || code === 'account-deleted')
        invalidateSocialSession(code === 'unauthorized' ? 'auth' : 'account');
      else setError(code);
    } finally {
      if (captured === sequence.current) setBusy(false);
    }
  };
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    void refreshRef.current();
    const stop = onSocialInvalidation(() => {
      sequence.current += 1;
      setItems([]);
      setBusy(false);
    });
    const stopReady = onSocialReady(() => void refreshRef.current());
    const resume = () => {
      if (navigator.onLine && !document.hidden) void refreshRef.current();
    };
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      sequence.current += 1;
      stop();
      stopReady();
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);
  return {
    items: navigator.onLine && !document.hidden && captureSocialDispatch()() ? items : [],
    error,
    busy,
    nextCursor,
    pageIndex: stack.length - 1,
    refresh: () => refresh(),
    next: () =>
      nextCursor === null ? Promise.resolve() : refresh(nextCursor, [...stack, nextCursor]),
    previous: () =>
      stack.length < 2 ? Promise.resolve() : refresh(stack[stack.length - 2], stack.slice(0, -1)),
  };
}
