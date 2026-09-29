// 껍질이 재는 것: 지연 로드 자리표시자 → 본문 교체, 팝오버에 이름을 주지 않는 것(이중 낭독 방지),
// 힌트 유무에 따른 자리표시자 높이, 아래 자리가 없으면 위로 뒤집는 것(R18-a), 확정이 호출부로 그대로
// 전달되는 것. 본문의 규칙은 DayPicker.test.
import { useRef, useState } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
          align="end"
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

/** 지연 청크가 절대 풀리지 않게 만든다 — 자리표시자를 결정적으로 잡는다(리뷰 Nit n1). */
function mockNeverLoads() {
  vi.doMock('@/features/date-strip/components/DayPicker', () => new Promise<never>(() => {}));
}

afterEach(() => {
  vi.doUnmock('@/features/date-strip/components/DayPicker');
  vi.resetModules();
});

describe('지연 로드 껍질', () => {
  it('앵커에 aria-haspopup="grid" 가 붙고, 열면 본문이 지연 로드돼 grid "날짜 고르기" 가 나타난다', async () => {
    const user = userEvent.setup();
    renderPopover();
    const anchor = screen.getByRole('button', { name: '날짜' });
    expect(anchor).toHaveAttribute('aria-haspopup', 'grid');
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

  it('힌트를 주면 본문에 그대로 보인다', async () => {
    const user = userEvent.setup();
    renderPopover({ hint: "'장보기'를 어느 날로 옮길까요?" });
    await user.click(screen.getByRole('button', { name: '날짜' }));
    expect(await screen.findByText("'장보기'를 어느 날로 옮길까요?")).toBeInTheDocument();
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

describe('자리표시자 높이는 본문 실측 합이다(힌트 유무로 두 값)', () => {
  async function renderPending(hint?: string) {
    mockNeverLoads();
    const { DayPickerPopover: Pending } =
      await import('@/features/date-strip/components/DayPickerPopover');
    function Harness() {
      const anchorRef = useRef<HTMLButtonElement>(null);
      return (
        <div>
          <button ref={anchorRef} type="button">
            날짜
          </button>
          <Pending
            open
            onClose={vi.fn()}
            anchorRef={anchorRef}
            value="2026-09-17"
            today="2026-09-17"
            hint={hint}
            onPick={vi.fn()}
          />
        </div>
      );
    }
    render(<Harness />);
    const busy = document.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    return busy as HTMLElement;
  }

  it('힌트 없음 → 324px', async () => {
    expect((await renderPending()).className).toContain('h-[324px]');
  });

  it('힌트 있음 → 354px(한 줄 18 + 간격 12)', async () => {
    expect((await renderPending('힌트')).className).toContain('h-[354px]');
  });
});

describe('R18-a. 아래에 자리가 없고 위에는 있으면 위로 뒤집는다', () => {
  function stubAnchorRect(top: number, innerHeight: number) {
    Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true });
    vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top,
      bottom: top + 32,
      left: 400,
      right: 432,
      width: 32,
      height: 32,
      x: 400,
      y: top,
      toJSON: () => ({}),
    });
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** 열린 뒤 Popover 패널(자리표시자/본문의 부모). 위치는 인라인 `top` 으로 온다. */
  async function openAndMeasure() {
    const user = userEvent.setup();
    renderPopover();
    await user.click(screen.getByRole('button', { name: '날짜' }));
    const grid = await screen.findByRole('grid', { name: '날짜 고르기' });
    return grid.parentElement?.parentElement as HTMLElement;
  }

  it('앵커가 화면 아래쪽(800px 중 top 600)이면 패널 top 이 앵커 위다', async () => {
    stubAnchorRect(600, 800);
    const panel = await openAndMeasure();
    // jsdom 의 offsetHeight 는 0 이라 top = rect.top - 0 - GAP = 592 — 아래 배치였다면 640(bottom + 8).
    expect(Number.parseFloat(panel.style.top)).toBeLessThan(600);
  });

  it('아래에 자리가 넉넉하면(top 100) 아래에 붙는다', async () => {
    stubAnchorRect(100, 800);
    const panel = await openAndMeasure();
    expect(Number.parseFloat(panel.style.top)).toBe(140);
  });

  it('위에도 아래에도 안 들어가면(높이 500, top 300) 아래·클램프다', async () => {
    stubAnchorRect(300, 500);
    const panel = await openAndMeasure();
    expect(Number.parseFloat(panel.style.top)).toBeGreaterThanOrEqual(300);
  });
});
