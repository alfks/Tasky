// YearMonthPicker 는 DateStripHeader 가 Popover 안에서 지연 로드하는 피커 본문이다
// (calendar-layout.md §3 R15~R19). 컴포넌트 자체는 앵커를 모르므로, DateStripHeader 와 같은
// 배선(Popover + 앵커 버튼)을 여기서 직접 세워 R16 의 Esc·포커스 복귀까지 자기 완결적으로 검증한다.
import { useRef, useState } from 'react';

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  const { container } = render(<Harness />);
  return { onSelect, container };
}

/** 화면에 보이는 년 숫자(즉시 갱신) — sr-only 디바운스 노드와는 별개다. */
const yearText = () => screen.getByText(/^\d{4}$/, { selector: 'span:not([aria-live])' });
/**
 * 디바운스된 낭독용 라이브 영역(§5 폭주 방지). `Popover` 가 `createPortal` 로 그리므로 RTL
 * `render()` 의 `container` 밖(`document.body`)에 붙는다 — `document` 전체에서 찾는다.
 */
const liveYearText = () => document.querySelector('[aria-live="polite"]');
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

describe('2차 리뷰 Major — 패널 폭 이중 지정 방지', () => {
  it('루트에 w-[280px] 를 다시 넣지 않는다(부모 Popover 콘텐츠 상자를 w-full 로 채운다)', () => {
    renderPicker();
    // Popover 패널 자체도 role="group"(팝오버 aria-label) 이라 — 그 안의 첫 자식(YearMonthPicker
    // 의 실제 루트)을 짚어야 년 스테퍼 줄의 role="group" 과 헷갈리지 않는다.
    const panel = screen.getByRole('group', { name: '연도와 월 선택' });
    const root = panel.firstElementChild;
    expect(root).not.toBeNull();
    expect(root?.className ?? '').not.toContain('w-[280px]');
    expect(root?.className ?? '').toContain('w-full');
  });
});

