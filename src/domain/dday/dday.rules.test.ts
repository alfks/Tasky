import { describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';
import type { Dday } from '@/domain/dday/dday';
import {
  createDday,
  DDAY_MAX_COUNT,
  DDAY_TITLE_MAX_LENGTH,
  ddayOffset,
  deleteDday,
  formatDday,
  normalizeDdayTitle,
  restoreDday,
  sortDdays,
  validateDdayDate,
  validateDdayTitle,
} from '@/domain/dday/dday.rules';
import { markDeleted } from '@/domain/meta';

import { fixedDeps, FIXTURE_INSTANT } from '@/test/fixtures/deps';

const T1 = '2026-01-16T09:30:00.000Z';
const deps = fixedDeps();

function makeDday(overrides: Partial<Dday> & { seq?: number } = {}): Dday {
  const { seq = 1, ...rest } = overrides;
  return {
    id: `30000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    createdAt: FIXTURE_INSTANT,
    updatedAt: FIXTURE_INSTANT,
    rev: 1,
    title: `D-day ${seq}`,
    date: '2026-02-01' as DateKey,
    ...rest,
  };
}

describe('제목 검증 (R1)', () => {
  it('줄바꿈은 공백, 앞뒤 공백은 제거', () => {
    expect(normalizeDdayTitle(' 생\n일 ')).toBe('생 일');
  });

  it('빈 제목은 거부한다', () => {
    expect(() => validateDdayTitle('  ')).toThrow(
      expect.objectContaining({ code: 'DDAY_TITLE_REQUIRED' }),
    );
  });

  it('30자 초과는 거부하고 30자는 허용한다', () => {
    expect(() => validateDdayTitle('가'.repeat(31))).toThrow(
      expect.objectContaining({ code: 'DDAY_TITLE_TOO_LONG' }),
    );
    expect(validateDdayTitle('가'.repeat(DDAY_TITLE_MAX_LENGTH))).toHaveLength(
      DDAY_TITLE_MAX_LENGTH,
    );
  });
});

describe('날짜 검증 (R1 — 과거·미래 모두 허용)', () => {
  it('형식이 아니거나 실존하지 않는 날짜는 거부한다', () => {
    expect(() => validateDdayDate('2026-13-01')).toThrow(
      expect.objectContaining({ code: 'DDAY_DATE_INVALID' }),
    );
    expect(() => validateDdayDate('아무값')).toThrow(
      expect.objectContaining({ code: 'DDAY_DATE_INVALID' }),
    );
  });

  it('과거 날짜도 허용한다', () => {
    expect(validateDdayDate('2020-01-01')).toBe('2020-01-01');
  });
});

describe('createDday (R1)', () => {
  it('제목을 정규화하고 D-day 를 만든다', () => {
    const created = createDday({ title: ' 생일 ', date: '2026-03-01' }, [], deps);
    expect(created.title).toBe('생일');
    expect(created.date).toBe('2026-03-01');
    expect(created.rev).toBe(1);
  });

  it('50개(삭제되지 않은 것만) 이상이면 거부한다', () => {
    const existing = Array.from({ length: DDAY_MAX_COUNT }, (_, i) => makeDday({ seq: i + 1 }));
    expect(() => createDday({ title: '새 D-day', date: '2026-03-01' }, existing, deps)).toThrow(
      expect.objectContaining({ code: 'DDAY_LIMIT_EXCEEDED' }),
    );
  });

  it('삭제된 D-day는 개수 제한에서 빠진다', () => {
    const deletedOnes = Array.from({ length: DDAY_MAX_COUNT }, (_, i) =>
      markDeleted(makeDday({ seq: i + 1 }), T1),
    );
    expect(() =>
      createDday({ title: '새 D-day', date: '2026-03-01' }, deletedOnes, deps),
    ).not.toThrow();
  });
});

describe('삭제·되돌리기 (R5)', () => {
  it('deleteDday 는 툼스톤을 만든다', () => {
    const dday = makeDday();
    const deleted = deleteDday(dday, { ...deps, now: () => T1 });
    expect(deleted.deletedAt).toBe(T1);
    expect(deleted.rev).toBe(dday.rev + 1);
  });

  it('restoreDday 는 되살린 값의 rev 가 방금 쓴 툼스톤보다 높다(덮어쓸 수 있다)', () => {
    const dday = makeDday();
    const deleted = deleteDday(dday, { ...deps, now: () => T1 });
    const restored = restoreDday(dday, deleted.deletedAt as string, {
      ...deps,
      now: () => '2026-01-16T09:30:06.000Z',
    });
    expect(restored.deletedAt).toBeUndefined();
    expect(restored.title).toBe(dday.title);
    expect(restored.rev).toBeGreaterThan(deleted.rev);
  });
});

describe('D-n 표기 경계 (R3)', () => {
  it('오늘이면 D-day', () => {
    expect(ddayOffset('2026-01-15' as DateKey, '2026-01-15' as DateKey)).toBe(0);
    expect(formatDday(0)).toBe('D-day');
  });

  it('미래는 D-n', () => {
    expect(ddayOffset('2026-01-27' as DateKey, '2026-01-15' as DateKey)).toBe(12);
    expect(formatDday(12)).toBe('D-12');
  });

  it('어제(과거)는 D+1', () => {
    expect(ddayOffset('2026-01-14' as DateKey, '2026-01-15' as DateKey)).toBe(-1);
    expect(formatDday(-1)).toBe('D+1');
  });

  it('월·연 경계를 넘어도 정확하다', () => {
    expect(ddayOffset('2027-01-01' as DateKey, '2026-12-31' as DateKey)).toBe(1);
    expect(ddayOffset('2024-03-01' as DateKey, '2024-02-28' as DateKey)).toBe(2); // 윤년 2/29 를 낀다
  });
});

describe('정렬 (R2)', () => {
  const today = '2026-01-15' as DateKey;

  it('미래(오늘 포함)는 가까운 순, 지난 항목은 최근순으로 가른다', () => {
    const far = makeDday({ seq: 1, date: '2026-02-01' as DateKey });
    const soon = makeDday({ seq: 2, date: '2026-01-20' as DateKey });
    const isToday = makeDday({ seq: 3, date: today });
    const recentPast = makeDday({ seq: 4, date: '2026-01-10' as DateKey });
    const oldPast = makeDday({ seq: 5, date: '2025-12-01' as DateKey });

    const { upcoming, past } = sortDdays([far, soon, isToday, recentPast, oldPast], today);

    expect(upcoming.map((d) => d.id)).toEqual([isToday.id, soon.id, far.id]);
    expect(past.map((d) => d.id)).toEqual([recentPast.id, oldPast.id]);
  });

  it('툼스톤은 양쪽 모두에서 빠진다', () => {
    const alive = makeDday({ seq: 1, date: '2026-01-20' as DateKey });
    const deleted = markDeleted(makeDday({ seq: 2, date: '2026-01-21' as DateKey }), T1);

    const { upcoming } = sortDdays([alive, deleted], today);

    expect(upcoming.map((d) => d.id)).toEqual([alive.id]);
  });

  it('같은 날짜는 만든 순서로 갈라 두 저장소 구현이 갈리지 않는다', () => {
    const later = makeDday({ seq: 1, date: '2026-01-20' as DateKey, createdAt: T1 });
    const earlier = makeDday({
      seq: 2,
      date: '2026-01-20' as DateKey,
      createdAt: FIXTURE_INSTANT,
    });

    const { upcoming } = sortDdays([later, earlier], today);

    expect(upcoming.map((d) => d.id)).toEqual([earlier.id, later.id]);
  });
});
