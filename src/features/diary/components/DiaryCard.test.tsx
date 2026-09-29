// 오늘의 기록 카드 (diary.md §1~§5). 저장소는 memory 구현, 매 테스트 새로 주입한다.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { DiaryCard } from '@/features/diary/components/DiaryCard';
import { useDiaryStore } from '@/features/diary/store/diary-store';

import { dismissToast, ToastViewport, useToasts } from '@/components/ui/Toast';

const DATE = '2026-01-15' as DateKey;

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  useDiaryStore.setState({
    date: null,
    entry: undefined,
    status: 'idle',
    error: null,
    pendingRemoval: null,
  });
});

/** ShellToasts 와 같은 배선(구독) — `DdayPanelSection.test.tsx`와 같은 패턴. */
function Toasts() {
  const toasts = useToasts();
  return <ToastViewport toasts={toasts} onClose={dismissToast} />;
}

function renderWithToasts() {
  return render(
    <>
      <DiaryCard date={DATE} />
      <Toasts />
    </>,
  );
}

describe('빈 상태 (§2)', () => {
  it('기록이 없으면 안내 문구와 [+ 기록하기] 를 보여준다', async () => {
    render(<DiaryCard date={DATE} />);

    expect(await screen.findByText('오늘 하루 어땠나요?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ 기록하기' })).toBeInTheDocument();
  });
});

