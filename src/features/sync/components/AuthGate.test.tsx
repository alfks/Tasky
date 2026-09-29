import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getRepositories, setSyncTransport } from '@/repositories/container';
import { createMemorySyncServer } from '@/repositories/memory/sync-server';
import { createMemorySyncTransport } from '@/repositories/memory/sync-transport';

import { AuthGate } from '@/features/sync/components/AuthGate';
import { resetSyncStoreForTest } from '@/features/sync/store/sync-store';

describe('AuthGate (sync.md R1)', () => {
  beforeEach(async () => {
    resetSyncStoreForTest();
    await getRepositories().sync.wipeLocal();
  });

  // `bootstrap` 이 `void` 로 시작한 지연 청크 `import()`(auth-actions·엔진)가 테스트 종료 뒤에 도착하면
  // 모듈 러너가 이미 닫혀 "Vite module runner has been closed" 로 거부된다(실측 — auth-actions 가
  // `@/features/profile` 배럴을 더 끌게 되며 드러난 경합). 같은 모듈을 여기서 한 번 더 기다려 그 적재가
  // 끝난 뒤에 파일을 닫는다.
  afterEach(async () => {
    await import('@/features/sync/store/auth-actions');
    await new Promise((resolve) => setTimeout(resolve, 0)); // auth-actions 뒤에 시작되는 엔진 적재까지
    await import('@/features/sync/store/sync-engine');
  });

  it('표식이 없으면 LoginScreen 만 보인다 — children 은 렌더되지 않는다', async () => {
    render(
      <AuthGate>
        <div>앱 본체</div>
      </AuthGate>,
    );
    expect(await screen.findByText('Tasky')).toBeInTheDocument();
    expect(screen.queryByText('앱 본체')).not.toBeInTheDocument();
  });

  it('표식이 있으면 children 이 즉시 보인다(R6)', async () => {
    // 엔진이 곧바로 시작돼 `verifySession` 이 돌아도 게이트가 로그인으로 뒤집히지 않게, 표식과 같은
    // 세션을 가진 트랜스포트를 둔다(이 테스트가 재는 것은 "표식 → 즉시 children" 뿐이다).
    setSyncTransport(
      createMemorySyncTransport(createMemorySyncServer(), {
        sub: 'sub-1',
        email: 'a@example.com',
        expiresAt: '2099-01-01T00:00:00.000Z',
      }),
    );
    await getRepositories().sync.setState({
      deviceId: 'device-1',
      userSub: 'sub-1',
      userEmail: 'a@example.com',
      cursor: 0,
    });
    render(
      <AuthGate>
        <div>앱 본체</div>
      </AuthGate>,
    );
    expect(await screen.findByText('앱 본체')).toBeInTheDocument();
    expect(screen.queryByText('Tasky')).not.toBeInTheDocument();
  });
});
