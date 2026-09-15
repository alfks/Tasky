import { describe, expect, it } from 'vitest';

import {
  addSeconds,
  diffSeconds,
  fromEpochMs,
  INSTANT_PATTERN,
  isInstant,
  toEpochMs,
} from '@/domain/date/instant';
import { DomainError } from '@/domain/errors';

// 테스트 계층은 Date 를 쓸 수 있다(도메인 결정성 규칙은 비테스트 파일 기준 — code-style §7).
// 그래서 여기서는 "Date 없이 만든 계산기"가 Date 와 같은 답을 내는지를 직접 대조한다.
const SAMPLES = [
  '1970-01-01T00:00:00.000Z',
  '1999-12-31T23:59:59.999Z',
  '2000-02-29T12:00:00.000Z', // 400 로 나누어지는 윤년
  '2024-02-29T23:59:59.000Z',
  '2026-01-15T00:00:00.000Z',
  '2026-09-15T13:45:30.123Z',
  '2100-03-01T00:00:00.000Z', // 100 으로 나누어지지만 윤년이 아닌 해의 다음 날
  '1969-07-20T20:17:40.000Z', // epoch 이전(음수)
];

describe('isInstant', () => {
  it('toISOString() 형식만 통과시킨다', () => {
    for (const sample of SAMPLES) {
      expect(isInstant(sample)).toBe(true);
    }
  });

  it('형식이 맞아도 실존하지 않는 날짜·시각은 거부한다', () => {
    expect(isInstant('2026-02-30T00:00:00.000Z')).toBe(false);
    expect(isInstant('2026-13-01T00:00:00.000Z')).toBe(false);
    expect(isInstant('2026-01-01T24:00:00.000Z')).toBe(false);
    expect(isInstant('2025-02-29T00:00:00.000Z')).toBe(false);
  });

  it('형식 자체가 다르면 거부한다', () => {
    expect(isInstant('2026-01-15')).toBe(false);
    expect(isInstant('2026-01-15T00:00:00Z')).toBe(false);
    expect(isInstant('2026-01-15T00:00:00.000+09:00')).toBe(false);
    expect(isInstant(0)).toBe(false);
    expect(isInstant(undefined)).toBe(false);
  });
});

describe('toEpochMs / fromEpochMs', () => {
  it('Date 와 같은 epoch 값을 낸다', () => {
    for (const sample of SAMPLES) {
      expect(toEpochMs(sample)).toBe(new Date(sample).getTime());
    }
  });

  it('Date#toISOString() 과 같은 문자열을 낸다', () => {
    for (const sample of SAMPLES) {
      const ms = new Date(sample).getTime();
      expect(fromEpochMs(ms)).toBe(new Date(ms).toISOString());
    }
  });

  it('왕복해도 같다', () => {
    for (const sample of SAMPLES) {
      expect(fromEpochMs(toEpochMs(sample))).toBe(sample);
    }
  });

  it('형식이 아니면 DomainError 를 던진다', () => {
    expect(() => toEpochMs('2026-02-30T00:00:00.000Z')).toThrow(DomainError);
    expect(() => toEpochMs('어제')).toThrow(DomainError);
    expect(() => fromEpochMs(Number.NaN)).toThrow(DomainError);
  });

  it('INSTANT_PATTERN 은 Meta 시각 검증이 쓰는 형식 그대로다', () => {
    expect(INSTANT_PATTERN.test('2026-01-15T00:00:00.000Z')).toBe(true);
    expect(INSTANT_PATTERN.test('2026-01-15T00:00:00Z')).toBe(false);
  });
});

describe('addSeconds / diffSeconds', () => {
  it('분·시·일·월·연 경계를 넘는다', () => {
    expect(addSeconds('2026-01-15T00:00:00.000Z', 60)).toBe('2026-01-15T00:01:00.000Z');
    expect(addSeconds('2026-01-31T23:59:30.000Z', 30)).toBe('2026-02-01T00:00:00.000Z');
    expect(addSeconds('2025-12-31T23:00:00.000Z', 3600)).toBe('2026-01-01T00:00:00.000Z');
    expect(addSeconds('2024-02-28T23:59:59.000Z', 1)).toBe('2024-02-29T00:00:00.000Z');
  });

  it('음수면 과거로 간다', () => {
    expect(addSeconds('2026-01-01T00:00:00.000Z', -1)).toBe('2025-12-31T23:59:59.000Z');
  });

  it('diffSeconds 는 to - from 이고 부호를 보존한다', () => {
    expect(diffSeconds('2026-01-15T00:00:00.000Z', '2026-01-15T00:25:00.000Z')).toBe(1500);
    expect(diffSeconds('2026-01-15T00:25:00.000Z', '2026-01-15T00:00:00.000Z')).toBe(-1500);
    expect(diffSeconds('2026-01-15T00:00:00.000Z', '2026-01-15T00:00:00.500Z')).toBe(0.5);
  });
});
