import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { SocialPendingCommands } from '@/features/social/components/SocialPendingCommands';
import { commandIntentStore } from '@/features/social/hooks/social-command-intents';
import { useSocialCommand } from '@/features/social/hooks/useSocialCommand';

const f = vi.hoisted(() => ({
  listeners: new Set<(reason: string) => void>(),
  scope: 0,
  eligible: true,
  repository: { me: vi.fn(), deletePost: vi.fn(), createProfile: vi.fn() },
}));
vi.mock('@/repositories/container', () => ({ getSocialRepository: () => f.repository }));
vi.mock('@/features/social/session-lifecycle', () => ({
  captureSocialDispatch: () => {
    const scope = f.scope;
    return () => f.eligible && scope === f.scope;
  },
  invalidateSocialSession: (reason: string) => emit(reason),
  onSocialReady: () => () => undefined,
  onSocialInvalidation: (listener: (reason: string) => void) => {
    f.listeners.add(listener);
    return () => f.listeners.delete(listener);
  },
}));
const answer = <T,>(data: T) => ({ data, serverTime: 1 });
function emit(reason: string) {
  f.scope += 1;
  f.listeners.forEach((listener) => listener(reason));
}
beforeEach(() => {
  emit('account');
  f.eligible = true;
  Object.values(f.repository).forEach((method) => method.mockReset());
  f.repository.me.mockResolvedValue(answer({ profile: { id: 'A' } }));
});
async function missingCard(namespace = 'post-private-id') {
  const view = renderHook(() => useSocialCommand(namespace));
  f.repository.deletePost.mockRejectedValueOnce({ code: 'temporary' });
  await act(async () => {
    await view.result.current.run('delete-private-id', 'private-id', (repo, key) =>
      repo.deletePost({ id: 'private-id' }, key),
    );
  });
  view.unmount();
}
it('committed delete replyloss→원본 card unmount 뒤 body 없는 panel에서 samekey 완료가 가능하다', async () => {
  await missingCard();
  const original = f.repository.deletePost.mock.calls[0];
  const resolved = vi.fn();
  render(<SocialPendingCommands onResolved={resolved} onOwnState={vi.fn()} />);
  const button = await screen.findByRole('button', { name: '완료 여부 확인' });
  expect(screen.getByText('공유 삭제')).toBeVisible();
  expect(document.body.textContent).not.toContain('private-id');
  expect(f.repository.deletePost).toHaveBeenCalledOnce();
  f.repository.deletePost.mockResolvedValueOnce(answer({ deleted: true }));
  await userEvent.setup().click(button);
  await waitFor(() => expect(resolved).toHaveBeenCalledOnce());
  expect(f.repository.deletePost.mock.calls[1]).toEqual(original);
  expect(commandIntentStore.get('post-private-id')).toBeUndefined();
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: '확인 중인 요청' })).toHaveFocus(),
  );
});
it('profile 생성 replyloss 뒤 onboarding이 없어도 fresh canonical profile로 끝내고 create를 반복하지 않는다', async () => {
  f.repository.me.mockResolvedValueOnce(answer({ profile: null }));
  f.repository.createProfile.mockRejectedValueOnce({ code: 'temporary' });
  const first = renderHook(() => useSocialCommand('profile'));
  await act(async () => {
    await first.result.current.run('profile', 'FIRST-name', (repo) =>
      repo.createProfile({ nickname: 'FIRST-name' }),
    );
  });
  first.unmount();
  render(<SocialPendingCommands onResolved={vi.fn()} onOwnState={vi.fn()} />);
  await userEvent.setup().click(await screen.findByRole('button', { name: '완료 여부 확인' }));
  await waitFor(() => expect(commandIntentStore.get('profile')).toBeUndefined());
  expect(f.repository.createProfile).toHaveBeenCalledOnce();
  expect(document.body.textContent).not.toContain('FIRST-name');
});
it('64 row는 표시proof GET 한 번만 공유하며 자동mutation/원문·id·token 노출이 없다', async () => {
  for (let index = 0; index < 64; index += 1) await missingCard(`post-${index}`);
  f.repository.me.mockClear();
  f.repository.deletePost.mockClear();
  render(<SocialPendingCommands onResolved={vi.fn()} onOwnState={vi.fn()} />);
  await waitFor(() =>
    expect(screen.getAllByRole('button', { name: '완료 여부 확인' })).toHaveLength(64),
  );
  expect(f.repository.me).toHaveBeenCalledOnce();
  expect(f.repository.deletePost).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain('private-id');
});
it('invalidated proof는 즉시 label/action을 숨기고 늦은 proof는 새 actor namespace를 복원하지 않는다', async () => {
  await missingCard();
  let reply!: () => void;
  f.repository.me.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        reply = () => resolve(answer({ profile: { id: 'A' } }));
      }),
  );
  render(<SocialPendingCommands onResolved={vi.fn()} onOwnState={vi.fn()} />);
  expect(screen.queryByText('공유 삭제')).toBeNull();
  act(() => {
    f.eligible = false;
    emit('provider');
  });
  await act(async () => reply());
  expect(screen.queryByRole('button', { name: '완료 여부 확인' })).toBeNull();
  act(() => {
    f.eligible = true;
    emit('auth');
  });
  f.repository.me.mockResolvedValue(answer({ profile: { id: 'B' } }));
  act(() => emit('provider'));
  await waitFor(() => expect(commandIntentStore.get('post-private-id')).toBeUndefined());
  expect(screen.queryByText('공유 삭제')).toBeNull();
  expect(f.repository.deletePost).toHaveBeenCalledOnce();
});
it('expired completion은 추적/원래 pair를 유지하고 manual state advice만 제공한다', async () => {
  await missingCard();
  const original = commandIntentStore.get('post-private-id');
  f.repository.deletePost.mockRejectedValueOnce({ code: 'request-expired' });
  render(<SocialPendingCommands onResolved={vi.fn()} onOwnState={vi.fn()} />);
  await userEvent.setup().click(await screen.findByRole('button', { name: '완료 여부 확인' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '완료 여부 확인' })).toBeDisabled(),
  );
  expect(commandIntentStore.get('post-private-id')).toBe(original);
  expect(screen.getByText(/같은 요청을 더 이상 확인할 수 없어요/)).toBeVisible();
  expect(screen.getByRole('button', { name: '내 공유와 현재 상태 보기' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: /버리기|종료|초기화/ })).toBeNull();
});

