// `dayCellClass`·`dayNumberClass` 는 DateCell 이 T-49 부터 갖고 있던 상태별 클래스 문자열을
// 그대로 옮긴 것이다(calendar-layout.md §3-A R15-a). 아래 상수는 옮기기 **전** DateCell.tsx 에 있던
// 문자열을 문자 단위로 베껴 둔 대조군이다 — 스냅샷이 아니라 "이 문자열에서 한 글자라도 바뀌면
// 그것은 의도한 시각 변경이어야 한다" 는 고정 장치다. 바꿀 때는 이 상수도 같이 고친다.
import { describe, expect, it } from 'vitest';

import {
  dayCellClass,
  dayNumberClass,
  IDLE_CELL_CLASS,
  SELECTED_CELL_CLASS,
  TODAY_CELL_CLASS,
} from '@/features/date-strip/lib/cell-classes';

const BEFORE = {
  selected:
    'bg-accent text-on-accent ring-[length:var(--control-selected-ring)] ring-selected-ring ring-inset forced-colors:[border-width:var(--control-selected-ring)] forced-colors:[border-style:solid]',
  idle: 'bg-transparent text-text hover:enabled:bg-surface-2',
  today:
    'ring-2 ring-accent ring-inset forced-colors:[border-width:var(--control-selected-ring)] forced-colors:[border-style:solid]',
} as const;

describe('R15-a. dayCellClass 는 DateCell 이 쓰던 문자열과 문자 단위로 같다', () => {
  it('선택·비선택·오늘 상수가 옮기기 전 DateCell 의 문자열과 같다', () => {
    expect(SELECTED_CELL_CLASS).toBe(BEFORE.selected);
    expect(IDLE_CELL_CLASS).toBe(BEFORE.idle);
    expect(TODAY_CELL_CLASS).toBe(BEFORE.today);
  });

  it('선택이면 채움 + 잉크 링이고 강조색 링(오늘 표현)은 붙지 않는다', () => {
    const classes = dayCellClass({ selected: true, today: true });
    expect(classes).toBe(BEFORE.selected);
    expect(classes).not.toMatch(/\bring-2 ring-accent ring-inset\b/);
  });

  it('오늘이면서 선택 아님이면 비선택 + 강조색 링이다', () => {
    expect(dayCellClass({ selected: false, today: true })).toBe(`${BEFORE.idle} ${BEFORE.today}`);
  });

  it('둘 다 아니면 비선택 클래스뿐이다', () => {
    expect(dayCellClass({ selected: false, today: false })).toBe(BEFORE.idle);
  });

  it('강제 색 모드 갈래(테두리 대체 표현)가 선택·오늘 둘 다에 있다', () => {
    for (const classes of [
      dayCellClass({ selected: true, today: false }),
      dayCellClass({ selected: false, today: true }),
    ]) {
      expect(classes).toContain('forced-colors:[border-width:var(--control-selected-ring)]');
      expect(classes).toContain('forced-colors:[border-style:solid]');
    }
    expect(dayCellClass({ selected: false, today: false })).not.toContain('forced-colors:');
  });
});

describe('R16. dayNumberClass — 오늘은 굵고, 이 달 밖은 숫자만 흐려진다', () => {
  it('오늘은 font-bold, 아니면 font-semibold', () => {
    expect(dayNumberClass({ selected: false, today: true })).toBe('font-bold');
    expect(dayNumberClass({ selected: false, today: false })).toBe('font-semibold');
  });

  it('이 달 밖이면 text-muted 가 붙고, 선택된 칸은 흐리지 않는다', () => {
    expect(dayNumberClass({ selected: false, today: false, outside: true })).toBe(
      'font-semibold text-muted',
    );
    expect(dayNumberClass({ selected: true, today: false, outside: true })).toBe('font-semibold');
  });
});
