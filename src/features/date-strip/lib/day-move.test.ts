import { describe, expect, it } from 'vitest';

import { DAY_KEY_MOVE, moveDay } from '@/features/date-strip/lib/day-move';

describe('R16-a. 일 피커 키 이동', () => {
  it('←/→ 는 ±1일, ↑/↓ 는 ±7일', () => {
    expect(moveDay('2026-09-17', 'left')).toBe('2026-09-16');
    expect(moveDay('2026-09-17', 'right')).toBe('2026-09-18');
    expect(moveDay('2026-09-17', 'up')).toBe('2026-09-10');
    expect(moveDay('2026-09-17', 'down')).toBe('2026-09-24');
  });

  it('Home/End 는 그 줄(월요일 시작)의 양끝', () => {
    expect(moveDay('2026-09-17', 'home')).toBe('2026-09-14');
    expect(moveDay('2026-09-17', 'end')).toBe('2026-09-20');
  });

  it('PageUp/PageDown 은 ±1달이고 일을 유지하되 말일을 자른다', () => {
    expect(moveDay('2026-09-17', 'pageUp')).toBe('2026-08-17');
    expect(moveDay('2026-09-17', 'pageDown')).toBe('2026-10-17');
    expect(moveDay('2026-01-31', 'pageDown')).toBe('2026-02-28');
  });

  it('범위(R6) 밖으로는 undefined — 1970-01-01 에서 왼쪽·위·이전 달·Home', () => {
    for (const move of ['left', 'up', 'pageUp', 'home'] as const) {
      expect(moveDay('1970-01-01', move)).toBeUndefined();
    }
    expect(moveDay('2099-12-31', 'right')).toBeUndefined();
    expect(moveDay('2099-12-31', 'end')).toBeUndefined();
  });

  it('키 맵에 Enter/Space 는 없다(확정은 버튼 클릭 한 경로뿐)', () => {
    expect(DAY_KEY_MOVE.Enter).toBeUndefined();
    expect(DAY_KEY_MOVE[' ']).toBeUndefined();
    expect(Object.keys(DAY_KEY_MOVE)).toHaveLength(8);
  });
});
