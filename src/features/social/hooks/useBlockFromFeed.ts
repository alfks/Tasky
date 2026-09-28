import { useEffect, useRef, useState } from 'react';

import { getSocialRepository } from '@/repositories/container';

import { captureSocialDispatch, onSocialInvalidation } from '@/features/social/session-lifecycle';
import { useSocialStore } from '@/features/social/store/social-store';

/** 본문 카드에서 차단할 때 서버 확정 뒤 피드를 버리고 현재 권한으로 다시 읽는다. */
export function useBlockFromFeed() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const generation = useRef(0);
  const keyFor = useSocialStore((state) => state.keyFor);
  const forgetKey = useSocialStore((state) => state.forgetKey);
  const refreshCurrent = useSocialStore((state) => state.refreshCurrent);

  useEffect(() => {
    const unsubscribe = onSocialInvalidation(() => {
      generation.current += 1;
      running.current = false;
      setBusy(false);
      setError(null);
    });
    return () => {
      generation.current += 1;
      unsubscribe();
    };
  }, []);

  const block = async (peerId: string): Promise<boolean> => {
    if (running.current) return false;
    const current = generation.current;
    const allowed = captureSocialDispatch();
    if (!allowed()) return false;
    running.current = true;
    setBusy(true);
    setError(null);
    const operation = `block:${peerId}:true`;
    const key = keyFor(operation);
    try {
      await getSocialRepository().setBlock({ peerId, blocked: true }, { key });
      if (!allowed() || generation.current !== current) return false;
      forgetKey(operation);
      await refreshCurrent();
      if (!allowed() || generation.current !== current) return false;
      return true;
    } catch {
      if (allowed() && generation.current === current)
        setError('차단 완료 여부를 확인하고 있어요. 같은 요청으로 다시 시도해 주세요.');
      return false;
    } finally {
      if (allowed() && generation.current === current) {
        running.current = false;
        setBusy(false);
      }
    }
  };

  return { busy, error, block };
}
