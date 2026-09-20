// 작성/수정 다이얼로그 (diary.md §2·§5).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { DIARY_CONTENT_MAX_LENGTH } from '@/domain/diary/diary.rules';
import { MOOD_EMOJIS } from '@/domain/diary/mood-emoji';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { DiaryDialog } from '@/features/diary/components/DiaryDialog';
import { useDiaryStore } from '@/features/diary/store/diary-store';

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  useDiaryStore.setState({
    date: '2026-01-15' as never,
    entry: undefined,
    status: 'ready',
    error: null,
    pendingRemoval: null,
  });
});

describe('기분 이모지 (R3, category R4-a와 같은 조작)', () => {
  it('제공 목록 24개 + "없음" 이 radiogroup 으로 보인다', () => {
    render(<DiaryDialog open entry={undefined} onClose={() => {}} onSaved={() => {}} />);

    expect(screen.getByRole('radiogroup', { name: '기분' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(MOOD_EMOJIS.length + 1); // + "없음"
  });

  it('방향키로 다음 칸으로 옮긴다', async () => {
    const user = userEvent.setup();
    render(<DiaryDialog open entry={undefined} onClose={() => {}} onSaved={() => {}} />);

    screen.getByRole('radio', { name: '없음' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('radio', { name: MOOD_EMOJIS[0].name })).toHaveFocus();
  });
});

describe('글자 수 (§5, 500자 경계)', () => {
  it('500자는 저장할 수 있고, 입력 상한 자체가 500자다(경계)', async () => {
    const user = userEvent.setup();
    render(<DiaryDialog open entry={undefined} onClose={() => {}} onSaved={() => {}} />);

    const textarea = screen.getByRole('textbox', { name: '오늘 하루' });
    expect(textarea).toHaveAttribute('maxlength', String(DIARY_CONTENT_MAX_LENGTH));

    await user.click(textarea);
    await user.paste('가'.repeat(DIARY_CONTENT_MAX_LENGTH));

    expect(textarea).toHaveValue('가'.repeat(DIARY_CONTENT_MAX_LENGTH));
    expect(screen.getByRole('button', { name: '저장' })).not.toBeDisabled();
  });

  it('490자 미만에서는 aria-live 영역이 비어 있다(매 입력마다 안내하지 않는다)', async () => {
    const user = userEvent.setup();
    render(<DiaryDialog open entry={undefined} onClose={() => {}} onSaved={() => {}} />);

    await user.click(screen.getByRole('textbox', { name: '오늘 하루' }));
    await user.paste('가'.repeat(100));

    const live = document.querySelector('[aria-live="polite"].sr-only');
    expect(live).toHaveTextContent('');
  });

  it('490자에 이르면 aria-live 영역이 남은 수를 안내한다', async () => {
    const user = userEvent.setup();
    render(<DiaryDialog open entry={undefined} onClose={() => {}} onSaved={() => {}} />);

    await user.click(screen.getByRole('textbox', { name: '오늘 하루' }));
    await user.paste('가'.repeat(490));

    const live = document.querySelector('[aria-live="polite"].sr-only');
    expect(live).toHaveTextContent('10자 남음');
  });
});

describe('빈 값 (R3)', () => {
  it('이모지·본문이 둘 다 비면 저장 버튼이 비활성이다', () => {
    render(<DiaryDialog open entry={undefined} onClose={() => {}} onSaved={() => {}} />);

    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('이모지만 있어도 저장 버튼이 활성이다', async () => {
    const user = userEvent.setup();
    render(<DiaryDialog open entry={undefined} onClose={() => {}} onSaved={() => {}} />);

    await user.click(screen.getByRole('radio', { name: MOOD_EMOJIS[0].name }));

    expect(screen.getByRole('button', { name: '저장' })).not.toBeDisabled();
  });
});

describe('초기 포커스 (§5)', () => {
  it('새로 쓸 때는 이모지 선택이다', () => {
    render(<DiaryDialog open entry={undefined} onClose={() => {}} onSaved={() => {}} />);

    expect(screen.getByRole('radio', { name: '없음' })).toHaveFocus();
  });

  it('기존 값이 있으면 텍스트 영역이다', () => {
    render(
      <DiaryDialog
        open
        entry={{
          id: 'x',
          createdAt: '2026-01-15T00:00:00.000Z',
          updatedAt: '2026-01-15T00:00:00.000Z',
          rev: 1,
          date: '2026-01-15' as never,
          emoji: MOOD_EMOJIS[0].emoji,
          content: '기록',
        }}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    expect(screen.getByRole('textbox', { name: '오늘 하루' })).toHaveFocus();
  });
});
