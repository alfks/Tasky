import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { SocialCategoryView } from '@/domain/social/social';

import { useShareComposer } from '@/features/social/hooks/useShareComposer';

const f = vi.hoisted(() => ({
  listeners: new Set<(reason: string) => void>(),
  scope: 0,
  repository: { me: vi.fn(), createPost: vi.fn() },
}));
vi.mock('@/repositories/container', () => ({ getSocialRepository: () => f.repository }));
vi.mock('@/features/social/session-lifecycle', () => ({
  captureSocialDispatch: () => {
    const scope = f.scope;
    return () => scope === f.scope;
  },
  invalidateSocialSession: vi.fn(),
  onSocialInvalidation: (listener: (reason: string) => void) => {
    f.listeners.add(listener);
    return () => f.listeners.delete(listener);
  },
  onSocialReady: () => () => undefined,
}));
const v1: SocialCategoryView = {
  id: 'a'.repeat(32),
  name: 'R',
  color: '#112233',
  visibility: 'friends',
  version: 1,
  updatedAt: 1,
};
const v2 = { ...v1, visibility: 'public' as const, version: 2 };
function emit(reason: string) {
  f.scope += 1;
  f.listeners.forEach((listener) => listener(reason));
}
function choice(category = v1) {
  return {
    key: 'local-only',
    text: '완료',
    happenedOn: '2026-09-30',
    categoryLabel: 'L',
    resolveCategory: vi.fn().mockResolvedValue(category),
    onChangeAudience: vi.fn(),
  };
}
beforeEach(() => {
  emit('account');
  f.repository.me.mockReset().mockResolvedValue({ data: { profile: { id: 'A' } }, serverTime: 1 });
  f.repository.createPost.mockReset();
});
async function unknown() {
  const selected = choice();
  const shared = vi.fn();
  const view = renderHook(() => useShareComposer(shared));
  await act(async () => view.result.current.select(selected));
  act(() => view.result.current.setText('직접 고친 문장'));
  f.repository.createPost.mockRejectedValueOnce({ code: 'temporary' });
  await act(async () => {
    await view.result.current.share();
  });
  await waitFor(() => expect(view.result.current.command.ownerVerified).toBe(true));
  return { selected, shared, view, first: f.repository.createPost.mock.calls[0] };
}

it.each(['conflict', 'limit-reached'])(
  'v1 unknown→same-key %s는 fresh v2를 읽고 새 click/key만 허용한다',
  async (code) => {
    const { selected, shared, view, first } = await unknown();
    selected.resolveCategory.mockResolvedValue(v2);
    f.repository.createPost.mockRejectedValueOnce({ code });
    await act(async () => {
      await view.result.current.share();
    });
    expect(f.repository.createPost.mock.calls[1]).toEqual(first);
    await waitFor(() => expect(view.result.current.category).toEqual(v2));
    expect(view.result.current.previewCategory).toEqual(v2);
    expect(view.result.current.text).toBe('직접 고친 문장');
    expect(view.result.current.uncertain).toBe(false);
    expect(shared).not.toHaveBeenCalled();
    expect(f.repository.createPost).toHaveBeenCalledTimes(2);
    f.repository.createPost.mockResolvedValueOnce({ data: { id: 'new' }, serverTime: 1 });
    await act(async () => {
      await view.result.current.share();
    });
    const latest = f.repository.createPost.mock.calls[2];
    expect(latest[0]).toEqual({ ...first[0], categoryVersion: 2 });
    expect(latest[1].key).not.toBe(first[1].key);
    expect(shared).toHaveBeenCalledWith('new', 'public');
  },
);

it.each(['rate-limited', 'request-expired', 'idempotency-conflict', 'unauthorized'])(
  'unknown→%s는 FIRST pair를 버리거나 새 요청으로 바꾸지 않는다',
  async (code) => {
    const { selected, shared, view, first } = await unknown();
    selected.resolveCategory.mockResolvedValue(v2);
    f.repository.createPost.mockRejectedValueOnce({ code });
    await act(async () => {
      await view.result.current.share();
    });
    expect(f.repository.createPost.mock.calls[1]).toEqual(first);
    expect(view.result.current.uncertain).toBe(true);
    expect(view.result.current.previewCategory).toEqual(v1);
    expect(selected.resolveCategory).toHaveBeenCalledOnce();
    expect(shared).not.toHaveBeenCalled();
    if (code === 'request-expired' || code === 'idempotency-conflict') {
      await act(async () => {
        await view.result.current.share();
      });
      expect(f.repository.createPost).toHaveBeenCalledTimes(2);
    }
  },
);

