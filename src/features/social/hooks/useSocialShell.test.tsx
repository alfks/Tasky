import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSocialShell } from '@/features/social/hooks/useSocialShell';
import { clearPendingInvite } from '@/features/social/lib/invite-bootstrap';
import {
  invalidateSocialSession,
  resetSocialSessionForTest,
} from '@/features/social/session-lifecycle';

const TOKEN_A = 'a'.repeat(64);
const TOKEN_B = 'b'.repeat(64);
type EarlyWindow = Window & { __taskyIncomingInvite?: { token: string; expiresAt: number } };

function receive(token: string): void {
  (window as EarlyWindow).__taskyIncomingInvite = { token, expiresAt: Date.now() + 60_000 };
  window.dispatchEvent(new Event('tasky:social-invite'));
}

describe('열린 앱의 초대 전달', () => {
  const closeReports = vi.fn();
  let ready = true;

  beforeEach(() => {
    ready = true;
    closeReports.mockClear();
    resetSocialSessionForTest();
    clearPendingInvite();
  });
  afterEach(() => {
    clearPendingInvite();
    resetSocialSessionForTest();
  });

  it('같은 문서의 초대를 한 번 적용하고 구독 해제 뒤에는 이전 화면을 바꾸지 않는다', () => {
    const { result, unmount } = renderHook(() =>
      useSocialShell('shell-main', false, closeReports, ready),
    );
    act(() => receive(TOKEN_A));
    expect(result.current.invite).toEqual({ kind: 'invite', token: TOKEN_A });
    expect(result.current.open).toBe(true);
    expect(closeReports).toHaveBeenCalledTimes(1);
    unmount();
    act(() => receive(TOKEN_B));
    expect(closeReports).toHaveBeenCalledTimes(1);
  });

  it('작성 중에는 새 초대를 보류하고 계속 작성 또는 버리기 선택을 따른다', () => {
    const { result } = renderHook(() => useSocialShell('shell-main', false, closeReports, ready));
    act(() => result.current.setDirty(true));
    act(() => receive(TOKEN_A));
    expect(result.current.discardPrompt).toBe(true);
    expect(result.current.invite).toBeNull();
    expect(closeReports).not.toHaveBeenCalled();

    act(() => result.current.cancelDiscard());
    expect(result.current.dirty).toBe(true);
    expect(result.current.invite).toBeNull();
    act(() => receive(TOKEN_A));
    act(() => receive(TOKEN_B));
    act(() => expect(result.current.confirmDiscard()).toBe(true));
    expect(result.current.invite).toEqual({ kind: 'invite', token: TOKEN_B });
    expect(result.current.dirty).toBe(false);
    expect(closeReports).toHaveBeenCalledTimes(1);
  });

  it('로그인 대기 중에는 소비하지 않고 같은 훅의 준비 전환 뒤에 받는다', () => {
    ready = false;
    const first = renderHook(() => useSocialShell('shell-main', false, closeReports, ready));
    act(() => receive(TOKEN_A));
    expect(first.result.current.invite).toBeNull();
    ready = true;
    first.rerender();
    expect(first.result.current.invite).toEqual({ kind: 'invite', token: TOKEN_A });
    first.unmount();
  });

  it('계정 무효화는 확인 대기 중 새 초대를 폐기한다', () => {
    const { result } = renderHook(() => useSocialShell('shell-main', false, closeReports, ready));
    act(() => result.current.setDirty(true));
    act(() => receive(TOKEN_A));
    act(() => invalidateSocialSession('account'));
    expect(result.current.discardPrompt).toBe(false);
    act(() => expect(result.current.confirmDiscard()).toBe(false));
    expect(result.current.invite).toBeNull();
  });
});
