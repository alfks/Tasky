// 조립 지점(ADR-0006 규칙 6). 이 파일만 infra 를 import 할 수 있고, 이 파일을 import 할 수 있는 파일은
// main.tsx 하나다. 재export 는 금지 — 레포지토리 주입 외의 일을 하면 경계가 새어나간다.
import { useEffect, useState, type ReactNode } from 'react';

import { setRepositories } from '@/repositories/container';

import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Dexie 지연 로드(ADR-0013). **정적** import 였을 때 Dexie(gzip 32.6 kB)가 첫 로드 청크에 들어가 첫 페인트를
 * 막았다. 동적 import 로 바꾸면 rolldown 이 infra + dexie 를 별도 청크로 떼고, 그 청크는 진입 청크 평가와
 * **동시에** 받아지므로 첫 페인트는 기다리지 않는다.
 *
 * 모듈 스코프에서 한 번만 시작한다(컴포넌트가 여러 번 마운트돼도 요청은 1회). 조립이 I/O 를 하지 않는 성질은
 * 그대로다 — Dexie 인스턴스는 생성자에서 `indexedDB` 를 건드리지 않고 첫 조회·쓰기에서야 DB 를 연다.
 */
const injection: Promise<void> = import('@/infra/indexeddb/repositories').then(
  ({ createIndexedDbRepositories }) => {
    setRepositories(createIndexedDbRepositories());
  },
);

type ProvidersProps = {
  /** 앱 트리 전체. */
  children: ReactNode;
};

/**
 * 레포지토리 주입이 끝난 뒤에만 children 을 렌더한다.
 *
 * 왜 막는가: `getRepositories()` 에는 기본값이 없다(조립 누락을 조기에 드러내려고). 주입 전에 children 이
 * 돌면 스토어가 그 자리에서 throw 한다 — 즉 **호출처 계약은 지연 로드 전과 똑같이 동기로 유지되고**,
 * 비동기가 된 구간은 이 한 곳으로 갇힌다. 그동안 보이는 것은 `Skeleton` 이다(T-27 B).
 *
 * 청크 로드가 실패하면(오프라인 + 프리캐시 미스 등) 스켈레톤이 남고 콘솔에 오류가 남는다 — 앱 셸 수준의
 * 오류 UI 는 pwa.md R4 토스트 티켓에서 붙인다.
 */
export function Providers({ children }: ProvidersProps) {
  const [injected, setInjected] = useState(false);

  useEffect(() => {
    let alive = true;
    injection.then(
      () => {
        if (alive) setInjected(true);
      },
      (error: unknown) => {
        console.error('레포지토리 구현을 불러오지 못했습니다.', error);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  if (!injected) {
    return (
      <div aria-busy="true" className="p-[var(--space-4)]">
        <Skeleton className="h-[var(--space-6)] w-[8rem]" />
      </div>
    );
  }

  return <>{children}</>;
}
