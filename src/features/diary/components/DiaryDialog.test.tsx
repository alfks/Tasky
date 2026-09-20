// 작성/수정 다이얼로그 (diary.md §2·§5).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DIARY_CONTENT_MAX_LENGTH, diaryContentLength } from '@/domain/diary/diary.rules';
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

describe('글자 수 (§5, 500자 경계, 리뷰 Minor 1 — grapheme 기준)', () => {
  it('500자는 저장할 수 있고, 입력 상한(maxlength)은 카테고리와 같은 2배 여유를 둔다', async () => {
    const user = userEvent.setup();
    render(<DiaryDialog open entry={undefined} onClose={() => {}} onSaved={() => {}} />);

    const textarea = screen.getByRole('textbox', { name: '오늘 하루' });
    expect(textarea).toHaveAttribute('maxlength', String(DIARY_CONTENT_MAX_LENGTH * 2));

    await user.click(textarea);
    await user.paste('가'.repeat(DIARY_CONTENT_MAX_LENGTH));

    expect(textarea).toHaveValue('가'.repeat(DIARY_CONTENT_MAX_LENGTH));
    expect(screen.getByText('500 / 500')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '저장' })).not.toBeDisabled();
  });

  it('이모지처럼 코드 유닛이 2개인 글자도 카운터는 글자 수(grapheme)로 보여준다', async () => {
    const user = userEvent.setup();
    render(<DiaryDialog open entry={undefined} onClose={() => {}} onSaved={() => {}} />);

    const textarea = screen.getByRole('textbox', { name: '오늘 하루' }) as HTMLTextAreaElement;
    await user.click(textarea);
    // 😄 300개 = 코드 유닛 600(.length) · 그래핌 300 — 코드 유닛으로 셌다면 "600 / 500" 이 보였을 것.
    await user.paste('😄'.repeat(300));

    expect(textarea.value.length).toBe(600); // .length(코드 유닛)는 여전히 600
    expect(diaryContentLength(textarea.value)).toBe(300); // 카운터·검증은 300(그래핌)을 쓴다
    expect(screen.getByText('300 / 500')).toBeInTheDocument();
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

  it('490~500자 사이에서는 10자 단위로만 안내한다(리뷰 Nit — 매 글자 아님)', async () => {
    const user = userEvent.setup();
    render(<DiaryDialog open entry={undefined} onClose={() => {}} onSaved={() => {}} />);
    const textarea = screen.getByRole('textbox', { name: '오늘 하루' });
    const live = document.querySelector('[aria-live="polite"].sr-only') as HTMLElement;
    await user.click(textarea);

    await user.paste('가'.repeat(491)); // 10 의 배수가 아니다 → 조용
    expect(live).toHaveTextContent('');

    await user.type(textarea, '가'.repeat(9)); // 500 → 0자 남음(경계, 배수가 아니어도 항상 안내)
    expect(live).toHaveTextContent('0자 남음');
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

describe('초기 포커스 (§5, 리뷰 Minor 2 — Dialog 의 initialFocusRef 를 쓴다)', () => {
  it('새로 쓸 때는 이모지 선택이다', () => {
    render(<DiaryDialog open entry={undefined} onClose={() => {}} onSaved={() => {}} />);

    expect(screen.getByRole('radio', { name: '없음' })).toHaveFocus();
  });

  it(
    '닫기(✕) 버튼을 거치지 않고 한 번에 목표로 포커스가 간다(중간 상태 없음). ' +
      'Dialog 의 기본 폴백(첫 포커스 가능 요소 = ✕)이 아니라 initialFocusRef 를 실제로 ' +
      '쓰고 있다는 뜻이다 — 안 쓰면 .focus() 가 두 번(✕ → 목표) 불린다.',
    () => {
      const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');

      render(<DiaryDialog open entry={undefined} onClose={() => {}} onSaved={() => {}} />);

      expect(focusSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('radio', { name: '없음' })).toHaveFocus();
      focusSpy.mockRestore();
    },
  );

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
