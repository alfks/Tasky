import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DateStripHeader } from '@/features/date-strip/components/DateStripHeader';

function renderHeader(props: Partial<Parameters<typeof DateStripHeader>[0]> = {}) {
  const onSelect = vi.fn();
  const onToggleView = vi.fn();
  render(
    <div>
      <DateStripHeader
        anchorDate="2026-09-14"
        selectedDate="2026-09-17"
        today="2026-09-17"
        view="week"
        previousStep="2026-09-10"
        nextStep="2026-09-24"
        hasStepAfter={() => true}
        onToggleView={onToggleView}
        onSelect={onSelect}
        {...props}
      />
    </div>,
  );
  return { onSelect, onToggleView };
}

const monthButton = () => screen.getByRole('button', { name: /2026년 9월/ });

describe('R11. 월 표시는 YYYY년 M월 이고 이동 버튼에는 이름이 있다', () => {
  it('보이는 주의 월을 YYYY년 M월 로 적는다', () => {
    renderHeader();
    expect(monthButton()).toBeInTheDocument();
  });

  it('‹ › [오늘] 에 각각 접근 가능한 이름이 있다', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: '이전 주' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음 주' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '오늘로 이동' })).toBeInTheDocument();
  });
});

// 피커 본문(YearMonthPicker)은 지연 로드라 열자마자 바로 보이지 않는다 — 동적 import 가
// 풀리길 기다린다(calendar-layout.md §7 · DateStripHeader 머리 주석). 세부 키보드·ARIA 계약은
// YearMonthPicker.test.tsx 가 자기 완결적 하네스로 덮는다(Popover 는 shared ui 라 새 간선이 아니다).
// 여기서는 "월 표시 버튼이 피커를 연다" 는 연결부만 확인한다(calendar-layout.md §6).
describe('calendar-layout.md §3. 월 표시를 누르면 년·월 피커가 열린다(네이티브 날짜 입력 교체)', () => {
  // 이 파일에서 가장 먼저 열어야 한다 — `LazyYearMonthPicker` 는 모듈 스코프의 `lazy()` 싱글턴이라
  // 한 번 풀린 동적 import 는 이 파일이 도는 내내(이후 it 전부) 캐시된 채 남는다. 다른 테스트가
  // 먼저 열면 이 테스트에 닿을 즈음엔 이미 청크가 있어 fallback(자리표시자)이 그려질 틈이 없다.
  it('청크가 로드되는 동안 실제 패널 크기의 자리표시자가 보인다(리뷰 Minor — 레이아웃 붕괴 방지)', async () => {
    renderHeader();

    // `fireEvent.click`(동기)으로 연다 — `user.click`(비동기)은 내부적으로 매크로태스크까지
    // 흘려보내 지연 청크의 동적 import 가 이미 풀린 뒤에야 단언에 닿을 수 있다. 여기서는
    // 아직 청크가 없는 바로 그 순간(fallback)을 잡아야 한다.
    fireEvent.click(monthButton());
    const placeholder = document.querySelector('[aria-busy="true"]');
    expect(placeholder).not.toBeNull();
    // w-full: 이 자리표시자는 패널(Popover, w-[280px])의 콘텐츠 상자를 채우는 자식이지 패널
    // 자체가 아니다 — 자식이 또 280px 를 주장하면 패딩·테두리만큼 밖으로 삐져나온다(2차 리뷰
    // Major). 높이 256px 은 YearMonthPicker 실제 내용의 실측 합(그 파일 자리표시자 주석 참고).
    expect(placeholder).toHaveClass('w-full', 'h-[256px]');

    expect(await screen.findByRole('radiogroup', { name: '월 선택' })).toBeInTheDocument();
  });

  it('클릭하면 년·월 피커(월 선택 라디오그룹)가 열린다', async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(monthButton());

    expect(await screen.findByRole('radiogroup', { name: '월 선택' })).toBeInTheDocument();
  });

  it('키보드만으로 열 수 있다', async () => {
    const user = userEvent.setup();
    renderHeader();

    monthButton().focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('radiogroup', { name: '월 선택' })).toBeInTheDocument();
  });

  it('월을 확정하면 그 날이 선택되고(일 유지) 피커가 닫히며 포커스가 월 버튼으로 돌아온다', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderHeader({ selectedDate: '2026-09-17' });

    await user.click(monthButton());
    await user.click(await screen.findByRole('radio', { name: '12월' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('2026-12-17');
    expect(screen.queryByRole('radiogroup', { name: '월 선택' })).not.toBeInTheDocument();
    expect(monthButton()).toHaveFocus();
  });

  it('Esc 를 누르면 변경 없이 닫히고 포커스가 월 버튼으로 돌아온다', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderHeader();

    await user.click(monthButton());
    await screen.findByRole('radiogroup', { name: '월 선택' });

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('radiogroup', { name: '월 선택' })).not.toBeInTheDocument();
    expect(monthButton()).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('열려 있는 동안 월 버튼이 aria-controls 로 패널을 가리킨다(닫혀 있어도 aria-haspopup 은 붙는다)', async () => {
    const user = userEvent.setup();
    renderHeader();

    expect(monthButton()).toHaveAttribute('aria-haspopup');
    expect(monthButton()).toHaveAttribute('aria-expanded', 'false');

    await user.click(monthButton());
    const panel = await screen.findByRole('radiogroup', { name: '월 선택' });
    const panelId = monthButton().getAttribute('aria-controls');
    expect(panelId).not.toBeNull();
    expect(document.getElementById(panelId ?? '')).toContainElement(panel);
    expect(monthButton()).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('R5·R6. 범위 끝과 오늘에서 버튼이 비활성된다', () => {
  it('이동할 곳이 없으면 그 방향 버튼이 비활성이다', () => {
    renderHeader({ previousStep: undefined, nextStep: undefined });
    expect(screen.getByRole('button', { name: '이전 주' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음 주' })).toBeDisabled();
  });

  it('오늘이 선택돼 있으면 [오늘] 이 비활성이다', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: '오늘로 이동' })).toBeDisabled();
  });
});

describe('§5. 자기 클릭으로 비활성되는 버튼은 포커스를 넘긴다(WCAG 2.4.3)', () => {
  it('[오늘] 은 눌리는 즉시 비활성되므로 항상 포커스 인계를 요청한다', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderHeader({ selectedDate: '2026-03-03' });
    await user.click(screen.getByRole('button', { name: '오늘로 이동' }));
    expect(onSelect).toHaveBeenCalledWith('2026-09-17', true);
  });

  it('주 이동 버튼은 이동 후에도 살아 있으면 포커스를 넘기지 않는다', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderHeader();
    await user.click(screen.getByRole('button', { name: '다음 주' }));
    expect(onSelect).toHaveBeenCalledWith('2026-09-24', false);
    await user.click(screen.getByRole('button', { name: '이전 주' }));
    expect(onSelect).toHaveBeenCalledWith('2026-09-10', false);
  });

  it('주 이동이 범위 끝에 닿아 버튼이 비활성될 때만 포커스 인계를 요청한다', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderHeader({
      selectedDate: '2099-12-20',
      nextStep: '2099-12-27',
      hasStepAfter: () => false,
    });
    await user.click(screen.getByRole('button', { name: '다음 주' }));
    expect(onSelect).toHaveBeenCalledWith('2099-12-27', true);
  });

  it('년·월 피커에서 월을 확정해도 월 버튼이 그대로 살아 있어 onSelect 에 adoptFocus 를 요청하지 않는다', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderHeader();
    await user.click(monthButton());
    await user.click(await screen.findByRole('radio', { name: '12월' }));
    expect(onSelect).toHaveBeenCalledWith('2026-12-17');
  });
});