it('표시 proof 실패 뒤 명시 계정 다시 확인은 GET만 실행하며 FIRST 완료 클릭 전 POST가 없다', async () => {
  await missingCard();
  f.repository.me.mockRejectedValueOnce({ code: 'temporary' });
  render(<SocialPendingCommands onResolved={vi.fn()} onOwnState={vi.fn()} />);
  const retry = await screen.findByRole('button', { name: '계정 다시 확인' });
  await waitFor(() => expect(retry).toBeEnabled());
  expect(screen.queryByText('공유 삭제')).toBeNull();
  await userEvent.setup().click(retry);
  await screen.findByText('공유 삭제');
  expect(f.repository.deletePost).toHaveBeenCalledOnce();
  expect(commandIntentStore.get('post-private-id')).toBeDefined();
});

it.each(['page', 'view', 'wheel', 'account'])(
  'canonical 완료 대기 중 %s 변화는 옛 viewport/focus를 복원하지 않는다',
  async (change) => {
    await missingCard();
    let canonical!: () => void;
    const resolved = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          canonical = resolve;
        }),
    );
    const view = render(
      <SocialPendingCommands
        navigationKey="friends:page2"
        onResolved={resolved}
        onOwnState={vi.fn()}
      />,
    );
    // receipt가 실제 확인된 뒤 authoritative read만 대기한다.
    f.repository.deletePost.mockResolvedValueOnce(answer({ deleted: true }));
    await userEvent.setup().click(await screen.findByRole('button', { name: '완료 여부 확인' }));
    await waitFor(() => expect(resolved).toHaveBeenCalledOnce());
    if (change === 'wheel') fireEvent.wheel(window);
    if (change === 'account') act(() => emit('account'));
    if (change === 'page' || change === 'view')
      view.rerender(
        <SocialPendingCommands
          navigationKey={change === 'page' ? 'friends:page3' : 'public:page2'}
          onResolved={resolved}
          onOwnState={vi.fn()}
        />,
      );
    await act(async () => canonical());
    await act(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    expect(document.activeElement).toBe(document.body);
  },
);
