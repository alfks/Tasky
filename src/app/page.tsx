/** 단일 라우트(`/`)의 화면 — 조립은 전부 `@/features/shell` 의 `AppShell` 이 한다(ADR-0001).
 * `AuthGate` 가 로그인 필수(sync.md R1)를 강제한다 — 표식이 없으면 `AppShell` 은 렌더되지 않는다. */
import { AppShell } from '@/features/shell';
import { AuthGate } from '@/features/sync';

export function Page() {
  return (
    <AuthGate>
      <AppShell />
    </AuthGate>
  );
}
