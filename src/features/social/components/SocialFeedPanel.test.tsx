import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SocialFeedPanel } from '@/features/social/components/SocialFeedPanel';
import { useSocialStore } from '@/features/social/store/social-store';

const initial = useSocialStore.getState();

afterEach(() => act(() => useSocialStore.setState(initial)));

describe('피드 첫 진입', () => {
  it('프로필이 없으면 별명 생성 경로를 보여 주고 빈 페이지 탐색은 숨긴다', async () => {
    act(() =>
      useSocialStore.setState({
        phase: 'ready',
        mode: 'enabled',
        profile: null,
        canShow: false,
        items: [],
      }),
    );
    const onOpenFriends = vi.fn();
    render(<SocialFeedPanel onOpenFriends={onOpenFriends} onOpenMine={vi.fn()} />);
    expect(screen.getByText('친구 기능을 시작하려면 별명을 먼저 정해 주세요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다음 기록' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '별명 정하러 가기' }));
    expect(onOpenFriends).toHaveBeenCalledOnce();
  });

  it('읽기 전용에서 프로필이 없으면 생성 제한을 설명한다', () => {
    act(() =>
      useSocialStore.setState({ phase: 'ready', mode: 'read-only', profile: null, canShow: false }),
    );
    render(<SocialFeedPanel onOpenFriends={vi.fn()} onOpenMine={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('지금은 새 별명을 만들 수 없어요');
    expect(screen.queryByRole('button', { name: '별명 정하러 가기' })).not.toBeInTheDocument();
  });
});
