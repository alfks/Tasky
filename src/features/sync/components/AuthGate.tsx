'use client';

// 로그인 필수 게이트 (sync.md R1). 표식이 없으면 `LoginScreen` 외 아무것도 그리지 않는다 —
// `AppShell` 은 `children` 으로 받아서 **표식이 있을 때만** 렌더한다(그 컴포넌트 자신은 손대지
// 않는다). `Providers`(레포지토리 주입) 안쪽에서만 렌더되므로 `getRepositories()` 를 동기 계약
// 그대로 부를 수 있다(T94_LAZY_BOUNDARY.md §A-2).
import { useEffect } from 'react';
import type { ReactNode } from 'react';

import { LoginScreen } from '@/features/sync/components/LoginScreen';
import { useSyncStore } from '@/features/sync/store/sync-store';

import { Skeleton } from '@/components/ui/Skeleton';

type AuthGateProps = {
  children: ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  const phase = useSyncStore((state) => state.phase);
  const bootstrap = useSyncStore((state) => state.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (phase === 'checking') {
    // Providers 의 주입 스켈레톤과 같은 모양 — 표식 조회(IDB get 1회)뿐이라 거의 즉시 지나간다.
    return (
      <div aria-busy="true" className="p-[var(--space-4)]">
        <Skeleton className="h-[var(--space-6)] w-[8rem]" />
      </div>
    );
  }

  if (phase === 'login') {
    return <LoginScreen />;
  }

  // phase === 'ready' — 표식이 있으면 오프라인이라도 즉시 통과한다(R6).
  return <>{children}</>;
}
