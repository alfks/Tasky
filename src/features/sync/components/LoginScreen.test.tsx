// 리뷰 Major 3(user) — 세션 만료·"다른 기기 모두 로그아웃" 둘 다 verifySession 이 loginNotice 를
// 'signed-out' 으로 남기는 같은 경로로 온다(auth-actions.ts#verifySession). 최초 실행(표식 자체가
// 없던 경우)은 이 값을 전혀 거치지 않으므로 여기서는 안내가 뜨는 경로만 확인한다.
import { fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

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

  it('초대 저장 실패면 그 화면에 안내를 남기고 명시적으로 초대 없이 로그인할 수 있다', async () => {
    resetSyncStoreForTest();
    useSyncStore.setState({ online: true, loginNotice: null });
    const beforeLogin = vi.fn((withoutInvite?: boolean) => withoutInvite === true);
    render(<LoginScreen beforeLogin={beforeLogin} />);

    await userEvent.click(screen.getByRole('link', { name: 'Google로 계속하기' }));
    expect(beforeLogin).toHaveBeenCalledWith();
    expect(screen.getByRole('alert')).toHaveTextContent(
      '초대 정보를 보관하지 못했어요. 로그인 후 초대 링크를 다시 열어 주세요.',
    );
    expect(screen.getByRole('link', { name: '초대 없이 로그인' })).toHaveAttribute(
      'href',
      '/auth/login',
    );
    await userEvent.click(screen.getByRole('link', { name: '초대 없이 로그인' }));
    expect(beforeLogin).toHaveBeenLastCalledWith(true);
  });

  it('수정 키 클릭은 현재 탭의 초대 저장·삭제를 실행하지 않는다', () => {
    resetSyncStoreForTest();
    useSyncStore.setState({ online: true, loginNotice: null });
    const beforeLogin = vi.fn(() => false);
    render(<LoginScreen beforeLogin={beforeLogin} />);
    const login = screen.getByRole('link', { name: 'Google로 계속하기' });
    fireEvent.click(login, { ctrlKey: true });
    fireEvent.click(login, { metaKey: true });
    fireEvent.click(login, { shiftKey: true });
    fireEvent.click(login, { altKey: true });
    fireEvent.click(login, { button: 1 });
    expect(beforeLogin).not.toHaveBeenCalled();

    fireEvent.click(login);
    const skip = screen.getByRole('link', { name: '초대 없이 로그인' });
    beforeLogin.mockClear();
    fireEvent.click(skip, { ctrlKey: true });
    fireEvent.click(skip, { button: 1 });
    expect(beforeLogin).not.toHaveBeenCalled();
  });
});
