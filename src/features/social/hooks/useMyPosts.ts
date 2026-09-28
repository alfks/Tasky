import { useCallback, useEffect, useRef, useState } from 'react';

import { parsePostInput } from '@/domain/social/input';
import type { PostInput, PostView, SocialMode } from '@/domain/social/social';

import { getSocialRepository } from '@/repositories/container';

import { captureSocialDispatch, onSocialInvalidation } from '@/features/social/session-lifecycle';
import { useSocialStore } from '@/features/social/store/social-store';

/** 내 공유는 현재 페이지 한 장만 보관하고 이전 페이지도 서버에서 다시 읽는다. */
export function useMyPosts(enabled: boolean) {
  const [items, setItems] = useState<readonly PostView[]>([]);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<readonly (string | null)[]>([null]);
  const [busy, setBusy] = useState(false);
  const [hasFriends, setHasFriends] = useState<boolean | null>(null);
  const [mode, setMode] = useState<SocialMode | null>(null);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const keyFor = useSocialStore((state) => state.keyFor);
  const forgetKey = useSocialStore((state) => state.forgetKey);
  const refreshFeed = useSocialStore((state) => state.refreshCurrent);

  useEffect(
    () =>
      onSocialInvalidation(() => {
        generation.current += 1;
        busyRef.current = false;
        setItems([]);
        setPhase('idle');
        setMessage(null);
        setNextCursor(null);
        setCursorStack([null]);
        setBusy(false);
        setHasFriends(null);
        setMode(null);
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
      setMessage(null);
      try {
        const repo = getSocialRepository();
        const [identity, page, friends] = await Promise.all([
          repo.me(),
          repo.myPosts(cursor === null ? undefined : { cursor }),
          repo.friends(),
        ]);
        if (!allowed() || generation.current !== current) return false;
        setItems([...new Map(page.data.items.map((item) => [item.id, item])).values()]);
        setHasFriends(friends.data.items.length > 0);
        setMode(identity.data.mode);
        setNextCursor(page.data.nextCursor);
        setCursorStack(stack);
        setPhase('ready');
        return true;
      } catch {
        if (!allowed() || generation.current !== current) return false;
        setPhase('error');
        setMessage('불러오지 못했어요. 다시 시도해 주세요.');
        return false;
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  const create = async (input: PostInput): Promise<boolean> => {
    const parsed = parsePostInput(input);
    if (!parsed.ok) {
      setMessage('공개 문장은 1~280자, 날짜는 유효한 날짜로 입력해 주세요.');
      return false;
    }
    if (busyRef.current) return false;
    const current = generation.current;
    const allowed = captureSocialDispatch();
    if (!allowed()) return false;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    const operation = `post:create:${JSON.stringify(parsed.value)}`;
    const key = keyFor(operation);
    try {
      await getSocialRepository().createPost(parsed.value, { key });
      if (!allowed() || generation.current !== current) return false;
      forgetKey(operation);
      if (!(await load()) || !allowed()) return false;
      const refreshedGeneration = generation.current;
      await refreshFeed();
      if (!allowed() || generation.current !== refreshedGeneration) return false;
      setMessage('친구에게 공유했어요.');
      return true;
    } catch {
      if (allowed() && generation.current === current)
        setMessage('완료 여부를 확인하고 있어요. 같은 내용으로 다시 시도해 주세요.');
      return false;
    } finally {
      if (allowed()) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };

  const remove = async (id: string): Promise<boolean> => {
    if (busyRef.current) return false;
    const current = generation.current;
    const allowed = captureSocialDispatch();
    if (!allowed()) return false;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    const operation = `post:delete:${id}`;
    const key = keyFor(operation);
    try {
      await getSocialRepository().deletePost({ id }, { key });
      if (!allowed() || generation.current !== current) return false;
      forgetKey(operation);
      if (!(await load(cursorStack.at(-1) ?? null, cursorStack)) || !allowed()) return false;
      const refreshedGeneration = generation.current;
      await refreshFeed();
      if (!allowed() || generation.current !== refreshedGeneration) return false;
      setMessage('공유를 삭제했어요.');
      return true;
    } catch {
      if (allowed() && generation.current === current)
        setMessage('완료 여부를 확인하고 있어요. 같은 요청으로 다시 시도해 주세요.');
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
    message,
    busy,
    hasFriends,
    mode,
    pageIndex: cursorStack.length - 1,
    nextCursor,
    refresh: load,
    next: () =>
      nextCursor === null ? Promise.resolve(false) : load(nextCursor, [...cursorStack, nextCursor]),
    previous: () =>
      cursorStack.length <= 1
        ? Promise.resolve(false)
        : load(cursorStack.at(-2) ?? null, cursorStack.slice(0, -1)),
    create,
    remove,
  };
}
