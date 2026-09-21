// 계정 블록 상태 줄 — 리뷰 Major 4: "보류"(uploadPending)가 참인 동안은 아웃박스가 비어 있어도
// "● 동기화됨" 을 참칭하지 않는다.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AccountBlock } from '@/features/sync/components/AccountBlock';
import { resetSyncStoreForTest, useSyncStore } from '@/features/sync/store/sync-store';

const exportBackup = () => Promise.resolve(true);

describe('AccountBlock 상태 줄 (리뷰 Major 4)', () => {
  it('uploadPending 이 참이면 pendingCount=0·online=true 여도 "동기화됨" 이 아니다', () => {
    resetSyncStoreForTest();
    useSyncStore.setState({
      email: 'a@example.com',
      online: true,
      pendingCount: 0,
      uploadPending: true,
    });
    render(<AccountBlock exportBackup={exportBackup} />);

    expect(screen.getByRole('status')).not.toHaveTextContent('● 동기화됨');
  });

  it('uploadPending 이 꺼지면(결정 완료) 평소대로 "동기화됨" 이 뜬다', () => {
    resetSyncStoreForTest();
    useSyncStore.setState({
      email: 'a@example.com',
      online: true,
      pendingCount: 0,
      uploadPending: false,
    });
    render(<AccountBlock exportBackup={exportBackup} />);

    expect(screen.getByRole('status')).toHaveTextContent('● 동기화됨');
  });
});
