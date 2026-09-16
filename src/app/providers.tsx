'use client';

// 조립 지점(ADR-0006 규칙 6). 이 파일만 infra 를 import 할 수 있고, 이 파일을 import 할 수 있는 파일은
// layout.tsx 하나다. 재export 는 금지 — 레포지토리 주입 외의 일을 하면 경계가 새어나간다.
import type { ReactNode } from 'react';

import { setRepositories } from '@/repositories/container';

import { createIndexedDbRepositories } from '@/infra/indexeddb/repositories';

// 모듈 로드 시 한 번만 주입한다. 렌더 이전에 끝나야 첫 렌더에서 `getRepositories()` 를 부르는 스토어가
// "주입되지 않았습니다" 로 떨어지지 않는다.
//
// 프리렌더(서버)에서도 이 줄이 돈다. 안전한 이유는 **조립이 I/O 를 하지 않기** 때문이다: Dexie 인스턴스는
// 생성자에서 `indexedDB` 를 건드리지 않고 첫 조회·쓰기에서야 DB 를 연다. 서버에서는 그 첫 호출이 없다
// (스토어는 클라이언트에서만 돈다). 서버에서 조회를 부르는 코드가 생기면 그때 `MissingAPIError` 로 드러난다.
setRepositories(createIndexedDbRepositories());

type ProvidersProps = {
  /** 앱 트리 전체. */
  children: ReactNode;
};

/** 앱 시작 시 레포지토리 구현을 주입한다(위 모듈 스코프에서 한 번). */
export function Providers({ children }: ProvidersProps) {
  return <>{children}</>;
}