it('terminal 뒤 canonical GET 실패는 문장을 보존하고 명시 GET 성공 전 새 POST를 막는다', async () => {
  const { selected, view } = await unknown();
  selected.resolveCategory.mockRejectedValueOnce(new Error('read failed'));
  f.repository.createPost.mockRejectedValueOnce({ code: 'conflict' });
  await act(async () => {
    await view.result.current.share();
  });
  await waitFor(() => expect(view.result.current.checking).toBe(false));
  expect(view.result.current.category).toBeNull();
  expect(view.result.current.text).toBe('직접 고친 문장');
  await act(async () => {
    await view.result.current.share();
  });
  expect(f.repository.createPost).toHaveBeenCalledTimes(2);
  selected.resolveCategory.mockResolvedValue(v2);
  await act(async () => view.result.current.reconcile());
  expect(view.result.current.category).toEqual(v2);
  expect(f.repository.createPost).toHaveBeenCalledTimes(2);
});

it.each([
  { ...v2, visibility: 'private' as const },
  { ...v2, revoked: true },
])('terminal canonical private/revoked는 새 공유를 만들지 않는다: %j', async (canonical) => {
  const { selected, view } = await unknown();
  selected.resolveCategory.mockResolvedValue(canonical);
  f.repository.createPost.mockRejectedValueOnce({ code: 'conflict' });
  await act(async () => {
    await view.result.current.share();
  });
  await waitFor(() => expect(view.result.current.category).toEqual(canonical));
  await act(async () => {
    await view.result.current.share();
  });
  expect(f.repository.createPost).toHaveBeenCalledTimes(2);
});

it('selected-null remount terminal은 미선택 chooser로 복귀하고 새 선택/명시 click 전 POST가 없다', async () => {
  const { view: old, first } = await unknown();
  old.unmount();
  const shared = vi.fn();
  const view = renderHook(() => useShareComposer(shared));
  await waitFor(() => expect(view.result.current.command.ownerVerified).toBe(true));
  f.repository.createPost.mockRejectedValueOnce({ code: 'conflict' });
  await act(async () => {
    await view.result.current.share();
  });
  expect(f.repository.createPost.mock.calls[1]).toEqual(first);
  expect(view.result.current.selected).toBeNull();
  expect(view.result.current.category).toBeNull();
  expect(view.result.current.recoveryInput).toBeNull();
  expect(view.result.current.command.hasIntent()).toBe(false);
  await act(async () => {
    await view.result.current.share();
  });
  expect(f.repository.createPost).toHaveBeenCalledTimes(2);
  await act(async () => view.result.current.select(choice(v2)));
  expect(view.result.current.selected).not.toBeNull();
  expect(f.repository.createPost).toHaveBeenCalledTimes(2);
  expect(shared).not.toHaveBeenCalled();
});

it.each(['choice', 'account', 'unmount'])(
  'terminal held canonical 후 %s는 late preview/POST/callback을 복원하지 않는다',
  async (change) => {
    const { selected, shared, view } = await unknown();
    let finish!: (category: SocialCategoryView) => void;
    selected.resolveCategory.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    f.repository.createPost.mockRejectedValueOnce({ code: 'conflict' });
    let completed = false;
    act(() => {
      void view.result.current.share().then(() => {
        completed = true;
      });
    });
    await waitFor(() => expect(selected.resolveCategory).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(completed).toBe(true));
    expect(view.result.current.command.busy).toBe(false);
    expect(view.result.current.checking).toBe(true);
    if (change === 'choice') {
      await act(async () =>
        view.result.current.select(choice({ ...v2, name: '새 선택', version: 3 })),
      );
      act(() => view.result.current.setText('새 초안'));
    } else if (change === 'account') act(() => emit('account'));
    else view.unmount();
    await act(async () => finish(v2));
    if (change === 'choice') {
      expect(view.result.current.category?.version).toBe(3);
      expect(view.result.current.text).toBe('새 초안');
    } else if (change === 'account') {
      expect(view.result.current.category).toBeNull();
      expect(view.result.current.text).toBe('');
    }
    expect(shared).not.toHaveBeenCalled();
    expect(f.repository.createPost).toHaveBeenCalledTimes(2);
  },
);
