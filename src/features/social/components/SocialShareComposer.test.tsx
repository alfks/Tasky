import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';

import { SocialShareComposer } from '@/features/social/components/SocialShareComposer';

vi.mock('@/features/social/hooks/useCompletedSharePicker', () => ({
  useCompletedSharePicker: () => ({
    date: '2026-09-28',
    setDate: vi.fn(),
    items: [
      {
        id: 'private-1',
        title: '달리기',
        date: '2026-09-28',
        done: true,
        memo: '비공개 메모',
        categoryId: 'private-category',
      },
      {
        id: 'private-2',
        title: '독서',
        date: '2026-09-28',
        done: true,
        memo: '또 다른 비공개 메모',
        categoryId: 'private-category',
      },
    ],
    phase: 'ready',
    retry: vi.fn(),
  }),
}));

function show(onPublish = vi.fn(async () => true)) {
  render(
    <SocialShareComposer
      visible
      initialDate={'2026-09-28' as DateKey}
      hasFriends={false}
      busy={false}
      onPublish={onPublish}
      onDone={vi.fn()}
      onDirtyChange={vi.fn()}
    />,
  );
  return onPublish;
}

describe('공유 작성 확인', () => {
  it('원본 메모·카테고리·ID를 표시하거나 보내지 않고 명시 버튼에서만 게시한다', async () => {
    const publish = show();
    await userEvent.click(screen.getByRole('button', { name: '달리기' }));
    expect(publish).not.toHaveBeenCalled();
    expect(screen.queryByText('비공개 메모')).not.toBeInTheDocument();
    expect(screen.queryByText('private-category')).not.toBeInTheDocument();
    expect(screen.getByText(/앞으로 추가할 친구가 볼 수 있어요/)).toBeInTheDocument();

    await userEvent.clear(screen.getByRole('textbox', { name: '공개 문장' }));
    await userEvent.type(screen.getByRole('textbox', { name: '공개 문장' }), '오늘 달리기 완료');
    expect(publish).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '친구에게 공유' }));
    expect(publish).toHaveBeenCalledWith({ text: '오늘 달리기 완료', happenedOn: '2026-09-28' });
  });

  it('편집한 문장이 있을 때 다른 기록 선택을 확인 없이 덮지 않는다', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: '달리기' }));
    const text = screen.getByRole('textbox', { name: '공개 문장' });
    await userEvent.clear(text);
    await userEvent.type(text, '내가 고친 공개 문장');
    await userEvent.click(screen.getByRole('button', { name: '독서' }));
    const confirm = screen.getByRole('alertdialog');
    expect(text).toHaveValue('내가 고친 공개 문장');
    await userEvent.click(within(confirm).getByRole('button', { name: '계속 작성' }));
    expect(text).toHaveValue('내가 고친 공개 문장');
  });
});
