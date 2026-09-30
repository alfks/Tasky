import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function fixture() {
  vi.resetModules();
  vi.doMock('@/features/social', async () => {
    const lifecycle = await import('@/features/social/session-lifecycle');
    return { onSocialInvalidation: lifecycle.onSocialInvalidation };
  });
  const { useShellSocial } = await import('@/features/shell/hooks/useShellSocial');
  const { invalidateSocialSession } = await import('@/features/social/session-lifecycle');
  const hook = renderHook(() => useShellSocial(vi.fn(), vi.fn()));
  return { hook, invalidateSocialSession };
}
afterEach(() => {
  cleanup();
  vi.doUnmock('@/features/social');
  vi.restoreAllMocks();
});
describe('삭제 계정 guard와 보기 generation의 분리', () => {
  it.each(['revoked', 'recheck', 'offline', 'hidden', 'closed', 'cross-tab'] as const)(
    '%s는 같은 계정의 canonical cleanup을 허용한다',
    async (reason) => {
      const f = await fixture();
      const allowed = f.hook.result.current.bridge.captureRemovalGuard();
      act(() => f.invalidateSocialSession(reason));
      expect(allowed()).toBe(true);
    },
  );
  it.each(['auth', 'account', 'provider'] as const)(
    '%s는 이전 삭제/undo guard를 영구 거절한다',
    async (reason) => {
      const f = await fixture();
      const allowed = f.hook.result.current.bridge.captureRemovalGuard();
      act(() => f.invalidateSocialSession(reason));
      expect(allowed()).toBe(false);
      expect(f.hook.result.current.bridge.captureRemovalGuard()()).toBe(true);
    },
  );
  it('unmount 뒤 이전 guard는 새 셸에 권한을 주지 않는다', async () => {
    const f = await fixture();
    const allowed = f.hook.result.current.bridge.captureRemovalGuard();
    f.hook.unmount();
    expect(allowed()).toBe(false);
  });
});
