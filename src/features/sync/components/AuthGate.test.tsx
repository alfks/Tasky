import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { getRepositories } from '@/repositories/container';

import { AuthGate } from '@/features/sync/components/AuthGate';
import { resetSyncStoreForTest } from '@/features/sync/store/sync-store';

describe('AuthGate (sync.md R1)', () => {
  beforeEach(async () => {
    resetSyncStoreForTest();
    await getRepositories().sync.wipeLocal();
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