describe('조회 실패는 빈 상태와 다르다', () => {
  it('status가 error면 안내 문구 대신 오류 문구를 role=alert 로 보여준다', async () => {
    setRepositories({
      ...createMemoryRepositories(),
      diaryEntries: {
        getByDate: () => Promise.reject(new Error('boom')),
        list: () => Promise.resolve([]),
        upsert: () => Promise.resolve(),
      },
    });

    render(<DiaryCard date={DATE} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('저장하지 못했어요');
    expect(screen.queryByText('오늘 하루 어땠나요?')).not.toBeInTheDocument();
  });
});

describe('작성 → 수정 → 삭제 → 되돌리기 (키보드만, §5)', () => {
  it('전 구간을 키보드로 할 수 있다', async () => {
    const user = userEvent.setup();
    renderWithToasts();

    // 작성
    await user.click(await screen.findByRole('button', { name: '+ 기록하기' }));
    // 초기 포커스는 이모지 선택이다(diary §5) — 처음 여는 폼의 기본값은 "없음" 칸이다.
    expect(screen.getByRole('radio', { name: '없음' })).toHaveFocus();
    await user.click(screen.getByRole('radio', { name: '기쁨' }));
    await user.tab();
    expect(screen.getByRole('textbox', { name: '오늘 하루' })).toHaveFocus();
    await user.keyboard('산책하고 나니 개운했다');
    await user.keyboard('{Control>}{Enter}{/Control}');

    expect(await screen.findByText('산책하고 나니 개운했다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수정' })).toHaveFocus();

    // 수정 — 기존 값이 있으면 초기 포커스는 텍스트 영역 (diary §5)
    await user.click(screen.getByRole('button', { name: '수정' }));
    expect(screen.getByRole('textbox', { name: '오늘 하루' })).toHaveFocus();
    await user.clear(screen.getByRole('textbox', { name: '오늘 하루' }));
    await user.keyboard('고쳐 씀');
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByText('고쳐 씀')).toBeInTheDocument();

    // 삭제(⋯ 메뉴 안, R4) — 확인 없이 즉시 + 되돌리기 토스트
    await user.click(screen.getByRole('button', { name: '오늘의 기록 메뉴' }));
    await user.click(await screen.findByRole('menuitem', { name: '삭제' }));

    expect(screen.queryByText('고쳐 씀')).not.toBeInTheDocument();
    expect(await screen.findByText('오늘 하루 어땠나요?')).toBeInTheDocument();
    const undoButton = await screen.findByRole('button', { name: '되돌리기' });
    // 삭제 직후 포커스가 <body> 로 떨어지지 않고 되돌리기 토스트로 간다(R8 함정, focus-fallback 패턴).
    expect(undoButton).toHaveFocus();

    await user.click(undoButton);

    expect(await screen.findByText('고쳐 씀')).toBeInTheDocument();
  });

  it('이모지·본문이 둘 다 비면 저장 버튼이 비활성이다(R3)', async () => {
    const user = userEvent.setup();
    render(<DiaryCard date={DATE} />);

    await user.click(await screen.findByRole('button', { name: '+ 기록하기' }));

    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('삭제 뒤 토스트가 없어도 [+ 기록하기] 로 포커스가 떨어진다(폴백)', async () => {
    const user = userEvent.setup();
    // 토스트 뷰포트를 마운트하지 않는다 — 되돌리기 버튼이 존재하지 않는 경로를 재현한다.
    render(<DiaryCard date={DATE} />);
    await user.click(await screen.findByRole('button', { name: '+ 기록하기' }));
    await user.click(screen.getByRole('radio', { name: '기쁨' }));
    await user.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByRole('button', { name: '수정' });

    await user.click(screen.getByRole('button', { name: '오늘의 기록 메뉴' }));
    await user.click(await screen.findByRole('menuitem', { name: '삭제' }));

    const addButton = await screen.findByRole('button', { name: '+ 기록하기' });
    expect(addButton).toHaveFocus();
  });
});

describe('이모지만 있어도 감정이 낭독된다 (리뷰 Major — 접근성)', () => {
  it('이모지만 저장한 기록은 sr-only 텍스트로 감정 이름이 낭독된다', async () => {
    const user = userEvent.setup();
    render(<DiaryCard date={DATE} />);

    await user.click(await screen.findByRole('button', { name: '+ 기록하기' }));
    await user.click(screen.getByRole('radio', { name: '기쁨' }));
    await user.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByRole('button', { name: '수정' });

    // 이모지 그 자체(aria-hidden)를 뺀 텍스트에 "기쁨" 이 남아야 실브라우저 실측(오늘의
    // 기록수정" 뿐)이 재현되지 않는다 — sr-only 로만 존재해도 접근성 트리에는 있다.
    expect(screen.getByText('기쁨', { selector: '.sr-only' })).toBeInTheDocument();
  });

  it('이모지 + 본문이면 감정 이름과 본문이 함께 낭독된다', async () => {
    const user = userEvent.setup();
    render(<DiaryCard date={DATE} />);

    await user.click(await screen.findByRole('button', { name: '+ 기록하기' }));
    await user.click(screen.getByRole('radio', { name: '슬픔' }));
    await user.tab();
    await user.keyboard('비가 왔다');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await screen.findByRole('button', { name: '수정' });

    expect(screen.getByText('슬픔', { selector: '.sr-only' })).toBeInTheDocument();
    expect(screen.getByText('비가 왔다')).toBeInTheDocument();
  });
});

describe('사이드바용 표면 (diary.md §2 · app-shell R18)', () => {
  it('framed(기본)면 카드 껍질을 스스로 그리고, framed={false} 면 벗는다', async () => {
    const { unmount } = render(<DiaryCard date={DATE} />);
    const framed = screen.getByRole('region', { name: '오늘의 기록' });
    await within(framed).findByRole('button', { name: '+ 기록하기' });
    expect(framed).toHaveClass('border');
    unmount();

    render(<DiaryCard date={DATE} framed={false} />);
    const bare = screen.getByRole('region', { name: '오늘의 기록' });
    await within(bare).findByRole('button', { name: '+ 기록하기' });
    expect(bare).not.toHaveClass('border');
  });

  it('dateLabel 을 받으면 제목 아래에 그 날짜를 적는다 — 빈 상태·작성됨 둘 다', async () => {
    const user = userEvent.setup();
    render(<DiaryCard date={DATE} dateLabel="1월 15일 (목)" />);
    await screen.findByRole('button', { name: '+ 기록하기' });
    expect(screen.getByText('1월 15일 (목)')).toBeInTheDocument();
    // 제목(접근 이름)은 그대로다 — 날짜는 부제이지 이름이 아니다.
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('오늘의 기록');

    await user.click(screen.getByRole('button', { name: '+ 기록하기' }));
    await user.click(screen.getByRole('radio', { name: '기쁨' }));
    await user.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByRole('button', { name: '수정' });
    expect(screen.getByText('1월 15일 (목)')).toBeInTheDocument();
  });

  it('dateLabel 이 없으면 날짜 줄이 없다', async () => {
    render(<DiaryCard date={DATE} />);
    await screen.findByRole('button', { name: '+ 기록하기' });
    expect(screen.queryByText(/\d+월 \d+일/)).not.toBeInTheDocument();
  });
});
