/** 단일 라우트(`/`)의 화면 — 조립은 전부 `@/features/shell` 의 `AppShell` 이 한다(ADR-0001). */
import { AppShell } from '@/features/shell';

export function Page() {
  return <AppShell />;
}
