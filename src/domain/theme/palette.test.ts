import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ACCENT_COLOR,
  findPaletteColor,
  isPaletteColor,
  normalizeHexColor,
  PALETTE,
  resolvePaletteColor,
} from '@/domain/theme/palette';

describe('PALETTE (theme §3-C)', () => {
  it('12색이고 id·라이트 HEX 가 서로 겹치지 않는다', () => {
    expect(PALETTE).toHaveLength(12);
    expect(new Set(PALETTE.map((c) => c.id)).size).toBe(12);
    expect(new Set(PALETTE.map((c) => c.light)).size).toBe(12);
    expect(new Set(PALETTE.map((c) => c.dark)).size).toBe(12);
  });

  it('모든 값이 대문자 #RRGGBB 이고 한국어 이름을 갖는다', () => {
    for (const color of PALETTE) {
      expect(color.light).toMatch(/^#[0-9A-F]{6}$/);
      expect(color.dark).toMatch(/^#[0-9A-F]{6}$/);
      expect(color.name.length).toBeGreaterThan(0);
    }
  });

  it('기본 강조색은 스카이의 라이트 값이다 (theme R3, category R18)', () => {
    const sky = PALETTE.find((c) => c.id === 'sky');
    expect(DEFAULT_ACCENT_COLOR).toBe(sky?.light);
  });
});

describe('조회·정규화', () => {
  it('소문자·공백 표기를 저장 표기로 맞춘다', () => {
    expect(normalizeHexColor('  #ff8fa3 ')).toBe('#FF8FA3');
    expect(normalizeHexColor('#FFF')).toBeUndefined();
    expect(normalizeHexColor('red')).toBeUndefined();
  });

  it('프리셋 안팎을 구분한다', () => {
    expect(findPaletteColor('#ff8fa3')?.id).toBe('coral');
    expect(findPaletteColor('#123456')).toBeUndefined();
    expect(isPaletteColor(DEFAULT_ACCENT_COLOR)).toBe(true);
    expect(isPaletteColor('#123456')).toBe(false);
  });
});

describe('resolvePaletteColor (theme R3·R4)', () => {
  it('프리셋은 모드에 맞는 값을 돌려준다', () => {
    expect(resolvePaletteColor('#FF8FA3', 'light')).toBe('#FF8FA3');
    expect(resolvePaletteColor('#FF8FA3', 'dark')).toBe('#E27A8E');
  });

  it('프리셋 밖 HEX 는 두 모드에서 그대로 쓴다(오류가 아니다)', () => {
    expect(resolvePaletteColor('#123456', 'light')).toBe('#123456');
    expect(resolvePaletteColor('#123456', 'dark')).toBe('#123456');
    expect(resolvePaletteColor('somehow-invalid', 'dark')).toBe('somehow-invalid');
  });
});
