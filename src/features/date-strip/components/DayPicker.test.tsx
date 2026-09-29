// DayPicker 는 DayPickerPopover 가 Popover 안에서 지연 로드하는 피커 본문이다(calendar-layout.md
// §3-A). 컴포넌트 자체는 앵커를 모르므로 YearMonthPicker.test 와 같은 배선(Popover + 앵커 버튼)을
// 여기서 세워 Esc·포커스 복귀까지 자기 완결적으로 검증한다.
import { useRef, useState } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';

import { DayPicker } from '@/features/date-strip/components/DayPicker';

import { Popover } from '@/components/ui/Popover';

function renderPicker(
  props: Partial<{
    value: DateKey;
    today: DateKey;
    hint: string;
    onPick: (date: DateKey) => void;
  }> = {},
) {
  const value = props.value ?? '2026-09-17';
  const today = props.today ?? '2026-09-17';
  const onPick = props.onPick ?? vi.fn();

  function Harness() {
    const anchorRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(true);
    return (
      <div>
        <button ref={anchorRef} type="button">
          앵커
        </button>
        <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} autoFocus={false}>
          <DayPicker
            value={value}
            today={today}
            hint={props.hint}
            onPick={(date) => {
              onPick(date);
              setOpen(false);
            }}
          />
        </Popover>
      </div>
    );
  }

  render(<Harness />);
  return { onPick };
}

const grid = () => screen.getByRole('grid', { name: '날짜 고르기' });
const cell = (name: string | RegExp) => screen.getByRole('gridcell', { name });
/** 화면에 보이는 월 텍스트(즉시 갱신) — sr-only 디바운스 노드와는 별개다. */
const monthText = () =>
  screen.getByText(/^\d{4}년 \d{1,2}월$/, { selector: 'span:not([aria-live])' });

describe('R16-a. 열리면 포커스는 현재 값의 칸이다', () => {
  it('값이 오늘이면 이름에 ", 오늘" 이 붙은 칸에 포커스한다', () => {
    renderPicker({ value: '2026-09-17', today: '2026-09-17' });
    expect(cell('9월 17일 목요일, 오늘')).toHaveFocus();
  });

  it('값이 오늘과 다르면 그 날짜 칸이고 오늘 칸에는 ", 오늘" 만 붙는다', () => {
    renderPicker({ value: '2026-09-03', today: '2026-09-17' });
    expect(cell('9월 3일 목요일')).toHaveFocus();
    expect(cell('9월 17일 목요일, 오늘')).not.toHaveFocus();
  });
});

