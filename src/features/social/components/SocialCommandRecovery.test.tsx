import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { InviteLanding } from '@/features/social/components/InviteLanding';
import { SocialInvites } from '@/features/social/components/SocialInvites';
import { SocialRequests } from '@/features/social/components/SocialRequests';
import { SocialShareDialog } from '@/features/social/components/SocialShareDialog';

const f = vi.hoisted(() => ({
  listeners: new Set<(reason: string) => void>(),
  ready: new Set<() => void>(),
  token: null as string | null,
  repository: {
    me: vi.fn(),
    invites: vi.fn(),
    createInvite: vi.fn(),
    requests: vi.fn(),
    acceptRequest: vi.fn(),
    createPost: vi.fn(),
    previewInvite: vi.fn(),
    sendRequest: vi.fn(),
  },
}));
vi.mock('@/features/social/lib/invite-fragment', () => ({
  pendingInviteToken: () => f.token,
  clearPendingInvite: () => {
    f.token = null;
  },
}));
vi.mock('@/repositories/container', () => ({ getSocialRepository: () => f.repository }));
vi.mock('@/features/social/session-lifecycle', () => ({
  captureSocialDispatch: () => () => true,
  invalidateSocialSession: (reason: string) => f.listeners.forEach((listener) => listener(reason)),
  recheckSocialSession: async () => {
    f.ready.forEach((listener) => listener());
  },
  onSocialInvalidation: (listener: (reason: string) => void) => {
    f.listeners.add(listener);
    return () => f.listeners.delete(listener);
  },
  onSocialReady: (listener: () => void) => {
    f.ready.add(listener);
    return () => f.ready.delete(listener);
  },
}));
const answer = <T,>(data: T) => ({ data, serverTime: 1 });
beforeEach(() => {
  f.listeners.forEach((listener) => listener('account'));
  Object.values(f.repository).forEach((method) => method.mockReset());
  f.repository.me.mockResolvedValue(answer({ profile: { id: 'actor' } }));
});

it('invite panel unmount/remount 뒤 같은 explicit action은 새 링크를 만들지 않고 FIRST key receipt를 확인한다', async () => {
  let created = false;
  f.repository.invites.mockImplementation(async () =>
    answer({
      items: created
        ? [{ inviteId: 'same-invite', status: 'active', expiresAt: 2000000000000 }]
        : [],
      nextCursor: null,
    }),
  );
  f.repository.createInvite
    .mockImplementationOnce(async () => {
      created = true;
      throw { code: 'temporary' };
    })
    .mockResolvedValueOnce(answer({ inviteId: 'same-invite', tokenUnavailable: true }));
  const user = userEvent.setup();
  const view = render(<SocialInvites enabled />);
  await user.click(screen.getByRole('button', { name: '초대 만들기' }));
  await screen.findByRole('button', { name: '완료 여부 확인' });
  const first = f.repository.createInvite.mock.calls[0];
  view.unmount();
  act(() => f.listeners.forEach((listener) => listener('cross-tab')));
  render(<SocialInvites enabled />);
  await screen.findByText(/사용 가능/);
  expect(screen.getByRole('button', { name: '초대 취소' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '완료 여부 확인' }));
  await screen.findByText(/초대는 만들어졌지만 링크를 다시 보여줄 수 없어요/);
  expect(f.repository.createInvite.mock.calls[1]).toEqual(first);
  expect(screen.queryByRole('textbox', { name: '초대 링크' })).toBeNull();
  expect(screen.getByRole('button', { name: '초대 만들기' })).toBeEnabled();
  expect(screen.getByRole('button', { name: '초대 취소' })).toBeEnabled();
});

