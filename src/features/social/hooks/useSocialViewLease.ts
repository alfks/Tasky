import { useCallback, useEffect, useRef } from 'react';

import { captureSocialDispatch } from '@/features/social/session-lifecycle';

/** 세션이 같아도 탭을 떠나면 이전 화면의 비동기 후속 동작을 폐기한다. */
export function useSocialViewLease() {
  const mounted = useRef(false);
  const epoch = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.current += 1;
    };
  }, []);

  const invalidateView = useCallback(() => {
    epoch.current += 1;
  }, []);
  const captureView = useCallback(() => {
    const captured = epoch.current;
    const allowed = captureSocialDispatch();
    return () => mounted.current && epoch.current === captured && allowed();
  }, []);

  return { invalidateView, captureView };
}
