import { beforeAll, describe, expect, it } from 'vitest';

import { addDays, fromDateKey, nowIso, startOfWeek, toDateKey, type DateKey } from '@/lib/date';

// 타임존 경계를 명확히 노리기 위해 이 파일은 UTC 대비 음수 오프셋 지역(America/New_York, DST 있음)에서 돈다.
// 모든 Date 는 각 테스트 실행 시점(beforeAll 이후)에 만들어지므로 여기서 고정하면 충분하다.
beforeAll(() => {
  process.env.TZ = 'America/New_York';
});

describe('toDateKey', () => {
  it('로컬 연-월-일을 0 채움된 DateKey 로 바꾼다', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('자정 직전 로컬 시각도 그날의 DateKey 를 돌려준다(UTC 로 넘어가지 않음)', () => {
    // America/New_York 은 UTC 보다 느리므로, 로컬 23:59 는 UTC 로는 이미 다음날이다.
    // getUTC* 로 잘못 구현했다면 이 값이 다음날로 나온다.
    const almostMidnight = new Date(2026, 0, 1, 23, 59, 59, 999);
    expect(toDateKey(almostMidnight)).toBe('2026-01-01');
  });

  it('자정 직후 로컬 시각도 그날의 DateKey 를 돌려준다', () => {
    const justAfterMidnight = new Date(2026, 0, 2, 0, 0, 0, 0);
    expect(toDateKey(justAfterMidnight)).toBe('2026-01-02');
  });
});

describe('fromDateKey', () => {
  it('DateKey 가 가리키는 로컬 자정 Date 를 돌려준다', () => {
    const date = fromDateKey('2026-03-10' as DateKey);
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 2, 10]);
    expect([date.getHours(), date.getMinutes(), date.getSeconds()]).toEqual([0, 0, 0]);
  });

  it('toDateKey 와 왕복한다', () => {
    const key = '2026-07-04' as DateKey;
    expect(toDateKey(fromDateKey(key))).toBe(key);
  });
});

describe('addDays', () => {
  it('월말을 넘어간다', () => {
    expect(addDays('2026-01-31' as DateKey, 1)).toBe('2026-02-01');
  });

  it('연말을 넘어간다', () => {
    expect(addDays('2026-12-31' as DateKey, 1)).toBe('2027-01-01');
  });

  it('연초에서 하루 전으로 가면 전해 12월 31일이다', () => {
    expect(addDays('2026-01-01' as DateKey, -1)).toBe('2025-12-31');
  });

  it('윤년 2월을 올바르게 넘는다(2028년)', () => {
    expect(addDays('2028-02-28' as DateKey, 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29' as DateKey, 1)).toBe('2028-03-01');
  });

  it('평년 2월은 28일에서 바로 3월로 넘어간다(2027년)', () => {
    expect(addDays('2027-02-28' as DateKey, 1)).toBe('2027-03-01');
  });

  it('0일을 더하면 같은 날이다', () => {
    expect(addDays('2026-06-15' as DateKey, 0)).toBe('2026-06-15');
  });

  it('7일 이동(주 단위 네비게이션)은 요일을 유지한다', () => {
    // 2026-09-17 은 목요일 → +7 도 목요일
    expect(addDays('2026-09-17' as DateKey, 7)).toBe('2026-09-24');
    expect(addDays('2026-09-17' as DateKey, -7)).toBe('2026-09-10');
  });

  it('DST 전환일(미국 2026년 3월 8일, 써머타임 시작)을 하루 단위로 정상 이동한다', () => {
    expect(addDays('2026-03-07' as DateKey, 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08' as DateKey, 1)).toBe('2026-03-09');
  });

  it('DST 전환일(미국 2026년 11월 1일, 써머타임 종료)을 하루 단위로 정상 이동한다', () => {
    expect(addDays('2026-10-31' as DateKey, 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01' as DateKey, 1)).toBe('2026-11-02');
  });
});

describe('startOfWeek', () => {
  it('월요일이면 그 날 자신이다', () => {
    expect(startOfWeek('2026-09-14' as DateKey)).toBe('2026-09-14');
  });

  it('일요일이면 그 주 월요일로 되돌아간다(일→월 경계)', () => {
    expect(startOfWeek('2026-09-20' as DateKey)).toBe('2026-09-14');
  });

  it('토요일이면 그 주 월요일로 되돌아간다', () => {
    expect(startOfWeek('2026-09-19' as DateKey)).toBe('2026-09-14');
  });

  it('월 경계에 걸친 주도 올바른 월요일을 찾는다', () => {
    // 2026-10-01(목) 이 속한 주의 월요일은 9월 28일
    expect(startOfWeek('2026-10-01' as DateKey)).toBe('2026-09-28');
  });

  it('연 경계에 걸친 주도 올바른 월요일을 찾는다', () => {
    // 2026-01-01(목) 이 속한 주의 월요일은 2025-12-29
    expect(startOfWeek('2026-01-01' as DateKey)).toBe('2025-12-29');
  });
});

describe('nowIso', () => {
  it('toISOString 형식(밀리초·Z)의 문자열을 돌려준다', () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('호출할 때마다 유효한 시각이며 과거로 가지 않는다', () => {
    const a = nowIso();
    const b = nowIso();
    expect(new Date(b).getTime()).toBeGreaterThanOrEqual(new Date(a).getTime());
  });
});
