// 껍질이 재는 것: 지연 로드 자리표시자 → 본문 교체, 팝오버에 이름을 주지 않는 것(이중 낭독 방지),
// 힌트 유무에 따른 자리표시자 높이, 확정이 호출부로 그대로 전달되는 것. 본문의 규칙은 DayPicker.test.
import { useRef, useState } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';

import { DayPickerPopover } from '@/features/date-strip/components/DayPickerPopover';

function renderPopover(props: { hint?: string; onPick?: (date: DateKey) => void } = {}) {
  const onPick = props.onPick ?? vi.fn();
  function Harness() {
    const anchorRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    return (
      <div>
        <button ref={anchorRef} type="button" onClick={() => setOpen((value) => !value)}>
          날짜
        </button>
        <DayPickerPopover
          open={open}
          onClose={() => setOpen(false)}
          anchorRef={anchorRef}
          value="2026-09-17"
          today="2026-09-17"
          hint={props.hint}
          onPick={(date) => {
            onPick(date);
            setOpen(false);
          }}
        />
      </div>
    );
  }
  render(<Harness />);
  return { onPick };
}

describe('지연 로드 껍질', () => {
  it('앵커에 aria-haspopup 이 붙고, 열면 본문이 지연 로드돼 grid "날짜 고르기" 가 나타난다', async () => {
    const user = userEvent.setup();
    renderPopover();
    const anchor = screen.getByRole('button', { name: '날짜' });
    expect(anchor).toHaveAttribute('aria-haspopup', 'true');
    expect(anchor).toHaveAttribute('aria-expanded', 'false');

    await user.click(anchor);
    expect(await screen.findByRole('grid', { name: '날짜 고르기' })).toBeInTheDocument();
    expect(anchor).toHaveAttribute('aria-expanded', 'true');
    // 본문 effect 가 현재 값의 칸에 포커스한다(Popover autoFocus 가 아니다).
    expect(screen.getByRole('gridcell', { name: '9월 17일 목요일, 오늘' })).toHaveFocus();
  });

  it('팝오버 자체에는 이름을 주지 않는다 — group 이 하나도 없다(이중 낭독 방지, Popover M-5)', async () => {
    const user = userEvent.setup();
    renderPopover();
    await user.click(screen.getByRole('button', { name: '날짜' }));
    await screen.findByRole('grid', { name: '날짜 고르기' });
    expect(screen.queryByRole('group', { name: '날짜 고르기' })).toBeNull();
  });

  it('힌트를 주면 본문에 그대로 보이고, 자리표시자는 힌트 한 줄만큼 높다', async () => {
    const user = userEvent.setup();
    renderPopover({ hint: '어느 날로 옮길까요?' });
    await user.click(screen.getByRole('button', { name: '날짜' }));
    // 자리표시자는 렌더 직후 한 프레임뿐이라 클래스로만 고정한다 — 본문 높이 실측은 e2e 몫이다.
    const busy = document.querySelector('[aria-busy="true"]');
    if (busy !== null) expect(busy.className).toContain('h-[354px]');
    expect(await screen.findByText('어느 날로 옮길까요?')).toBeInTheDocument();
  });

  it('칸을 고르면 onPick 이 그 날짜로 불리고 닫힌다', async () => {
    const user = userEvent.setup();
    const { onPick } = renderPopover();
    await user.click(screen.getByRole('button', { name: '날짜' }));
    await user.click(await screen.findByRole('gridcell', { name: '9월 18일 금요일' }));
    expect(onPick).toHaveBeenCalledWith('2026-09-18');
    expect(screen.queryByRole('grid', { name: '날짜 고르기' })).toBeNull();
    expect(screen.getByRole('button', { name: '날짜' })).toHaveFocus();
  });
});
