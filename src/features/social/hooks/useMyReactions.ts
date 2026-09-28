import { useCallback, useEffect, useRef, useState } from 'react';

import type { OwnReactionView } from '@/domain/social/social';

import { getSocialRepository } from '@/repositories/container';

import { socialFailureMessage } from '@/features/social/hooks/useSocialCommand';
import { socialErrorCode } from '@/features/social/lib/feed-validation';
import { captureSocialDispatch, onSocialInvalidation } from '@/features/social/session-lifecycle';
import { useSocialStore } from '@/features/social/store/social-store';

/** 본인 응원 식별자와 응원 시각만 현재 페이지에 보관한다. 본문은 읽지 않는다. */
export function useMyReactions(enabled: boolean) {
  const [items, setItems] = useState<readonly OwnReactionView[]>([]);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<readonly (string | null)[]>([null]);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const busyRef = useRef(false);
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
      }),
    [],
  );

  const load = useCallback(
    async (
      cursor: string | null = null,
      stack: readonly (string | null)[] = [null],
    ): Promise<boolean> => {
      if (!enabled) return false;
      const current = ++generation.current;
      const allowed = captureSocialDispatch();
      setItems([]);
      setPhase('loading');
      setError(null);
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
        setError(
          code === 'validation' && cursor !== null
            ? '기록 위치가 만료됐어요. 처음부터 다시 확인해 주세요.'
            : socialFailureMessage(socialErrorCode(cause)),
        );
        setPhase('error');
        return false;
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  const cancel = async (postId: string): Promise<boolean> => {
    if (busyRef.current) return false;
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
      await load(cursorStack.at(-1) ?? null, cursorStack);
      return true;
    } catch (cause) {
      if (allowed() && generation.current === current)
        setError(`응원 취소 완료 여부를 확인하고 있어요. ${socialFailureMessage(socialErrorCode(cause))}`);
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
    pageIndex: cursorStack.length - 1,
    nextCursor,
    refresh: () => load(),
    retry: () => load(cursorStack.at(-1) ?? null, cursorStack),
    next: () =>
      nextCursor === null ? Promise.resolve(false) : load(nextCursor, [...cursorStack, nextCursor]),
    previous: () =>
      cursorStack.length <= 1
        ? Promise.resolve(false)
        : load(cursorStack.at(-2) ?? null, cursorStack.slice(0, -1)),
    cancel,
  };
}
