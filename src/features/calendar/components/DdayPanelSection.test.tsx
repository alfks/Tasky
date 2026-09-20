// D-day 카드 (calendar.md R1~R6). 저장소는 memory 구현, 날짜 스트립은 고정된 today 로 결정적으로 만든다.
import { render, screen } from '@testing-library/react';
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

describe('조회 실패 (리뷰 라운드 1 Minor-7)', () => {
  it('조회가 실패하면 빈 상태 문구가 아니라 오류를 보여준다 (TodoList.tsx 와 같은 패턴)', async () => {
    // 마운트 즉시 `load()` 가 돌므로 상태를 미리 심어도 곧바로 덮인다 — 저장소 자체를 실패시킨다.
    setRepositories({
      ...createMemoryRepositories(),
      dday: {
        list: () => Promise.reject(new Error('boom')),
        upsert: () => Promise.resolve(),
      },
    });
    render(<DdayPanelSection />);

    expect(await screen.findByRole('alert')).toHaveTextContent('저장하지 못했어요');
    expect(screen.queryByText('다가오는 날을 기록해 보세요')).not.toBeInTheDocument();
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
    // 저장 성공 후 폼은 닫히고 다시 [+ D-day 추가] 가 보인다 — 포커스도 그 버튼으로 돌아온다
    // (리뷰 라운드 1 Major-2: 저장으로 닫는 경로도 Esc 와 같은 방식으로 opener 를 되찾아야 한다).
    const opener = screen.getByRole('button', { name: '+ D-day 추가' });
    expect(opener).toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('빈 제목은 인라인 오류를 보여주고 폼을 유지한다', async () => {
    const user = userEvent.setup();
    render(<DdayPanelSection />);

    await user.click(screen.getByRole('button', { name: '+ D-day 추가' }));
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('제목을 입력해 주세요');
    expect(screen.getByRole('textbox', { name: 'D-day 제목' })).toBeInTheDocument();
  });

  it('Esc 로 폼을 취소하면 [+ D-day 추가] 로 포커스가 돌아온다 (포커스가 body 로 떨어지지 않는다, Major-2)', async () => {
    const user = userEvent.setup();
    render(<DdayPanelSection />);

    await user.click(screen.getByRole('button', { name: '+ D-day 추가' }));
    await user.keyboard('{Escape}');

    // 닫히면서 [+ D-day 추가] 버튼은 **새로 마운트된다**(DdayAddForm ↔ Button 이 조건부로 갈아
    // 끼워지므로 — TodoAddRow.test.tsx 의 같은 자리와 같은 이유) — 그래서 닫기 전 참조가 아니라
    // 다시 쿼리한 버튼에 포커스를 단언한다.
    expect(screen.getByRole('button', { name: '+ D-day 추가' })).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);
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

  /**
   * **우회 없이** — 삭제도 되돌리기도 `user.tab()`/`{Enter}` 로만 간다(리뷰 라운드 1 Major-3).
   * 예전 버전은 삭제를 `user.click`, 되돌리기는 `undoButton.focus()` 로 건너뛰어 Major-1·Major-2가
   * 고친 "포커스가 body 로 떨어진다" 결함을 그대로 통과시켰다 — 이제 각 단계마다
   * `document.activeElement !== document.body` 를 함께 단언해 그 결함이 돌아오면 여기서 잡는다.
   */
  it('키보드만으로 추가·삭제·되돌리기를 할 수 있다 (우회 없음)', async () => {
    const user = userEvent.setup();
    renderWithToasts();

    await user.tab(); // [+ D-day 추가]
    expect(screen.getByRole('button', { name: '+ D-day 추가' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.type(screen.getByRole('textbox', { name: 'D-day 제목' }), '생일');
    await user.type(screen.getByLabelText('D-day 날짜'), '2026-01-27');
    await user.keyboard('{Enter}');
    expect(await screen.findByText('생일')).toBeInTheDocument();
    // 저장으로 닫힌 폼 — 포커스는 (새로 마운트된) [+ D-day 추가] 로 돌아온다 (Major-2).
    expect(screen.getByRole('button', { name: '+ D-day 추가' })).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);

    // 목록이 [+ D-day 추가] **위**에 있으므로(DOM 순서), 방금 만든 행으로는 Shift+Tab 으로 거슬러
    // 올라간다 — opener 바로 앞 탭 정지점이 그 행의 ✕ 다.
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: '생일 삭제' })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(screen.queryByText('생일')).not.toBeInTheDocument();

    // 되돌리기 토스트의 버튼으로 포커스가 옮겨 온다 — <body> 로 떨어지면 다음 Tab 이 문서 맨 위로
    // 튄다(Major-1, useRemovalReturnFocus.ts 실측: 옛 경로는 Tab 29회가 필요했다).
    const undoButton = await screen.findByRole('button', { name: '되돌리기' });
    expect(undoButton).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);

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
