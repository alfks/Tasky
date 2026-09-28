import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PostView } from '@/domain/social/social';

import { SocialFeedCard } from '@/features/social/components/SocialFeedCard';

const POST: PostView = {
  id: 'a'.repeat(32),
  author: { id: 'b'.repeat(32), nickname: '친구' },
  text: '공유 문장',
  happenedOn: '2026-09-28',
  createdAt: 1_780_000_000_000,
  reactionCount: 2,
  myReaction: true,
};

describe('피드 카드 권한과 명시 차단', () => {
  it('read-only에서는 기존 응원 철회만 허용하고 카드 문맥을 버튼 이름에 담는다', async () => {
    const onReact = vi.fn(async () => true);
    render(
      <SocialFeedCard
        post={POST}
        mode="read-only"
        ownProfileId={null}
        busy={false}
        onReact={onReact}
        onBlock={vi.fn(async () => true)}
      />,
    );
    const cheer = screen.getByRole('button', { name: /친구님의 2026-09-28 공유 응원 2개/ });
    expect(cheer).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(cheer);
    expect(onReact).toHaveBeenCalledWith(POST.id, false);
  });

  it('차단은 더 보기와 확인을 거친 뒤에만 요청한다', async () => {
    const onBlock = vi.fn(async () => true);
    render(
      <SocialFeedCard
        post={{ ...POST, myReaction: false }}
        mode="enabled"
        ownProfileId={null}
        busy={false}
        onReact={vi.fn(async () => true)}
        onBlock={onBlock}
      />,
    );
    expect(onBlock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '친구님 공유 더 보기' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '사용자 차단' }));
    expect(onBlock).not.toHaveBeenCalled();
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: '차단' }),
    );
    expect(onBlock).toHaveBeenCalledWith(POST.author.id);
  });
});
