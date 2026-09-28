import { useRef, useState } from 'react';

import { getSocialRepository } from '@/repositories/container';

import { captureSocialDispatch } from '@/features/social/session-lifecycle';
import { useSocialStore } from '@/features/social/store/social-store';

/** 본문 카드에서 차단할 때 서버 확정 뒤 피드를 버리고 현재 권한으로 다시 읽는다. */
export function useBlockFromFeed() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const keyFor = useSocialStore((state) => state.keyFor);
  const forgetKey = useSocialStore((state) => state.forgetKey);
  const refreshCurrent = useSocialStore((state) => state.refreshCurrent);

  const block = async (peerId: string): Promise<boolean> => {
    if (running.current) return false;
    const allowed = captureSocialDispatch();
    if (!allowed()) return false;
    running.current = true;
    setBusy(true);
    setError(null);
    const operation = `block:${peerId}:true`;
    const key = keyFor(operation);
    try {
      await getSocialRepository().setBlock({ peerId, blocked: true }, { key });
      if (!allowed()) return false;
      forgetKey(operation);
      await refreshCurrent();
      return true;
    } catch {
      if (allowed())
        setError('차단 완료 여부를 확인하고 있어요. 같은 요청으로 다시 시도해 주세요.');
      return false;
    } finally {
      running.current = false;
      if (allowed()) setBusy(false);
    }
  };

  return { busy, error, block };
}
