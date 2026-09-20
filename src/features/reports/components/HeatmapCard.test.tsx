import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';

import { HeatmapCard } from '@/features/reports/components/HeatmapCard';
import type { HeatmapCell } from '@/features/reports/lib/period-summary';

const TODAY: DateKey = '2026-09-18';

function cell(date: DateKey, level: HeatmapCell['level'], total = 4, doneCount = 0): HeatmapCell {
  return { date, level, total, doneCount };
}

describe('HeatmapCard (stats.md R6·§5)', () => {
  it('role=img 요약에 평균 달성률이 담기고, 칸 단위 상세는 대체 표로 낸다(review m5·m6)', () => {
    const weeks: HeatmapCell[][] = [
      [
        cell('2026-09-14', 4, 4, 4), // 100%
        cell('2026-09-15', 0, 0, 0), // 기록 없음(평균에서 제외)
        cell('2026-09-16', 2, 4, 1), // 25%
        cell('2026-09-17', 3, 4, 3), // 75%
        cell('2026-09-18', 1, 4, 0), // 0%
      ],
    ];
    // 기록 있는 4칸 평균: (100+25+75+0)/4 = 50%

    render(<HeatmapCard weeks={weeks} today={TODAY} />);

    expect(
      screen.getByRole('img', { name: '최근 12주 활동 히트맵, 평균 달성률 50퍼센트' }),
    ).toBeInTheDocument();
    const table = screen.getByRole('table', { name: '날짜별 활동' });
    expect(table).toHaveClass('sr-only');
    expect(screen.getByRole('cell', { name: '4개 중 4개 완료' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '기록 없음' })).toBeInTheDocument();
  });

  it('격자 자체의 배경은 --color-surface 다(theme.md §3-H — 0단계 대비가 surface-2 에서는 무너진다)', () => {
    const weeks: HeatmapCell[][] = [[cell('2026-09-18', 4, 1, 1)]];

    render(<HeatmapCard weeks={weeks} today={TODAY} />);

    // 우연히 부모(ReportsCard)가 같은 색이어서가 아니라, 이 컴포넌트가 직접 선언한다.
    expect(
      screen.getByRole('img', { name: '최근 12주 활동 히트맵, 평균 달성률 100퍼센트' }),
    ).toHaveClass('bg-surface');
  });

  it('오늘 이후 날짜는 표에도 나오지 않는다', () => {
    const weeks: HeatmapCell[][] = [
      [cell('2026-09-18', 4, 1, 1), cell('2026-09-19', 4, 1, 1), cell('2026-09-20', 4, 1, 1)],
    ];

    render(<HeatmapCard weeks={weeks} today={TODAY} />);

    // sr-only 표에 오늘(9/18)만 있고 9/19·9/20 은 없다.
    expect(screen.getByText('2026년 9월 18일')).toBeInTheDocument();
    expect(screen.queryByText('2026년 9월 19일')).not.toBeInTheDocument();
    expect(screen.queryByText('2026년 9월 20일')).not.toBeInTheDocument();
  });

  it('전부 기록이 없으면 빈 상태 문구다("이 기간"이 아니다 — 히트맵은 항상 최근 12주, review n6)', () => {
    const weeks: HeatmapCell[][] = [[cell('2026-09-18', 0, 0, 0)]];

    render(<HeatmapCard weeks={weeks} today={TODAY} />);

    expect(screen.getByText('최근 12주 동안 기록이 없어요')).toBeInTheDocument();
  });

  it('고대비(forced-colors) 모드에서는 5단계 전부 같은 테두리로 격자 자체가 보인다(theme.md R27 — 단계 구분은 대체 표의 몫)', () => {
    const weeks: HeatmapCell[][] = [[cell('2026-09-18', 0, 0, 0), cell('2026-09-17', 4, 4, 4)]];

    render(<HeatmapCard weeks={weeks} today={TODAY} />);

    // "기록 없음"(0단계)도 다른 단계와 같은 테두리를 갖는다 — 없으면 배경(Canvas)에 녹아
    // 격자 자체가 빈 상자로 보인다.
    const empty = screen.getByRole('button', { name: /기록 없음/ });
    const full = screen.getByRole('button', { name: /4개 중 4개 완료/ });
    expect(empty.className).toContain('forced-colors:[border-width:1px]');
    expect(full.className).toContain('forced-colors:[border-width:1px]');
    // 레벨로 굵기를 다시 인코딩하지 않는다 — 5단계 전부 같은 클래스.
    expect(empty.className).toBe(full.className);
  });

  it('칸에 포커스하면 카드 상단 수치가 그 칸으로 바뀐다(review m6·m16 — 키보드·터치도 접근 가능)', async () => {
    const user = userEvent.setup();
    const weeks: HeatmapCell[][] = [[cell('2026-09-18', 4, 4, 3)]];
    render(<HeatmapCard weeks={weeks} today={TODAY} />);

    expect(screen.queryByTitle(/./)).not.toBeInTheDocument(); // 네이티브 title 에 더는 기대지 않는다
    const cellButton = screen.getByRole('button', { name: /4개 중 3개 완료/ });

    await user.tab(); // 이 트리엔 인터랙티브 요소가 칸 버튼 하나뿐이라 바로 그리 간다.

    expect(cellButton).toHaveFocus();
    expect(screen.getByText(/4개 중 3개 완료/, { selector: 'p' })).toBeInTheDocument();
  });
});