describe('2차 리뷰 Minor — 년 텍스트 이중 노출 방지', () => {
  it('시각 스팬은 aria-hidden 이고 접근 가능한 텍스트는 sr-only 노드 하나뿐이다', () => {
    renderPicker();
    expect(yearText()).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('R17. 역할과 접근 이름', () => {
  it('팝오버는 "연도와 월 선택", 낭독용 년 텍스트는 aria-live=polite, 월 격자는 "월 선택" 라디오그룹이다', () => {
    renderPicker();
    expect(screen.getByRole('group', { name: '연도와 월 선택' })).toBeInTheDocument();
    // 화면에 보이는 년 텍스트 자체에는 aria-live 가 없다 — 낭독 폭주 방지(§5)를 위해
    // 디바운스되는 노드가 따로 있다(아래 describe).
    expect(yearText()).not.toHaveAttribute('aria-live');
    expect(liveYearText()).not.toBeNull();
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

  it('강제 색 모드에서도 "이번 달" 링이 테두리로 남는다(리뷰 Nit)', () => {
    // today 와 selectedDate 를 다른 달로 둬 "이번 달" 표현이 선택 표현과 겹치지 않게 한다.
    renderPicker({ selectedDate: '2026-03-15', today: '2026-09-17' });
    expect(monthRadio('9월, 이번 달').className).toContain(
      'forced-colors:[border-width:var(--control-selected-ring)]',
    );
  });
});

describe('다른 해에서는 checked·강조가 포커스를 따라가지 않는다(2차 리뷰 Minor — 되돌림)', () => {
  // 배경: 1차 리뷰는 "다른 해에서 12개 라디오가 전부 checked=false" 를 Minor 로 지적했고, 그
  // 답으로 포커스 중인 달을 checked 로 삼았었다. 2차 리뷰는 그 쪽이 더 나쁘다고 봤다 — 확정하지
  // 않았는데 화살표로 훑기만 해도 checked·강조 채움이 움직여 "선택됨" 처럼 보이고 들린다.
  // ARIA radiogroup 은 선택된 라디오가 없는 상태를 허용하므로, 실제 선택(selectedDate)만 켠다.
  it('[다음 해] 를 눌러도 어떤 라디오도 aria-checked=true 가 아니다', async () => {
    const user = userEvent.setup();
    renderPicker({ selectedDate: '2026-09-17', today: '2026-09-17' });

    await user.click(screen.getByRole('button', { name: '다음 해' }));

    const checked = screen
      .getAllByRole('radio')
      .filter((radio) => radio.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(0);
  });

  it('다른 해에서 화살표로 포커스를 옮겨도 checked 는 계속 전부 false 다', async () => {
    const user = userEvent.setup();
    renderPicker({ selectedDate: '2026-09-17', today: '2020-01-01' });

    // 년 스테퍼 버튼 클릭은 DOM 포커스를 그 버튼으로 옮긴다 — 이어지는 방향키가 월 격자에
    // 닿으려면 먼저 라디오로 포커스를 되돌려야 한다.
    await user.click(screen.getByRole('button', { name: '다음 해' }));
    monthRadio('9월').focus();
    await user.keyboard('{ArrowRight}');

    // 포커스(roving tabindex)는 여전히 옮겨간다 — checked·강조만 따라가지 않는다.
    expect(monthRadio('10월')).toHaveFocus();
    expect(monthRadio('10월')).toHaveAttribute('aria-checked', 'false');
    expect(monthRadio('9월')).toHaveAttribute('aria-checked', 'false');
  });

  it('원래 해로 돌아오면 selectedDate 의 달만 다시 checked 다', async () => {
    const user = userEvent.setup();
    renderPicker({ selectedDate: '2026-09-17', today: '2026-09-17' });

    await user.click(screen.getByRole('button', { name: '다음 해' }));
    expect(monthRadio('9월')).toHaveAttribute('aria-checked', 'false');

    await user.click(screen.getByRole('button', { name: '이전 해' }));
    expect(monthRadio('9월, 이번 달')).toHaveAttribute('aria-checked', 'true');
  });
});

describe('년 텍스트 aria-live 는 300ms 디바운스된다(리뷰 Minor — polite 큐 폭주 방지)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('시각 텍스트는 즉시 바뀌지만 낭독 영역은 300ms 뒤에야 반영된다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPicker({ selectedDate: '2026-09-17', today: '2026-09-17' });

    await user.click(screen.getByRole('button', { name: '다음 해' }));

    expect(yearText()).toHaveTextContent('2027');
    expect(liveYearText()).toHaveTextContent('2026');

    // rAF(페이드 종료)도 이 타이머 큐에 걸리므로 act() 로 감싼다 — 그러지 않으면 advance 중에
    // 일어나는 setFading(false) 가 "act 밖 갱신" 경고를 낸다.
    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(liveYearText()).toHaveTextContent('2027');
  });

  it('연타(이전 해 연속 클릭)는 낭독을 한 번으로 모은다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPicker({ selectedDate: '2026-09-17', today: '2026-09-17' });

    await user.click(screen.getByRole('button', { name: '이전 해' }));
    await act(() => vi.advanceTimersByTimeAsync(200));
    await user.click(screen.getByRole('button', { name: '이전 해' }));
    await act(() => vi.advanceTimersByTimeAsync(200));

    // 첫 클릭 뒤 300ms 가 지났어도 두 번째 클릭이 타이머를 다시 미뤄 아직 원래 값이다.
    expect(liveYearText()).toHaveTextContent('2026');

    await act(() => vi.advanceTimersByTimeAsync(100));

    // 두 번 연속으로 [이전 해] 를 눌렀으니(2026 → 2025 → 2024) 마지막 값 하나만 낭독된다.
    expect(liveYearText()).toHaveTextContent('2024');
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

describe('R19. reduced-motion 에서 크로스페이드가 깜빡임이 되지 않는다(리뷰 Minor)', () => {
  it('연이 바뀌는 순간 opacity-0 는 motion-safe: 로만 걸린다(리터럴 opacity-0 는 reduced-motion 에서도 적용돼 깜빡임이 된다)', async () => {
    const user = userEvent.setup();
    renderPicker({ selectedDate: '2026-09-17', today: '2026-09-17' });
    const grid = screen.getByRole('radiogroup', { name: '월 선택' });

    await user.click(screen.getByRole('button', { name: '다음 해' }));

    const classes = grid.className.split(' ');
    expect(classes).toContain('motion-safe:opacity-0');
    expect(classes).not.toContain('opacity-0');
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
