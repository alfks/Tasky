import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import type { PostView } from '@/domain/social/social';

import { SocialPostCard } from '@/features/social/components/SocialPostCard';

const f = vi.hoisted(() => ({
  listeners: new Set<(reason: string) => void>(),
  repository: { me: vi.fn(), setReaction: vi.fn() },
}));
vi.mock('@/repositories/container', () => ({ getSocialRepository: () => f.repository }));
vi.mock('@/features/social/session-lifecycle', () => ({
  captureSocialDispatch: () => () => true,
  invalidateSocialSession: vi.fn(),
  recheckSocialSession: vi.fn(),
  onSocialReady: () => () => undefined,
  onSocialInvalidation: (listener: (reason: string) => void) => {
    f.listeners.add(listener);
    return () => f.listeners.delete(listener);
  },
}));
const post: PostView = {
  id: 'post',
  text: '완료',
  happenedOn: '2026-09-30',
  author: { id: 'other', nickname: '친구' },
  myReaction: true,
  reactionCount: 1,
  createdAt: 1,
};
beforeEach(() => {
  f.listeners.forEach((listener) => listener('account'));
  f.repository.me
    .mockReset()
    .mockResolvedValue({ data: { profile: { id: 'owner' } }, serverTime: 1 });
  f.repository.setReaction
    .mockReset()
    .mockResolvedValue({ data: { postId: post.id, active: false }, serverTime: 1 });
});
it('read-only active cheer는 취소하고 authoritative parent 갱신 후 pressed/count가 내려간다', async () => {
  const user = userEvent.setup();
  const changed = vi.fn();
  const view = render(
    <SocialPostCard
      post={post}
      own={false}
      canWrite={false}
      canCancelReaction
      onChanged={changed}
      returnFocus={() => null}
    />,
  );
  await user.click(screen.getByRole('button', { name: '응원 취소' }));
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(f.repository.setReaction).toHaveBeenCalledWith(
    { postId: 'post', active: false },
    expect.anything(),
  );
  view.rerender(
    <SocialPostCard
      post={{ ...post, myReaction: false, reactionCount: 0 }}
      own={false}
      canWrite={false}
      canCancelReaction
      onChanged={changed}
      returnFocus={() => null}
    />,
  );
  expect(screen.getByRole('button', { name: '응원하기' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '응원하기' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByLabelText('응원 0개')).toBeVisible();
});
it('read-only inactive와 self/anonymous는 새 응원을 보낼 수 없다', async () => {
  const user = userEvent.setup();
  const props = {
    onChanged: vi.fn(),
    returnFocus: () => null,
    canWrite: false,
    canCancelReaction: true,
  };
  const view = render(
    <SocialPostCard {...props} post={{ ...post, myReaction: false }} own={false} />,
  );
  await user.click(screen.getByRole('button', { name: '응원하기' }));
  expect(f.repository.setReaction).not.toHaveBeenCalled();
  view.rerender(<SocialPostCard {...props} post={post} own />);
  expect(screen.queryByRole('button', { name: '응원 취소' })).toBeNull();
  view.rerender(<SocialPostCard {...props} post={post} own={false} anonymous />);
  expect(screen.getByRole('link', { name: '로그인하고 응원하기' })).toBeVisible();
});
it('반응 카드 masking/remount 뒤 canonical pressed가 달라도 완료 확인은 원래 active/key를 사용한다', async () => {
  f.repository.setReaction.mockRejectedValueOnce({ code: 'temporary' });
  const user = userEvent.setup();
  const changed = vi.fn();
  const props = { own: false, canWrite: true, onChanged: changed, returnFocus: () => null };
  const view = render(<SocialPostCard {...props} post={{ ...post, myReaction: false }} />);
  await user.click(screen.getByRole('button', { name: '응원하기' }));
  await screen.findByRole('button', { name: '완료 여부 확인' });
  const original = f.repository.setReaction.mock.calls[0];
  view.unmount();
  act(() => f.listeners.forEach((listener) => listener('cross-tab')));
  render(<SocialPostCard {...props} post={post} />);
  await user.click(screen.getByRole('button', { name: '완료 여부 확인' }));
  expect(f.repository.setReaction.mock.calls[1]).toEqual(original);
  expect(changed).toHaveBeenCalledOnce();
});
