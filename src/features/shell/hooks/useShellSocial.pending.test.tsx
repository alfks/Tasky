import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeCategory } from '@/test/fixtures/category';

const category = makeCategory();
async function fixture() {
  vi.resetModules();
  vi.doMock('@/features/social', async () => {
    const lifecycle = await import('@/features/social/session-lifecycle');
    return { onSocialInvalidation: lifecycle.onSocialInvalidation };
  });
  const { useShellSocial } = await import('@/features/shell/hooks/useShellSocial');
  const pending = await import('@/features/category/store/category-publication-pending');
  const { invalidateSocialSession } = await import('@/features/social/session-lifecycle');
  const render = () => renderHook(() => useShellSocial(vi.fn(), vi.fn()));
  return { render, pending, invalidateSocialSession };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.doUnmock('@/features/social');
});

describe('셸 재마운트에도 유지되는 미확정 개인 표시', () => {
  it('unknown 표시의 제작자는 셸 종료 뒤 살아 있으며 새 셸의 수정/삭제를 확인으로 보낸다', async () => {
    const f = await fixture();
    const first = f.render();
    let ids: readonly string[] | null = [category.id];
    let notify = () => {};
    const stop = vi.fn();
    act(() =>
      first.result.current.bridge.registerPendingCategories(
        () => ids,
        (listener) => {
          notify = listener;
          return stop;
        },
      ),
    );
    first.unmount();
    expect(stop).not.toHaveBeenCalled();
    ids = null;
    notify();
    const second = f.render();
    expect(second.result.current.bridge.pendingCategoryIds).toEqual([category.id]);
    let removing!: Promise<boolean>;
    let changing!: Promise<boolean>;
    act(() => {
      removing = second.result.current.bridge.beforeRemove(category);
    });
    expect(second.result.current.request?.kind).toBe('remove');
    act(() => {
      changing = second.result.current.bridge.beforeMetadataChange(category, {
        name: '새 이름',
        color: category.color,
      });
    });
    await expect(removing).resolves.toBe(false);
    expect(second.result.current.request?.kind).toBe('metadata');
    act(() => second.result.current.request?.resolve(false));
    await expect(changing).resolves.toBe(false);
    act(() => f.pending.clearPendingCategories());
    expect(stop).toHaveBeenCalledOnce();
  });

  it('셸이 모두 닫힌 account 폐기는 원래 제작자를 끊고 늦은 알림의 복원을 막는다', async () => {
    const f = await fixture();
    const first = f.render();
    let notify = () => {};
    const stop = vi.fn();
    act(() =>
      first.result.current.bridge.registerPendingCategories(
        () => [category.id],
        (listener) => {
          notify = listener;
          return stop;
        },
      ),
    );
    first.unmount();
    f.invalidateSocialSession('account');
    expect(stop).toHaveBeenCalledOnce();
    notify();
    expect(f.pending.getPendingCategoryIds()).toEqual([]);
    const second = f.render();
    expect(second.result.current.bridge.pendingCategoryIds).toEqual([]);
    await expect(second.result.current.bridge.beforeRemove(category)).resolves.toBe(true);
    expect(second.result.current.request).toBeNull();
  });

  it('같은 계정 auth/quarantine은 닫힌 셸의 중립 표시를 폐기하지 않는다', async () => {
    const f = await fixture();
    const first = f.render();
    act(() =>
      first.result.current.bridge.registerPendingCategories(
        () => [category.id],
        () => () => {},
      ),
    );
    first.unmount();
    f.invalidateSocialSession('auth');
    const second = f.render();
    expect(second.result.current.bridge.pendingCategoryIds).toEqual([category.id]);
    act(() => {
      void second.result.current.bridge.beforeRemove(category);
    });
    expect(second.result.current.request?.kind).toBe('remove');
    act(() => f.pending.clearPendingCategories());
  });

  it('React가 새 표시를 렌더하기 전에도 동기 getter가 unbound 삭제 우회를 막는다', async () => {
    const f = await fixture();
    const shell = f.render();
    let ids: readonly string[] | null = [];
    let notify = () => {};
    act(() =>
      shell.result.current.bridge.registerPendingCategories(
        () => ids,
        (listener) => {
          notify = listener;
          return () => {};
        },
      ),
    );
    const oldBridge = shell.result.current.bridge;
    let removing!: Promise<boolean>;
    act(() => {
      ids = [category.id];
      notify();
      removing = oldBridge.beforeRemove(category);
    });
    expect(shell.result.current.request?.kind).toBe('remove');
    act(() => shell.result.current.request?.resolve(false));
    await expect(removing).resolves.toBe(false);
    act(() => f.pending.clearPendingCategories());
  });

  it('교체된 제작자와 오류/null은 확인 표시를 함부로 지우거나 되살리지 않는다', async () => {
    const f = await fixture();
    const first = f.render();
    let oldNotify = () => {};
    act(() =>
      first.result.current.bridge.registerPendingCategories(
        () => [category.id],
        (listener) => {
          oldNotify = listener;
          return () => {};
        },
      ),
    );
    const stable = f.pending.getPendingCategoryIds();
    act(() =>
      first.result.current.bridge.registerPendingCategories(
        () => {
          throw new Error('unverified');
        },
        () => () => {},
      ),
    );
    expect(f.pending.getPendingCategoryIds()).toBe(stable);
    act(() =>
      first.result.current.bridge.registerPendingCategories(
        () => [],
        () => () => {},
      ),
    );
    act(oldNotify);
    expect(f.pending.getPendingCategoryIds()).toEqual([]);
    act(() => f.pending.clearPendingCategories());
  });
});
