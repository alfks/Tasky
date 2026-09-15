'use client';

// 조립 지점(ADR-0006 규칙 6). 이 파일만 infra 를 import 할 수 있고, 이 파일을 import 할 수 있는 파일은
// layout.tsx 하나다. 재export 는 금지 — 레포지토리 주입 외의 일을 하면 경계가 새어나간다.
import type { ReactNode } from 'react';

type ProvidersProps = {
  /** 앱 트리 전체. */
  children: ReactNode;
};

/** 앱 시작 시 레포지토리 구현을 주입한다(구현체는 후속 티켓에서 여기에 연결한다). */
export function Providers({ children }: ProvidersProps) {
  return <>{children}</>;
}
