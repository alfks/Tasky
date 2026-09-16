import { describe, expect, it } from 'vitest';

import {
  EMPTY_MEMORY,
  isQuotaTight,
  needsStorageNotice,
  parseMemory,
  serializeMemory,
  usageRatio,
} from '@/features/pwa/store/pwa-state';

describe('usageRatio', () => {
  it('정상 값은 비율을 돌려준다', () => {
    expect(usageRatio({ usage: 50, quota: 200 })).toBe(0.25);
  });

  it.each([
    ['값을 못 얻음', null],
    ['quota 0 — 나눗셈이 Infinity 가 된다', { usage: 1, quota: 0 }],
    ['quota 음수', { usage: 1, quota: -5 }],
    ['usage 음수', { usage: -1, quota: 100 }],
    ['NaN', { usage: Number.NaN, quota: 100 }],
    ['Infinity', { usage: 1, quota: Number.POSITIVE_INFINITY }],
  ])('%s 이면 null 이다', (_label, estimate) => {
    expect(usageRatio(estimate)).toBeNull();
  });
});

describe('isQuotaTight', () => {
  it('80% 를 넘으면 경고한다', () => {
    expect(isQuotaTight({ usage: 81, quota: 100 })).toBe(true);
  });

  it('정확히 80% 는 아직 경고하지 않는다', () => {
    expect(isQuotaTight({ usage: 80, quota: 100 })).toBe(false);
  });

  it('값을 못 얻었거나 quota 가 0 이면 경고하지 않는다 — 브라우저마다 estimate 가 다르다', () => {
    expect(isQuotaTight(null)).toBe(false);
    expect(isQuotaTight({ usage: 999, quota: 0 })).toBe(false);
  });
});

describe('needsStorageNotice', () => {
  it('거부·미지원은 배너를 띄우고, 승인·미요청은 띄우지 않는다', () => {
    expect(needsStorageNotice('denied')).toBe(true);
    expect(needsStorageNotice('unsupported')).toBe(true);
    expect(needsStorageNotice('granted')).toBe(false);
    expect(needsStorageNotice('unknown')).toBe(false);
  });
});

describe('parseMemory', () => {
  it('저장된 값을 그대로 읽는다', () => {
    const memory = { persistAsked: true, noticeDismissed: true };
    expect(parseMemory(serializeMemory(memory))).toEqual(memory);
  });

  it.each([
    ['없음', null],
    ['깨진 JSON', '{'],
    ['객체가 아님', '"x"'],
    ['null', 'null'],
    ['모양이 다름', '{"foo":1}'],
    ['문자열 true — 진짜 true 가 아니다', '{"persistAsked":"true"}'],
  ])('%s 이면 기본값으로 접는다(여기서 throw 하면 앱 시작이 막힌다)', (_label, raw) => {
    expect(parseMemory(raw)).toEqual(EMPTY_MEMORY);
  });
});