describe('R17-a. 역할과 접근 이름', () => {
  it('격자는 grid "날짜 고르기", 요일 7개 columnheader, 칸은 gridcell 이고 값 칸만 aria-selected 다', () => {
    renderPicker({ value: '2026-09-17', today: '2026-01-01' });
    expect(grid()).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      '월',
      '화',
      '수',
      '목',
      '금',
      '토',
      '일',
    ]);
    expect(cell('9월 17일 목요일')).toHaveAttribute('aria-selected', 'true');
    expect(cell('9월 18일 금요일')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('button', { name: '이전 달' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음 달' })).toBeInTheDocument();
  });

  it('격자는 어느 달이든 6줄·42칸이다 — 부족한 줄은 다음 달로 채운다(R15-a)', () => {
    renderPicker({ value: '2026-09-17', today: '2026-01-01' });
    // 요일 머리글 줄 1 + 날짜 줄 6.
    expect(screen.getAllByRole('row')).toHaveLength(7);
    expect(screen.getAllByRole('gridcell')).toHaveLength(42);
    // 9월은 5줄 달 — 마지막 줄은 10월 5~11일이다.
    expect(cell('10월 11일 일요일')).toBeInTheDocument();
  });

  it('힌트는 주었을 때만 보인다', () => {
    renderPicker({ hint: '어느 날로 옮길까요?' });
    expect(screen.getByText('어느 날로 옮길까요?')).toBeInTheDocument();
  });

  it('힌트를 주지 않으면 없다', () => {
    renderPicker();
    expect(screen.queryByText('어느 날로 옮길까요?')).toBeNull();
  });

  it('시각 월 텍스트는 aria-hidden 이고 낭독은 sr-only 라이브 노드 하나뿐이다', () => {
    renderPicker();
    expect(monthText()).toHaveAttribute('aria-hidden', 'true');
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('2026년 9월');
  });
});

describe('R15-a. 확정은 onPick 을 한 번만 부르고 팝오버를 닫는다', () => {
  it('칸 클릭', async () => {
    const user = userEvent.setup();
    const { onPick } = renderPicker({ value: '2026-09-17' });
    await user.click(cell('9월 25일 금요일'));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('2026-09-25');
    expect(screen.queryByRole('grid', { name: '날짜 고르기' })).toBeNull();
  });

  it('이 달 밖(회색) 칸도 클릭 한 번으로 확정된다', async () => {
    const user = userEvent.setup();
    const { onPick } = renderPicker({ value: '2026-09-17', today: '2026-01-01' });
    // 2026년 9월 격자의 마지막 줄은 10월 1~4일이다.
    await user.click(cell('10월 2일 금요일'));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('2026-10-02');
  });

  it('[오늘]·[내일] 은 값이 다를 때만 활성이고 각각 오늘·내일로 확정한다', async () => {
    const user = userEvent.setup();
    const { onPick } = renderPicker({ value: '2026-09-03', today: '2026-09-17' });
    await user.click(screen.getByRole('button', { name: '내일' }));
    expect(onPick).toHaveBeenCalledWith('2026-09-18');
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('값이 오늘이면 [오늘] 이, 내일이면 [내일] 이 비활성이다', () => {
    renderPicker({ value: '2026-09-17', today: '2026-09-17' });
    expect(screen.getByRole('button', { name: '오늘' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '내일' })).toBeEnabled();
  });

  it('[오늘] 은 오늘로 확정한다', async () => {
    const user = userEvent.setup();
    const { onPick } = renderPicker({ value: '2026-09-18', today: '2026-09-17' });
    expect(screen.getByRole('button', { name: '내일' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '오늘' }));
    expect(onPick).toHaveBeenCalledWith('2026-09-17');
  });

  it('키보드 Enter 로 확정해도 한 번만 불린다', async () => {
    const user = userEvent.setup();
    const { onPick } = renderPicker({ value: '2026-09-17' });
    await user.keyboard('{ArrowRight}{Enter}');
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('2026-09-18');
  });

  it('Space 로도 한 번만 확정된다', async () => {
    const user = userEvent.setup();
    const { onPick } = renderPicker({ value: '2026-09-17' });
    await user.keyboard('{ArrowDown} ');
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('2026-09-24');
  });
});

describe('R16-a. 격자 키 맵', () => {
  it('←/→ 는 ±1일', async () => {
    const user = userEvent.setup();
    renderPicker({ value: '2026-09-17', today: '2026-01-01' });
    await user.keyboard('{ArrowRight}');
    expect(cell('9월 18일 금요일')).toHaveFocus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(cell('9월 16일 수요일')).toHaveFocus();
  });

  it('↑/↓ 는 ±7일', async () => {
    const user = userEvent.setup();
    renderPicker({ value: '2026-09-17', today: '2026-01-01' });
    await user.keyboard('{ArrowDown}');
    expect(cell('9월 24일 목요일')).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(cell('9월 10일 목요일')).toHaveFocus();
  });

  it('Home/End 는 그 줄의 월요일/일요일', async () => {
    const user = userEvent.setup();
    renderPicker({ value: '2026-09-17', today: '2026-01-01' });
    await user.keyboard('{Home}');
    expect(cell('9월 14일 월요일')).toHaveFocus();
    await user.keyboard('{End}');
    expect(cell('9월 20일 일요일')).toHaveFocus();
  });

  it('달 경계를 넘으면 격자가 그 달로 바뀌고 포커스가 따라간다', async () => {
    const user = userEvent.setup();
    renderPicker({ value: '2026-09-30', today: '2026-01-01' });
    await user.keyboard('{ArrowRight}');
    expect(monthText()).toHaveTextContent('2026년 10월');
    expect(cell('10월 1일 목요일')).toHaveFocus();
  });

  it('PageUp/PageDown 은 ±1달이고 일을 유지한다', async () => {
    const user = userEvent.setup();
    renderPicker({ value: '2026-09-17', today: '2026-01-01' });
    await user.keyboard('{PageUp}');
    expect(monthText()).toHaveTextContent('2026년 8월');
    expect(cell('8월 17일 월요일')).toHaveFocus();
    await user.keyboard('{PageDown}{PageDown}');
    expect(monthText()).toHaveTextContent('2026년 10월');
    expect(cell('10월 17일 토요일')).toHaveFocus();
  });

  it('PageDown 이 말일을 자른다 — 1월 31일에서 2월 28일', async () => {
    const user = userEvent.setup();
    renderPicker({ value: '2026-01-31', today: '2026-01-01' });
    await user.keyboard('{PageDown}');
    expect(cell('2월 28일 토요일')).toHaveFocus();
  });
});

describe('R15-a. 이전 달/다음 달 버튼', () => {
  it('격자만 옮기고 포커스는 버튼에 남는다', async () => {
    const user = userEvent.setup();
    renderPicker({ value: '2026-09-17', today: '2026-01-01' });
    const next = screen.getByRole('button', { name: '다음 달' });
    await user.click(next);
    expect(monthText()).toHaveTextContent('2026년 10월');
    expect(next).toHaveFocus();
    // 값은 10월에 없으니 어떤 칸도 선택 상태가 아니다.
    expect(screen.queryAllByRole('gridcell', { selected: true })).toHaveLength(0);
  });

  it('달이 바뀌는 순간 크로스페이드는 motion-safe: 로만 걸린다(R19-a)', () => {
    renderPicker();
    // 동기 클릭 — 페이드는 다음 프레임에 끝나므로(rAF) 비동기 `user.click` 뒤에는 이미 지나가 있다.
    fireEvent.click(screen.getByRole('button', { name: '다음 달' }));
    const classes = grid().className.split(' ');
    expect(classes).toContain('motion-safe:opacity-0');
    expect(classes).not.toContain('opacity-0');
  });
});

describe('R6. 범위 밖', () => {
  it('1970년 1월 격자의 1969년 칸은 disabled 이고 [이전 달] 은 aria-disabled 로 포커스를 유지한다', async () => {
    const user = userEvent.setup();
    renderPicker({ value: '1970-01-01', today: '1970-01-01' });
    expect(cell('12월 31일 수요일')).toBeDisabled();
    expect(cell('1월 1일 목요일, 오늘')).toBeEnabled();

    const prev = screen.getByRole('button', { name: '이전 달' });
    expect(prev).toHaveAttribute('aria-disabled', 'true');
    prev.focus();
    await user.keyboard('{Enter}');
    expect(monthText()).toHaveTextContent('1970년 1월');
    expect(prev).toHaveFocus();
  });

  it('←/PageUp 으로 범위 밖으로는 못 나간다', async () => {
    const user = userEvent.setup();
    renderPicker({ value: '1970-01-01', today: '1970-01-01' });
    await user.keyboard('{ArrowLeft}{PageUp}');
    expect(cell('1월 1일 목요일, 오늘')).toHaveFocus();
  });
});

describe('R16-a. Esc 는 변경 없이 닫히고 포커스가 앵커로 돌아온다', () => {
  it('변경 없음 + 앵커 복귀', async () => {
    const user = userEvent.setup();
    const { onPick } = renderPicker();
    await user.keyboard('{ArrowRight}{Escape}');
    expect(screen.queryByRole('grid', { name: '날짜 고르기' })).toBeNull();
    expect(screen.getByRole('button', { name: '앵커' })).toHaveFocus();
    expect(onPick).not.toHaveBeenCalled();
  });
});
