import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { PeriodToggle } from '@/features/reports/components/PeriodToggle';
import { useReportsStore } from '@/features/reports/store/reports-store';

const TODAY = '2026-09-20';
const INITIAL = useReportsStore.getState();

beforeEach(() => {
  useReportsStore.setState(INITIAL, true);
});

describe('PeriodToggle (stats.md R1·§5 radiogroup)', () => {
  it('radiogroup 안에 네 선택지가 있고 기본은 지난 7일이다', () => {
    render(<PeriodToggle today={TODAY} />);

    const group = screen.getByRole('radiogroup', { name: '통계 기간' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '지난 7일' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '지난 30일' })).not.toBeChecked();
  });

  it('다른 프리셋을 고르면 스토어가 바뀌고 화면도 그 선택을 반영한다(키보드로도 활성화 가능)', async () => {
    const user = userEvent.setup();
    render(<PeriodToggle today={TODAY} />);

    const thisYear = screen.getByRole('radio', { name: '올해' });
    thisYear.focus();
    await user.keyboard(' '); // 키보드만으로 선택 — Space 는 라디오의 표준 활성화 키다.

    expect(thisYear).toBeChecked();
    expect(useReportsStore.getState().preset).toBe('thisYear');
  });

  it('기간 지정을 고르면 날짜 입력 두 개가 나타난다', async () => {
    const user = userEvent.setup();
    render(<PeriodToggle today={TODAY} />);

    await user.click(screen.getByRole('radio', { name: '기간 지정' }));

    expect(screen.getByLabelText('시작일')).toBeInTheDocument();
    expect(screen.getByLabelText('종료일')).toBeInTheDocument();
    expect(useReportsStore.getState().preset).toBe('custom');
  });

  it('366일을 넘는 범위를 고르면 경고를 보여주고 스토어에 반영하지 않는다', async () => {
    const user = userEvent.setup();
    render(<PeriodToggle today={TODAY} />);
    await user.click(screen.getByRole('radio', { name: '기간 지정' }));
    const before = useReportsStore.getState().customRange;

    const start = screen.getByLabelText('시작일');
    await user.clear(start);
    await user.type(start, '2020-01-01');

    expect(screen.getByRole('alert')).toHaveTextContent('366일');
    expect(useReportsStore.getState().customRange).toEqual(before);
  });

  it('선택된 프리셋은 채움 + 잉크 링으로 표시된다(theme.md R17, DateCell.tsx 와 같은 처방 — review B1)', () => {
    render(<PeriodToggle today={TODAY} />);

    const selected = screen.getByRole('radio', { name: '지난 7일' }).closest('label');
    const unselected = screen.getByRole('radio', { name: '지난 30일' }).closest('label');

    expect(selected?.className).toContain('ring-selected-ring');
    expect(selected?.className).toContain(
      'forced-colors:[border-width:var(--control-selected-ring)]',
    );
    expect(unselected?.className ?? '').not.toContain('ring-selected-ring');
  });

  it('시작일을 비우면 366일 초과와 다른 문구("모두 입력")를 보여준다(review m14)', async () => {
    const user = userEvent.setup();
    render(<PeriodToggle today={TODAY} />);
    await user.click(screen.getByRole('radio', { name: '기간 지정' }));

    const start = screen.getByLabelText('시작일');
    await user.clear(start);

    expect(screen.getByRole('alert')).toHaveTextContent('모두 입력');
    expect(screen.getByRole('alert')).not.toHaveTextContent('366일');
  });

  it('무효한 입력은 aria-invalid·aria-describedby 로 알림 문구에 묶인다(review m10)', async () => {
    const user = userEvent.setup();
    render(<PeriodToggle today={TODAY} />);
    await user.click(screen.getByRole('radio', { name: '기간 지정' }));

    const start = screen.getByLabelText('시작일');
    await user.clear(start);
    await user.type(start, '2020-01-01');

    const alert = screen.getByRole('alert');
    expect(start).toHaveAttribute('aria-invalid', 'true');
    expect(start).toHaveAttribute('aria-describedby', alert.id);
  });
});
