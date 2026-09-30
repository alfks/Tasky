import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { SocialCategoryView } from '@/domain/social/social';

import { useShareComposer } from '@/features/social/hooks/useShareComposer';

const f = vi.hoisted(() => ({
  listeners: new Set<(reason: string) => void>(),
  ready: new Set<() => void>(),
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
  onSocialReady: (listener: () => void) => {
    f.ready.add(listener);
    return () => f.ready.delete(listener);
  },
}));
const canonical: SocialCategoryView = {
  id: 'a'.repeat(32),
  name: 'R',
  color: '#112233',
  visibility: 'private',
  version: 1,
  updatedAt: 1,
};
function emit(reason: string) {
  f.scope += 1;
  f.listeners.forEach((listener) => listener(reason));
}
function fixture() {
  const resolveCategory = vi.fn().mockResolvedValue(canonical);
  return {
    key: 'only-local',
    text: '원래 문장',
    happenedOn: '2026-09-30',
    categoryLabel: 'L',
    resolveCategory,
    onChangeAudience: vi.fn(),
  };
}
beforeEach(() => {
  emit('account');
  f.repository.me.mockReset().mockResolvedValue({ data: { profile: { id: 'A' } }, serverTime: 1 });
  f.repository.createPost.mockReset();
});

it('private chooser→audience 변경 중 같은 draft/date/selection을 유지하고 fresh audience 다음 별도 click만 전송한다', async () => {
  const choice = fixture();
  const shared = vi.fn();
  const view = renderHook(() => useShareComposer(shared));
  await act(async () => {
    view.result.current.select(choice);
  });
  act(() => view.result.current.setText('직접 고친 초안'));
  act(() => {
    choice.onChangeAudience();
    emit('revoked');
  });
  expect(view.result.current.selected?.key).toBe(choice.key);
  expect(view.result.current.selected?.happenedOn).toBe('2026-09-30');
  expect(view.result.current.text).toBe('직접 고친 초안');
  expect(view.result.current.category).toBeNull();
  choice.resolveCategory.mockResolvedValue({ ...canonical, visibility: 'public', version: 2 });
  await act(async () => {
    f.ready.forEach((listener) => listener());
  });
  expect(view.result.current.category?.version).toBe(2);
  expect(f.repository.createPost).not.toHaveBeenCalled();
  f.repository.createPost.mockResolvedValue({ data: { id: 'b'.repeat(32) }, serverTime: 1 });
  await act(async () => {
    await view.result.current.share();
  });
  expect(f.repository.createPost).toHaveBeenCalledWith(
    {
      text: '직접 고친 초안',
      happenedOn: '2026-09-30',
      categoryId: canonical.id,
      categoryVersion: 2,
    },
    expect.anything(),
  );
});

it.each(['offline', 'hidden', 'provider', 'cross-tab'])(
  '첫 post held 중 %s→new canonical이 와도 FIRSTpreview/DTO/키는 고정된다',
  async (reason) => {
    const choice = fixture();
    choice.resolveCategory.mockResolvedValue({ ...canonical, visibility: 'friends' });
    let resolve!: (value: unknown) => void;
    f.repository.createPost.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const shared = vi.fn();
    const view = renderHook(() => useShareComposer(shared));
    await act(async () => {
      view.result.current.select(choice);
    });
    let first!: Promise<void>;
    act(() => {
      first = view.result.current.share();
    });
    await waitFor(() => expect(f.repository.createPost).toHaveBeenCalledOnce());
    const submitted = f.repository.createPost.mock.calls[0];
    act(() => emit(reason));
    expect(view.result.current.uncertain).toBe(true);
    expect(view.result.current.checking).toBe(false);
    choice.resolveCategory.mockResolvedValue({ ...canonical, visibility: 'public', version: 2 });
    await act(async () => {
      f.ready.forEach((listener) => listener());
    });
    expect(view.result.current.category?.version).toBe(2);
    expect(view.result.current.previewCategory?.visibility).toBe('friends');
    await act(async () => {
      resolve({ data: { id: 'old' }, serverTime: 1 });
      await first;
    });
    expect(shared).not.toHaveBeenCalled();
    f.repository.createPost.mockResolvedValue({ data: { id: 'recovered' }, serverTime: 1 });
    await act(async () => {
      await view.result.current.share();
    });
    expect(f.repository.createPost.mock.calls[1]).toEqual(submitted);
    expect(shared).toHaveBeenCalledWith('recovered', 'recovered');
  },
);