it('request가 이미 수락되어 목록에서 없어져도 remount의 완료 확인은 FIRST pairVersion/key로만 재확인한다', async () => {
  let accepted = false;
  f.repository.requests.mockImplementation(async () =>
    answer({
      items: accepted
        ? []
        : [{ peer: { id: 'peer', nickname: '친구' }, pairVersion: 1, expiresAt: 2000000000000 }],
      nextCursor: null,
    }),
  );
  f.repository.acceptRequest
    .mockImplementationOnce(async () => {
      accepted = true;
      throw { code: 'temporary' };
    })
    .mockResolvedValueOnce(answer({ peerId: 'peer', pairVersion: 2, state: 'accepted' }));
  const user = userEvent.setup();
  const view = render(<SocialRequests direction="incoming" enabled />);
  await user.click(await screen.findByRole('button', { name: '수락' }));
  await screen.findByRole('button', { name: '완료 여부 확인' });
  const first = f.repository.acceptRequest.mock.calls[0];
  view.unmount();
  act(() => f.listeners.forEach((listener) => listener('provider')));
  render(<SocialRequests direction="incoming" enabled />);
  await screen.findByText('대기 중인 요청이 없어요');
  expect(screen.queryByRole('button', { name: '수락' })).toBeNull();
  await user.click(screen.getByRole('button', { name: '완료 여부 확인' }));
  await waitFor(() => expect(f.repository.acceptRequest).toHaveBeenCalledTimes(2));
  expect(f.repository.acceptRequest.mock.calls[1]).toEqual(first);
  await waitFor(() => expect(screen.queryByRole('button', { name: '완료 여부 확인' })).toBeNull());
  expect(screen.getByRole('heading', { name: '받은 요청' })).toHaveFocus();
});

it('blocked unknown은 fresh public canonical이 있어도 완료 확인을 켜거나 private라고 표시하지 않는다', async () => {
  const user = userEvent.setup();
  const category = {
    id: 'a'.repeat(32),
    name: '공개',
    color: '#112233',
    visibility: 'public' as const,
    version: 1,
    updatedAt: 1,
  };
  f.repository.createPost
    .mockRejectedValueOnce({ code: 'temporary' })
    .mockRejectedValueOnce({ code: 'request-expired' });
  render(
    <SocialShareDialog
      choices={[
        {
          key: 'local',
          text: '완료 문장',
          happenedOn: '2026-09-30',
          categoryLabel: '공개',
          resolveCategory: async () => category,
          onChangeAudience: vi.fn(),
        },
      ]}
      date="2026-09-30"
      loading={false}
      onDateChange={vi.fn()}
      onClose={vi.fn()}
      onShared={vi.fn()}
    />,
  );
  await user.click(screen.getByRole('radio', { name: /완료 문장/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: '공유하기' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: '공유하기' }));
  await user.click(await screen.findByRole('button', { name: '완료 여부 확인' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '완료 여부 확인' })).toBeDisabled(),
  );
  expect(screen.queryByText(/나만 볼 수 있어요/)).toBeNull();
  expect(screen.getByRole('textbox', { name: '공유 문장' })).toBeDisabled();
  expect(f.repository.createPost).toHaveBeenCalledTimes(2);
});

it('초대 A unknown 뒤 B landing은 A완료와 B동의를 섞지 않으며 B원문을 지우거나 자동으로 제출하지 않는다', async () => {
  const tokenA = 'a'.repeat(64);
  const tokenB = 'b'.repeat(64);
  f.token = tokenA;
  f.repository.previewInvite.mockImplementation(async ({ token }) =>
    answer({ nickname: token === tokenA ? '초대 A' : '초대 B', expiresAt: 2000000000000 }),
  );
  f.repository.sendRequest
    .mockRejectedValueOnce({ code: 'temporary' })
    .mockResolvedValue(answer({ peerId: 'peer', state: 'pending', pairVersion: 1 }));
  const user = userEvent.setup();
  const done = vi.fn();
  const view = render(<InviteLanding enabled onDone={done} />);
  await screen.findByText('초대 A님에게 친구 요청을 보낼까요?');
  await user.click(screen.getByRole('button', { name: '친구 요청 보내기' }));
  await screen.findByRole('button', { name: '완료 여부 확인' });
  const first = f.repository.sendRequest.mock.calls[0];
  view.unmount();
  f.token = tokenB;
  render(<InviteLanding enabled onDone={done} />);
  await screen.findByText(/이전에 보낸 친구 요청의 완료 여부를 먼저/);
  expect(screen.queryByText(/초대 B님에게/)).toBeNull();
  await user.click(screen.getByRole('button', { name: '완료 여부 확인' }));
  await screen.findByText('초대 B님에게 친구 요청을 보낼까요?');
  expect(f.repository.sendRequest.mock.calls[1]).toEqual(first);
  expect(f.token).toBe(tokenB);
  expect(done).not.toHaveBeenCalled();
  expect(f.repository.sendRequest).toHaveBeenCalledTimes(2);
  await user.click(screen.getByRole('button', { name: '친구 요청 보내기' }));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(f.repository.sendRequest.mock.calls[2][0]).toEqual({ token: tokenB });
  expect(f.repository.sendRequest.mock.calls[2][1].key).not.toBe(first[1].key);
});
