import { describe, expect, it } from 'vitest';

import {
  SATURDAY_INDEX,
  SUNDAY_INDEX,
  WEEKDAY_LABELS,
  formatCellName,
  formatDateName,
  formatDayNumber,
  formatMonthLabel,
  formatProgressName,
  formatShortMonthLabel,
  weekdayIndex,
} from '@/features/date-strip/lib/format';

describe('R9. 요일 색은 토요일·일요일만 다르고 요일 텍스트가 항상 있다', () => {
  it('요일 인덱스는 월요일이 0 이고 토·일이 5·6 이다', () => {
    expect(weekdayIndex('2026-09-14')).toBe(0);
    expect(weekdayIndex('2026-09-19')).toBe(SATURDAY_INDEX);
    expect(weekdayIndex('2026-09-20')).toBe(SUNDAY_INDEX);
  });

  it('요일 라벨 7개가 월요일부터 한 글자씩 있다', () => {
    expect(WEEKDAY_LABELS).toEqual(['월', '화', '수', '목', '금', '토', '일']);
  });
});

describe('R11. 날짜 표기는 월 YYYY년 M월, 셀 D(0 채움 없음), 요일 한 글자다', () => {
  it('월 표시는 0 을 채우지 않는다', () => {
    expect(formatMonthLabel('2026-09-17')).toBe('2026년 9월');
    expect(formatMonthLabel('2026-01-05')).toBe('2026년 1월');
    expect(formatShortMonthLabel('2026-09-17')).toBe('9월');
  });

  it('셀 숫자는 0 을 채우지 않는다', () => {
    expect(formatDayNumber('2026-09-07')).toBe('7');
    expect(formatDayNumber('2026-09-17')).toBe('17');
  });

  it('접근성 이름의 앞부분은 M월 D일 요일 이다', () => {
    expect(formatDateName('2026-09-17')).toBe('9월 17일 목요일');
    expect(formatDateName('2026-01-01')).toBe('1월 1일 목요일');
  });

  it('오늘·진행 문구가 순서대로 덧붙는다', () => {
    expect(
      formatCellName({
        date: '2026-09-17',
        isToday: true,
        progress: formatProgressName(3, 2),
      }),
    ).toBe('9월 17일 목요일, 오늘, 할 일 3개 중 2개 완료');
  });

  it('선택 상태는 이름에 넣지 않는다(aria-checked 와 중복 안내가 된다)', () => {
    expect(formatCellName({ date: '2026-09-17', isToday: false })).toBe('9월 17일 목요일');
  });

  it('오늘도 아니고 투두도 없으면 날짜만 읽힌다', () => {
    expect(
      formatCellName({
        date: '2026-09-18',
        isToday: false,
        progress: formatProgressName(0, 0),
      }),
    ).toBe('9월 18일 금요일');
  });
});