it('held canonical read와 초안은 account 종료에서 폐기하며 late read가 복구하지 않는다', async () => {
  const choice = fixture();
  let finish!: (value: unknown) => void;
  choice.resolveCategory.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = renderHook(() => useShareComposer(vi.fn()));
  act(() => {
    view.result.current.select(choice);
  });
  act(() => emit('account'));
  await act(async () => {
    finish({ ...canonical, visibility: 'public' });
  });
  expect(view.result.current.text).toBe('');
  expect(view.result.current.selected).toBeNull();
  expect(view.result.current.category).toBeNull();
  expect(view.result.current.checking).toBe(false);
});

it('unknown share remount는 source 선택 없이 fresh actor proof 뒤 FIRST 문장/date와 같은 DTO/key를 회복한다', async () => {
  const choice = fixture();
  choice.resolveCategory.mockResolvedValue({ ...canonical, visibility: 'public' });
  const first = renderHook(() => useShareComposer(vi.fn()));
  await act(async () => first.result.current.select(choice));
  act(() => first.result.current.setText('승인된 첫 문장'));
  f.repository.createPost.mockRejectedValueOnce({ code: 'temporary' });
  await act(async () => {
    await first.result.current.share();
  });
  const sent = f.repository.createPost.mock.calls[0];
  first.unmount();
  let verify!: () => void;
  f.repository.me.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        verify = () => resolve({ data: { profile: { id: 'A' } }, serverTime: 1 });
      }),
  );
  const shared = vi.fn();
  const second = renderHook(() => useShareComposer(shared));
  expect(second.result.current.selected).toBeNull();
  expect(second.result.current.recoveryInput ?? null).toBeNull();
  expect(f.repository.createPost).toHaveBeenCalledOnce();
  await act(async () => verify());
  expect(second.result.current.recoveryInput).toMatchObject({
    text: '승인된 첫 문장',
    happenedOn: '2026-09-30',
  });
  f.repository.createPost.mockResolvedValueOnce({ data: { id: 'recovered' }, serverTime: 1 });
  await act(async () => {
    await second.result.current.share();
  });
  expect(f.repository.createPost.mock.calls[1]).toEqual(sent);
  expect(shared).toHaveBeenCalledWith('recovered', 'recovered');
});

it('remount displayproof 실패 뒤 계정 다시 확인은 FIRST 내용만 보여주고 새 POST를 시작하지 않는다', async () => {
  const choice = fixture();
  choice.resolveCategory.mockResolvedValue({ ...canonical, visibility: 'public' });
  f.repository.createPost.mockRejectedValueOnce({ code: 'temporary' });
  const first = renderHook(() => useShareComposer(vi.fn()));
  await act(async () => first.result.current.select(choice));
  await act(async () => {
    await first.result.current.share();
  });
  first.unmount();
  f.repository.me.mockRejectedValueOnce({ code: 'temporary' });
  const second = renderHook(() => useShareComposer(vi.fn()));
  await waitFor(() => expect(second.result.current.command.proofChecking).toBe(false));
  expect(second.result.current.recoveryInput).toBeNull();
  await act(async () => second.result.current.command.verifyOwner());
  expect(second.result.current.recoveryInput?.text).toBe('원래 문장');
  expect(f.repository.createPost).toHaveBeenCalledOnce();
});
