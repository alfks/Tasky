// D-day 카드 (calendar.md R1~R6). 저장소는 memory 구현, 날짜 스트립은 고정된 today 로 결정적으로 만든다.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { DdayPanelSection } from '@/features/calendar/components/DdayPanelSection';
import { useDdayStore } from '@/features/calendar/store/dday-store';
import { useDateStripStore } from '@/features/date-strip';

import { dismissToast, ToastViewport, useToasts } from '@/components/ui/Toast';

const TODAY = '2026-01-15' as DateKey;

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  useDdayStore.setState({ ddays: [], status: 'idle', error: null, pendingRemoval: null });
  useDateStripStore.setState({ today: TODAY, selectedDate: TODAY, view: 'week' });
});

/** ShellToasts 와 같은 배선(구독) — [되돌리기]를 실제로 누르는 테스트가 쓴다. */
function Toasts() {
  const toasts = useToasts();
  return <ToastViewport toasts={toasts} onClose={dismissToast} />;
}

function renderWithToasts() {
  return render(
    <>
      <DdayPanelSection />
      <Toasts />
    </>,
  );
}

describe('빈 상태', () => {
  it('D-day 가 없으면 안내 문구를 보여준다', () => {
    render(<DdayPanelSection />);

    expect(screen.getByText('다가오는 날을 기록해 보세요')).toBeInTheDocument();
  });
});

describe('추가 (R1, §5)', () => {
  it('제목·날짜를 입력하고 Enter 로 저장하면 목록에 임박순으로 더해진다', async () => {
    const user = userEvent.setup();
    render(<DdayPanelSection />);

    await user.click(screen.getByRole('button', { name: '+ D-day 추가' }));
    expect(screen.getByRole('textbox', { name: 'D-day 제목' })).toHaveFocus();

    await user.type(screen.getByRole('textbox', { name: 'D-day 제목' }), '생일');
    await user.type(screen.getByLabelText('D-day 날짜'), '2026-01-27');
    await user.keyboard('{Enter}');

    expect(await screen.findByText('생일')).toBeInTheDocument();
    expect(screen.getByText('D-12')).toBeInTheDocument();
    // 저장 성공 후 폼은 닫히고 다시 [+ D-day 추가] 가 보인다.
    expect(screen.getByRole('button', { name: '+ D-day 추가' })).toBeInTheDocument();
  });

  it('빈 제목은 인라인 오류를 보여주고 폼을 유지한다', async () => {
    const user = userEvent.setup();
    render(<DdayPanelSection />);

    await user.click(screen.getByRole('button', { name: '+ D-day 추가' }));
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('제목을 입력해 주세요');
    expect(screen.getByRole('textbox', { name: 'D-day 제목' })).toBeInTheDocument();
  });

  it('Esc 로 폼을 취소한다', async () => {
    const user = userEvent.setup();
    render(<DdayPanelSection />);

    await user.click(screen.getByRole('button', { name: '+ D-day 추가' }));
    await user.keyboard('{Escape}');

    expect(screen.getByRole('button', { name: '+ D-day 추가' })).toBeInTheDocument();
  });
});

describe('항목 클릭 → 날짜 스트립 선택 이동 (R6, date-strip 선택 로직 재사용)', () => {
  it('행을 클릭하면 선택 날짜가 그 D-day 날짜로 바뀐다', async () => {
    const user = userEvent.setup();
    await useDdayStore.getState().add({ title: '발표', date: '2026-02-01' });
    render(<DdayPanelSection />);

    await user.click(screen.getByRole('button', { name: /발표까지/ }));

    expect(useDateStripStore.getState().selectedDate).toBe('2026-02-01');
  });
});

describe('삭제 + 되돌리기 (R5)', () => {
  it('✕ 를 누르면 즉시 사라지고, 토스트의 되돌리기로 다시 나타난다', async () => {
    const user = userEvent.setup();
    await useDdayStore.getState().add({ title: '생일', date: '2026-01-27' });
    renderWithToasts();
    expect(screen.getByText('생일')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '생일 삭제' }));

    expect(screen.queryByText('생일')).not.toBeInTheDocument();
    const undoButton = await screen.findByRole('button', { name: '되돌리기' });

    await user.click(undoButton);

    expect(await screen.findByText('생일')).toBeInTheDocument();
  });

  it('키보드만으로 추가·삭제·되돌리기를 할 수 있다', async () => {
    const user = userEvent.setup();
    renderWithToasts();

    await user.tab(); // [+ D-day 추가]
    await user.keyboard('{Enter}');
    await user.type(screen.getByRole('textbox', { name: 'D-day 제목' }), '생일');
    await user.type(screen.getByLabelText('D-day 날짜'), '2026-01-27');
    await user.keyboard('{Enter}');
    expect(await screen.findByText('생일')).toBeInTheDocument();

    const row = within(screen.getByText('생일').closest('li') as HTMLElement);
    await user.click(row.getByRole('button', { name: '생일 삭제' }));
    expect(screen.queryByText('생일')).not.toBeInTheDocument();

    const undoButton = await screen.findByRole('button', { name: '되돌리기' });
    undoButton.focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByText('생일')).toBeInTheDocument();
  });
});

describe('지난 날 (R2)', () => {
  it('접혀 있다가 펼치면 최근순으로 보인다', async () => {
    const user = userEvent.setup();
    await useDdayStore.getState().add({ title: '옛날 일1', date: '2025-12-01' });
    await useDdayStore.getState().add({ title: '옛날 일2', date: '2026-01-10' });
    render(<DdayPanelSection />);

    expect(screen.queryByText('옛날 일1')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /지난 날 \(2\)/ }));

    const names = screen.getAllByText(/옛날 일/).map((el) => el.textContent);
    expect(names).toEqual(['옛날 일2', '옛날 일1']);
  });
});
