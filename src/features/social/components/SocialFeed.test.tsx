import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import type { PostView } from '@/domain/social/social';

import { SocialFeed } from '@/features/social/components/SocialFeed';
import type { FeedSnapshot } from '@/features/social/lib/feed-validation';

const f = vi.hoisted(() => ({
  listeners: new Set<(reason: string) => void>(),
  set: (_snapshot: Partial<FeedSnapshot>) => {},
  get: () => ({}) as FeedSnapshot,
  refresh: vi.fn(),
  refreshCurrent: vi.fn(),
  next: vi.fn(),
  previous: vi.fn(),
  setView: vi.fn(),
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
vi.mock('@/features/social/store/social-store', async () => {
  const { create } = await import('zustand');
  const store = create<
    FeedSnapshot & {
      refresh: () => Promise<void>;
      refreshCurrent: () => Promise<void>;
      next: () => Promise<void>;
      previous: () => Promise<void>;
      setView: () => Promise<void>;
    }
  >(() => ({
    ...({} as FeedSnapshot),
    refresh: f.refresh,
    refreshCurrent: f.refreshCurrent,
    next: f.next,
    previous: f.previous,
    setView: f.setView,
  }));
  f.set = store.setState;
  f.get = store.getState;
  return { useSocialStore: store, useVisibleSocialPosts: () => store((state) => state.items) };
});
const post: PostView = {
  id: 'post',
  text: '아래쪽 기록',
  happenedOn: '2026-09-30',
  author: { id: 'other', nickname: '친구' },
  myReaction: false,
  reactionCount: 0,
  createdAt: 1,
};
beforeEach(() => {
  f.listeners.forEach((listener) => listener('account'));
  f.set({
    phase: 'ready',
    mode: 'enabled',
    profile: { id: 'owner', nickname: '나', version: 1 },
    view: 'friends',
    items: [post],
    error: null,
    hasNew: false,
    pageIndex: 0,
    cursorStack: [null],
    nextCursor: 'next',
  });
  f.repository.me
    .mockReset()
    .mockResolvedValue({ data: { profile: { id: 'owner' } }, serverTime: 1 });
  f.repository.setReaction
    .mockReset()
    .mockResolvedValue({ data: { postId: post.id, active: true }, serverTime: 1 });
  f.refresh.mockReset();
  f.refreshCurrent.mockReset();
  f.next.mockReset().mockResolvedValue(undefined);
});
function fixture() {
  const view = render(
    <div role="region" aria-label="읽는 영역">
      <SocialFeed mine={false} onShare={vi.fn()} onFriends={vi.fn()} />
    </div>,
  );
  const region = screen.getByRole('region', { name: '읽는 영역' });
  Object.defineProperties(region, { scrollHeight: { value: 2000 }, clientHeight: { value: 400 } });
  region.scrollTop = 800;
  let finish!: () => void;
  f.refreshCurrent.mockImplementation(async () => {
    f.set({ phase: 'loading', items: [] });
    region.scrollTop = 0; // 실제 목록 masking 때 browser가 높이 감소로 clamp하는 상태.
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    f.set({ phase: 'ready', items: [{ ...post, myReaction: true, reactionCount: 1 }] });
  });
  return { ...view, region, finish: () => finish() };
}
it('authoritative refresh가 목록을 masking/clamp해도 cheer 버튼 포커스와 실제 읽던 scroll을 복원한다', async () => {
  const user = userEvent.setup();
  const view = fixture();
  await user.click(screen.getByRole('button', { name: '응원하기' }));
  await waitFor(() => expect(f.refreshCurrent).toHaveBeenCalledOnce());
  expect(screen.queryByRole('article')).toBeNull();
  await act(async () => view.finish());
  await waitFor(() => expect(screen.getByRole('button', { name: '응원 취소' })).toHaveFocus());
  expect(view.region.scrollTop).toBe(800);
  expect(screen.getByLabelText('응원 1개')).toBeVisible();
  expect(screen.getByRole('heading', { name: '피드' })).not.toHaveFocus();
});
it('응답을 기다리는 동안 사용자 navigation은 옛 button focus/scroll 복원을 막는다', async () => {
  const user = userEvent.setup();
  const view = fixture();
  await user.click(screen.getByRole('button', { name: '응원하기' }));
  await waitFor(() => expect(f.refreshCurrent).toHaveBeenCalledOnce());
  await user.click(screen.getByRole('button', { name: '모두 공개' }));
  await act(async () => view.finish());
  await screen.findByRole('button', { name: '응원 취소' });
  expect(screen.getByRole('button', { name: '모두 공개' })).toHaveFocus();
  expect(view.region.scrollTop).toBe(0);
});
it('loading 중 사용자 wheel은 viewport를 강제로 예전 위치로 되돌리지 않는다', async () => {
  const user = userEvent.setup();
  const view = fixture();
  await user.click(screen.getByRole('button', { name: '응원하기' }));
  await waitFor(() => expect(f.refreshCurrent).toHaveBeenCalledOnce());
  fireEvent.wheel(window);
  await act(async () => view.finish());
  await screen.findByRole('button', { name: '응원 취소' });
  expect(view.region.scrollTop).toBe(0);
});
it('mutation 응답 전에 wheel로 이동하면 authoritative refresh도 시작하지 않아 읽던 viewport를 masking하지 않는다', async () => {
  const user = userEvent.setup();
  const view = fixture();
  let reply!: () => void;
  f.repository.setReaction.mockImplementation(
    () =>
      new Promise((resolve) => {
        reply = () => resolve({ data: { postId: post.id, active: true }, serverTime: 1 });
      }),
  );
  await user.click(screen.getByRole('button', { name: '응원하기' }));
  await waitFor(() => expect(f.repository.setReaction).toHaveBeenCalledOnce());
  fireEvent.wheel(window);
  view.region.scrollTop = 900;
  await act(async () => reply());
  await waitFor(() => expect(screen.getByRole('button', { name: '응원하기' })).toBeEnabled());
  expect(f.refreshCurrent).not.toHaveBeenCalled();
  expect(f.refresh).not.toHaveBeenCalled();
  expect(screen.getByRole('article')).toBeVisible();
  expect(view.region.scrollTop).toBe(900);
});
it('명시 pagination은 기존 heading focus와 top 이동을 유지한다', async () => {
  const user = userEvent.setup();
  const view = fixture();
  const heading = screen.getByRole('heading', { name: '피드' });
  const scroll = vi.fn();
  heading.scrollIntoView = scroll;
  await user.click(screen.getByRole('button', { name: /다음/ }));
  await waitFor(() => expect(heading).toHaveFocus());
  expect(scroll).toHaveBeenCalledWith({ block: 'start' });
  view.unmount();
});

it('page2 mutation은 current cursor/stack와 같은 card를 유지하고 navigation refresh로 첫 페이지로 돌아가지 않는다', async () => {
  const user = userEvent.setup();
  const view = fixture();
  act(() => f.set({ pageIndex: 1, cursorStack: [null, 'page2'], nextCursor: 'page3' }));
  f.refresh.mockImplementation(async () => {
    f.set({ pageIndex: 0, cursorStack: [null], items: [], phase: 'ready' });
  });
  await user.click(screen.getByRole('button', { name: '응원하기' }));
  await waitFor(() => expect(f.refreshCurrent).toHaveBeenCalledOnce());
  await act(async () => view.finish());
  await waitFor(() => expect(screen.getByRole('button', { name: '응원 취소' })).toHaveFocus());
  expect(f.refresh).not.toHaveBeenCalled();
  expect(f.get().pageIndex).toBe(1);
  expect(f.get().cursorStack).toEqual([null, 'page2']);
  expect(screen.getByRole('article')).toHaveAttribute('id', 'social-post-post');
  expect(view.region.scrollTop).toBe(800);
  expect(screen.getByLabelText('응원 1개')).toBeVisible();
});
