// YearMonthPicker 는 DateStripHeader 가 Popover 안에서 지연 로드하는 피커 본문이다
// (calendar-layout.md §3 R15~R19). 컴포넌트 자체는 앵커를 모르므로, DateStripHeader 와 같은
// 배선(Popover + 앵커 버튼)을 여기서 직접 세워 R16 의 Esc·포커스 복귀까지 자기 완결적으로 검증한다.
import { useRef, useState } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';

import { YearMonthPicker } from '@/features/date-strip/components/YearMonthPicker';

import { Popover } from '@/components/ui/Popover';

function renderPicker(
  props: Partial<{ selectedDate: DateKey; today: DateKey; onSelect: (date: DateKey) => void }> = {},
) {
  const selectedDate = props.selectedDate ?? '2026-09-17';
  const today = props.today ?? '2026-09-17';
  const onSelect = props.onSelect ?? vi.fn();

  function Harness() {
    const anchorRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(true);
    return (
      <div>
        <button ref={anchorRef} type="button">
          앵커
        </button>
        <Popover
          open={open}
          onClose={() => setOpen(false)}
          anchorRef={anchorRef}
          label="연도와 월 선택"
          autoFocus={false}
        >
          <YearMonthPicker
            selectedDate={selectedDate}
            today={today}
            onSelect={(date) => {
              onSelect(date);
              setOpen(false);
            }}
          />
        </Popover>
      </div>
    );
  }

  render(<Harness />);
  return { onSelect };
}

const yearText = () => screen.getByText(/^\d{4}$/);
const monthRadio = (name: string | RegExp) => screen.getByRole('radio', { name });

describe('R16. 열리면 포커스는 선택된 달의 월 버튼이다', () => {
  it('선택 날짜가 오늘과 같은 달이면 이름에 ", 이번 달" 이 붙는다', () => {
    renderPicker({ selectedDate: '2026-09-17', today: '2026-09-17' });
    expect(monthRadio('9월, 이번 달')).toHaveFocus();
  });

  it('오늘과 다른 달이면 그냥 "N월" 에 포커스한다', () => {
    renderPicker({ selectedDate: '2026-03-15', today: '2026-09-17' });
    expect(monthRadio('3월')).toHaveFocus();
  });
});

describe('R17. 역할과 접근 이름', () => {
  it('팝오버는 "연도와 월 선택", 년 텍스트는 aria-live=polite, 월 격자는 "월 선택" 라디오그룹이다', () => {
    renderPicker();
    expect(screen.getByRole('group', { name: '연도와 월 선택' })).toBeInTheDocument();
    expect(yearText()).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('radiogroup', { name: '월 선택' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이전 해' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음 해' })).toBeInTheDocument();
  });

  it('선택된 달의 라디오만 aria-checked 다', () => {
    renderPicker({ selectedDate: '2026-09-17' });
    expect(monthRadio('9월, 이번 달')).toHaveAttribute('aria-checked', 'true');
    expect(monthRadio('12월')).toHaveAttribute('aria-checked', 'false');
  });

  it('범위 끝에서 년 스테퍼가 disabled 다(R15)', () => {
    renderPicker({ selectedDate: '1970-05-10', today: '1970-05-10' });
    expect(screen.getByRole('button', { name: '이전 해' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음 해' })).toBeEnabled();
  });
});

describe('R16. 월 격자 키 맵', () => {
  it('ArrowRight/ArrowLeft 는 ±1달이다', async () => {
    const user = userEvent.setup();
    renderPicker({ selectedDate: '2026-09-17', today: '2026-01-01' });
    await user.keyboard('{ArrowRight}');
    expect(monthRadio('10월')).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    await user.keyboard('{ArrowLeft}');
    expect(monthRadio('8월')).toHaveFocus();
  });

  it('ArrowUp/ArrowDown 은 ±3달이다', async () => {
    const user = userEvent.setup();
    renderPicker({ selectedDate: '2026-09-17', today: '2026-01-01' });
    await user.keyboard('{ArrowDown}');
    expect(monthRadio('12월')).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    await user.keyboard('{ArrowUp}');
    expect(monthRadio('6월')).toHaveFocus();
  });

  it('Home/End 는 그 해 1월/12월이다', async () => {
    const user = userEvent.setup();
    // today 를 1월·12월과 다른 달로 둔다 — 겹치면 접근 이름에 ", 이번 달" 이 붙어 정확 일치가 깨진다.
    renderPicker({ selectedDate: '2026-09-17', today: '2020-05-01' });
    await user.keyboard('{Home}');
    expect(monthRadio('1월')).toHaveFocus();
    await user.keyboard('{End}');
    expect(monthRadio('12월')).toHaveFocus();
  });

  it('해 경계를 넘으면 해도 함께 옮긴다', async () => {
    const user = userEvent.setup();
    renderPicker({ selectedDate: '2026-01-01', today: '2020-01-01' });
    await user.keyboard('{ArrowLeft}');
    expect(yearText()).toHaveTextContent('2025');
    expect(monthRadio('12월')).toHaveFocus();
  });

  it('PageUp/PageDown 은 ±1년이고 월을 유지한다', async () => {
    const user = userEvent.setup();
    renderPicker({ selectedDate: '2026-09-17', today: '2026-09-17' });

    await user.keyboard('{PageUp}');
    expect(yearText()).toHaveTextContent('2025');
    // 해가 바뀌어 더는 오늘의 달이 아니므로 이름에서 ", 이번 달" 이 빠진다 — 그래도 9월 그대로다.
    expect(monthRadio('9월')).toHaveFocus();

    await user.keyboard('{PageDown}');
    await user.keyboard('{PageDown}');
    expect(yearText()).toHaveTextContent('2027');
    expect(monthRadio('9월')).toHaveFocus();
  });
});

describe('R15. 확정은 select 를 한 번만 부르고(일 유지) 팝오버를 닫는다', () => {
  it('월 버튼 클릭 — 일을 유지한 채 그 년·월로', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderPicker({ selectedDate: '2026-09-17' });
    await user.click(monthRadio('12월'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('2026-12-17');
    expect(screen.queryByRole('radiogroup', { name: '월 선택' })).not.toBeInTheDocument();
  });

  it('말일 자르기 — 1월 31일에서 4월로 가면 4월 30일이 된다', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderPicker({ selectedDate: '2026-01-31' });
    await user.click(monthRadio('4월'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('2026-04-30');
  });

  it('키보드 Enter 로 확정해도 한 번만 불린다(네이티브 클릭과 중복되지 않는다)', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderPicker({ selectedDate: '2026-09-17' });
    await user.keyboard('{ArrowRight}'); // 9월 → 10월로 포커스 이동
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('2026-10-17');
  });

  it('[이번 달] 은 오늘의 년·월로 이동한다(일 유지)', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderPicker({ selectedDate: '2026-03-15', today: '2026-09-17' });
    await user.click(screen.getByRole('button', { name: '이번 달' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('2026-09-15');
  });
});

describe('R16. Esc 는 변경 없이 닫히고 포커스가 앵커로 돌아온다', () => {
  it('변경 없음 + 앵커 복귀', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderPicker();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('radiogroup', { name: '월 선택' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '앵커' })).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
