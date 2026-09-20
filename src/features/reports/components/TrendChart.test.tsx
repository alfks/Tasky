import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';

import { TrendChart } from '@/features/reports/components/TrendChart';
import type { TrendPoint } from '@/features/reports/lib/period-summary';

describe('TrendChart (stats.md R2·§5)', () => {
  it('role=img 로 평균 달성률 요약을 낭독한다', () => {
    render(
      <TrendChart
        points={[
          { date: '2026-09-18', ratio: 0.5 },
          { date: '2026-09-19', ratio: 1 },
        ]}
      />,
    );

    expect(screen.getByRole('img', { name: '최근 2일 평균 달성률 75퍼센트' })).toBeInTheDocument();
  });

  it('칸 단위 상세는 시각적으로 숨긴 대체 표로 낸다', () => {
    render(<TrendChart points={[{ date: '2026-09-18', ratio: 0.5 }]} />);

    const table = screen.getByRole('table', { name: '날짜별 달성률' });
    expect(table).toHaveClass('sr-only');
    expect(screen.getByRole('cell', { name: '50%' })).toBeInTheDocument();
  });

  it('total===0 인 날(ratio null)은 표에서 "기록 없음"이다', () => {
    render(
      <TrendChart
        points={[
          { date: '2026-09-17', ratio: 0.5 },
          { date: '2026-09-18', ratio: null },
        ]}
      />,
    );

    expect(screen.getByRole('cell', { name: '기록 없음' })).toBeInTheDocument();
  });

  it('전부 기록 없음이면 빈 상태 문구를 보여준다', () => {
    render(<TrendChart points={[{ date: '2026-09-18', ratio: null }]} />);

    expect(screen.getByText('이 기간엔 표시할 추이가 없어요')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('30일 이하에서는 매일 요일 라벨을 찍는다(밀집 문턱 아래)', () => {
    const points: TrendPoint[] = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, '0')}` as DateKey,
      ratio: 0.5,
    }));
    render(<TrendChart points={points} />);

    const columns = screen.getByRole('img').querySelectorAll('[aria-hidden="true"]');
    expect(columns).toHaveLength(30);
    for (const column of columns) expect(column.className).toContain('flex-1');
    // 30일 이하는 요일 글자가 실제로 보인다.
    expect(screen.getByRole('img').textContent).toMatch(/[월화수목금토일]/);
  });

  it('30일을 넘으면(review M5, Blocker — "올해" 실측: 글자 벽 + 페이지 높이 2398→5887px) 열이 고정 폭+가로 스크롤로 바뀌고 요일 글자 벽이 사라진다', () => {
    const points: TrendPoint[] = Array.from({ length: 366 }, (_, i) => {
      const date = new Date('2026-01-01T00:00:00');
      date.setDate(date.getDate() + i);
      const pad = (n: number) => String(n).padStart(2, '0');
      return {
        date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` as DateKey,
        ratio: 0.5,
      };
    });
    render(<TrendChart points={points} />);

    const img = screen.getByRole('img');
    expect(img.className).toContain('overflow-x-auto');
    const columns = img.querySelectorAll('[aria-hidden="true"]');
    expect(columns).toHaveLength(366);
    // flex-1 로 서브픽셀까지 짜부라지지 않는다 — 고정 폭(6px)에 overflow-x-auto 로 가로 스크롤한다.
    for (const column of columns) {
      expect(column.className).not.toContain('flex-1');
      expect(column.className).toContain('w-[6px]');
      expect(column.className).toContain('shrink-0');
    }
    // 요일 글자 벽이 아니라 월이 바뀔 때만 찍는 성긴 눈금이다 — 매일이 아니라 달마다 한 번뿐.
    const expectedTicks = points.filter((p, i) => i === 0 || Number(p.date.slice(8, 10)) === 1);
    const labels = [...img.querySelectorAll('span')].map((el) => el.textContent);
    expect(labels.filter((t) => t !== '')).toHaveLength(expectedTicks.length);
    expect(labels.every((t) => !WEEKDAY_CHARS.some((c) => t === c))).toBe(true);
  });
});

const WEEKDAY_CHARS = ['일', '월', '화', '수', '목', '금', '토'];
