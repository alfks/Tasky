import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { usePublicFeed } from '@/features/social/hooks/usePublicFeed';

const { manager } = vi.hoisted(() => ({
  manager: {
    getSnapshot: () => ({}),
    visibleItems: () => [],
    open: vi.fn(),
    close: vi.fn(),
    invalidate: vi.fn(),
    refresh: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
  },
}));
vi.mock('@/repositories/container', () => ({ getPublicSocialRepository: vi.fn() }));
vi.mock('@/features/social/store/public-feed-manager', () => ({
  createPublicFeedManager: () => manager,
}));

let channel: { onmessage: (() => void) | null; close: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.clearAllMocks();
  channel = { onmessage: null, close: vi.fn() };
  vi.stubGlobal(
    'BroadcastChannel',
    class {
      onmessage: (() => void) | null = null;
      close = vi.fn();
      constructor(readonly name: string) {
        Object.defineProperty(channel, 'onmessage', {
          configurable: true,
          get: () => this.onmessage,
        });
        channel.close = this.close;
      }
    },
  );
});
it('focus와 다른 탭 신호는 먼저 내용을 가리고 새 쿠키 조건으로 재조회한다', () => {
  const { unmount } = renderHook(usePublicFeed);
  act(() => window.dispatchEvent(new Event('focus')));
  expect(manager.invalidate.mock.invocationCallOrder[0]).toBeLessThan(
    manager.refresh.mock.invocationCallOrder[0],
  );
  act(() => channel.onmessage?.());
  expect(manager.invalidate).toHaveBeenCalledTimes(2);
  expect(manager.refresh).toHaveBeenCalledTimes(2);
  unmount();
  expect(channel.close).toHaveBeenCalledOnce();
  expect(manager.close).toHaveBeenCalledOnce();
});
