import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PublicScreen } from '@/features/social/components/PublicScreen';

type Phase = 'loading' | 'ready';
const feed = vi.hoisted(() => ({
  phase: 'ready' as Phase,
  nextCursor: null as string | null,
}));

vi.mock('@/features/social/hooks/usePublicFeed', () => ({
  usePublicFeed: () => ({
    snapshot: { phase: feed.phase, error: null, pageIndex: 0, nextCursor: feed.nextCursor },
    items: [],
    refresh: vi.fn().mockResolvedValue(undefined),
    next: vi.fn().mockResolvedValue(undefined),
    previous: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('PublicScreen 로딩·빈 피드 표시', () => {
  beforeEach(() => {
    feed.phase = 'ready';
    feed.nextCursor = null;
  });

  it('불러오는 중에는 문장과 함께 장식용 스피너를 그린다', () => {
    feed.phase = 'loading';
    render(<PublicScreen />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('공개 기록을 불러오는 중');
    expect(status.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('빈 피드는 배너로 안내하고 닫기를 누르면 사라진다', () => {
    render(<PublicScreen />);
    expect(screen.getByRole('status')).toHaveTextContent('아직 모두 공개로 공유한 기록이 없어요.');
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
