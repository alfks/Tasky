'use client';

import { useEffect, useState } from 'react';

import { overlayLayerCount } from '@/components/ui/overlay-stack';

/** 오버레이 스택에는 구독 API 가 없다 — 미루는 동안에만 이 간격으로 다시 본다. */
const POLL_MS = 400;

/**
 * 업데이트 알림을 **지금 띄우면 안 되는가** (pwa.md R4 "사용자 입력 중에는 토스트를 미룬다").
 *
 * 편집 패널·대화상자가 열려 있는 동안 `true` 이고, 닫히면 `false` 로 내려가 **다시 올라가지 않는다**
 * (한 번 띄운 알림이 대화상자가 열릴 때마다 깜빡이지 않도록). `active` 가 꺼지면 다음 알림을 위해
 * 다시 잠근다.
 *
 * `useEffect` 로 상태를 맞추는 이유: 오버레이 스택은 React 밖의 가변 값이고 구독 수단이 없다
 * (`useSyncExternalStore` 를 붙일 `subscribe` 가 없다). 폴링은 미루는 동안에만 돈다.
 */
export function useOverlayDeferral(active: boolean): boolean {
  const [isDeferred, setIsDeferred] = useState(true);

  useEffect(() => {
    if (!active) {
      setIsDeferred(true);
      return undefined;
    }
    if (!isDeferred || overlayLayerCount() === 0) {
      setIsDeferred(false);
      return undefined;
    }
    const timer = window.setInterval(() => {
      if (overlayLayerCount() === 0) setIsDeferred(false);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, isDeferred]);

  return isDeferred;
}
