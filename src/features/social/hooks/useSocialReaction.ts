import { useRef, useState } from 'react';

import { getSocialRepository } from '@/repositories/container';

import { captureSocialDispatch } from '@/features/social/session-lifecycle';
import { useSocialStore } from '@/features/social/store/social-store';

/** 서버 확정 뒤에만 응원 수를 다시 조회한다. 같은 본문 재시도는 같은 key다. */
export function useSocialReaction() {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const keyFor = useSocialStore((state) => state.keyFor);
  const forgetKey = useSocialStore((state) => state.forgetKey);
  const refreshCurrent = useSocialStore((state) => state.refreshCurrent);

  const setReaction = async (postId: string, active: boolean): Promise<boolean> => {
    if (running.current) return false;
    const allowed = captureSocialDispatch();
    if (!allowed()) return false;
    running.current = true;
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button[data-social-reaction-id]'),
    );
    const focusedIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    setBusyId(postId);
    setError(null);
    const operation = `reaction:${postId}:${active}`;
    const key = keyFor(operation);
    try {
      await getSocialRepository().setReaction({ postId, active }, { key });
      if (!allowed()) return false;
      forgetKey(operation);
      await refreshCurrent();
      if (focusedIndex >= 0 && allowed()) {
        requestAnimationFrame(() => {
          const snapshot = useSocialStore.getState();
          const heading = document.getElementById('social-feed-title');
          if (
            !allowed() ||
            snapshot.phase !== 'ready' ||
            !snapshot.canShow ||
            !heading?.isConnected ||
            heading.closest('[hidden]')
          )
            return;
          const visible = Array.from(
            document.querySelectorAll<HTMLButtonElement>('button[data-social-reaction-id]'),
          );
          const same = visible.find((button) => button.dataset.socialReactionId === postId);
          (same ?? visible[Math.min(focusedIndex, visible.length - 1)] ?? heading)?.focus({
            preventScroll: true,
          });
        });
      }
      return true;
    } catch {
      if (allowed())
        setError('응원 완료 여부를 확인하고 있어요. 같은 요청으로 다시 시도해 주세요.');
      return false;
    } finally {
      running.current = false;
      if (allowed()) setBusyId(null);
    }
  };

  return { busyId, error, setReaction };
}
