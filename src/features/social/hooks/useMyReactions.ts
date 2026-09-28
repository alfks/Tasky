import { useCallback, useEffect, useRef, useState } from 'react';

import type { OwnReactionView } from '@/domain/social/social';

import { getSocialRepository } from '@/repositories/container';

import { relationErrorMessage } from '@/features/social/hooks/relation-error-message';
import { captureSocialDispatch, onSocialInvalidation } from '@/features/social/session-lifecycle';
import { useSocialStore } from '@/features/social/store/social-store';

function retryDelay(error: unknown): number {
  if (typeof error !== 'object' || error === null || !('code' in error)) return 0;
  if (error.code !== 'rate-limited') return 0;
  const retryAfter = 'retryAfter' in error ? error.retryAfter : null;
  const seconds =
    typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter
      : 60;
  return Math.min(Math.ceil(seconds * 1000), 2_147_483_647);
}

/** 본인 응원 식별자와 응원 시각만 현재 페이지에 보관한다. 본문은 읽지 않는다. */
export function useMyReactions(enabled: boolean) {
  const [items, setItems] = useState<readonly OwnReactionView[]>([]);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<readonly (string | null)[]>([null]);
  const [busy, setBusy] = useState(false);
  const [cursorExpired, setCursorExpired] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [clock, setClock] = useState(0);
  const generation = useRef(0);
  const busyRef = useRef(false);
  const cooldownRef = useRef(0);
  const keyFor = useSocialStore((state) => state.keyFor);
  const forgetKey = useSocialStore((state) => state.forgetKey);

  useEffect(
    () =>
      onSocialInvalidation(() => {
        generation.current += 1;
        busyRef.current = false;
        setItems([]);
        setPhase('idle');
        setError(null);
        setNextCursor(null);
        setCursorStack([null]);
        setBusy(false);
        setCursorExpired(false);
        cooldownRef.current = 0;
        setCooldownUntil(0);
      }),
    [],
  );

  useEffect(() => {
    if (cooldownUntil === 0) return;
    const tick = () => {
      const now = Date.now();
      setClock(now);
      if (now >= cooldownUntil) {
        cooldownRef.current = 0;
        setCooldownUntil(0);
      }
    };
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  const postpone = useCallback((cause: unknown) => {
    const delay = retryDelay(cause);
    if (delay === 0) return;
    const until = Date.now() + delay;
    cooldownRef.current = Math.max(cooldownRef.current, until);
    setCooldownUntil(cooldownRef.current);
    setClock(Date.now());
  }, []);

  const load = useCallback(
    async (
      cursor: string | null = null,
      stack: readonly (string | null)[] = [null],
    ): Promise<boolean> => {
      if (!enabled || Date.now() < cooldownRef.current) return false;
      const current = ++generation.current;
      const allowed = captureSocialDispatch();
      setItems([]);
      setPhase('loading');
      setError(null);
      setCursorExpired(false);
      try {
        const page = await getSocialRepository().myReactions(
          cursor === null ? undefined : { cursor },
        );
        if (!allowed() || generation.current !== current) return false;
        setItems([...new Map(page.data.items.map((item) => [item.postId, item])).values()]);
        setNextCursor(page.data.nextCursor);
        setCursorStack(stack);
        setPhase('ready');
        return true;
      } catch (cause) {
        if (!allowed() || generation.current !== current) return false;
        const code =
          typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : null;
        setCursorExpired(code === 'validation' && cursor !== null);
        postpone(cause);
        setError(
          code === 'validation' && cursor !== null
            ? '기록 위치가 만료됐어요. 처음부터 다시 확인해 주세요.'
            : relationErrorMessage(cause),
        );
        setPhase('error');
        return false;
      }
    },
    [enabled, postpone],
  );

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  const cancel = async (postId: string): Promise<boolean> => {
    if (!enabled || busyRef.current || Date.now() < cooldownRef.current) return false;
    const current = generation.current;
    const allowed = captureSocialDispatch();
    if (!allowed()) return false;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const operation = `reaction:${postId}:false`;
    const key = keyFor(operation);
    try {
      await getSocialRepository().setReaction({ postId, active: false }, { key });
      if (!allowed() || generation.current !== current) return false;
      forgetKey(operation);
      return (await load(cursorStack.at(-1) ?? null, cursorStack)) && allowed();
    } catch (cause) {
      if (allowed() && generation.current === current) {
        postpone(cause);
        setError(
          retryDelay(cause) > 0
            ? relationErrorMessage(cause)
            : `응원 취소 완료 여부를 확인하고 있어요. ${relationErrorMessage(cause)}`,
        );
      }
      return false;
    } finally {
      if (allowed()) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };

  return {
    items,
    phase,
    error,
    busy,
    cursorExpired,
    cooldownSeconds: Math.max(0, Math.ceil((cooldownUntil - clock) / 1000)),
    pageIndex: cursorStack.length - 1,
    nextCursor,
    refresh: load,
    retry: () => (cursorExpired ? load() : load(cursorStack.at(-1) ?? null, cursorStack)),
    next: () =>
      nextCursor === null ? Promise.resolve(false) : load(nextCursor, [...cursorStack, nextCursor]),
    previous: () =>
      cursorStack.length <= 1
        ? Promise.resolve(false)
        : load(cursorStack.at(-2) ?? null, cursorStack.slice(0, -1)),
    cancel,
  };
}
