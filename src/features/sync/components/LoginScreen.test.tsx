// 리뷰 Major 3(user) — 세션 만료·"다른 기기 모두 로그아웃" 둘 다 verifySession 이 loginNotice 를
// 'signed-out' 으로 남기는 같은 경로로 온다(auth-actions.ts#verifySession). 최초 실행(표식 자체가
// 없던 경우)은 이 값을 전혀 거치지 않으므로 여기서는 안내가 뜨는 경로만 확인한다.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LoginScreen } from '@/features/sync/components/LoginScreen';
import { resetSyncStoreForTest, useSyncStore } from '@/features/sync/store/sync-store';

describe('LoginScreen — 로그인이 풀린 이유 안내(리뷰 Major 3)', () => {
  it('loginNotice 가 signed-out 이면 세션 만료/다른 기기 로그아웃을 아우르는 문구가 뜬다', () => {
    resetSyncStoreForTest();
    useSyncStore.setState({ online: true, loginNotice: 'signed-out' });

    render(<LoginScreen />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      '로그인이 풀렸어요. 세션이 만료되었거나 다른 기기에서 로그아웃했을 수 있어요.',
    );
  });

  it('loginNotice 가 없으면(최초 실행) 안내가 뜨지 않는다', () => {
    resetSyncStoreForTest();
    useSyncStore.setState({ online: true, loginNotice: null });

    render(<LoginScreen />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
