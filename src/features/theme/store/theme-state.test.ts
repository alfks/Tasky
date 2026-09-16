// 순수 변환과 미러 파싱. 픽스처는 **비대칭으로** 고른다 — 라이트/다크가 같은 값이면
// "무엇을 고르든 통과하는" 테스트가 되어 아무것도 검사하지 못한다(이 레포의 반복 결함).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  appliedTheme,
  parseMirror,
  resolveTheme,
  THEME_COLOR,
  THEME_MIRROR_KEY,
  toggledMode,
  toMirror,
} from '@/features/theme/store/theme-state';

/** 스카이 프리셋 — 라이트와 다크 값이 다르다(§3-C). */
const SKY_LIGHT = '#7CC6FF';
const SKY_DARK = '#6AAEE3';
/** 팔레트 밖 색(가져오기 — R4). 두 모드에서 같은 값이어야 한다. */
const OUTSIDE = '#123456';

describe('resolveTheme: 모드 × OS 선호(R6·R7)', () => {
  it('system 은 OS 를 따른다 — 양방향', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('명시 선택은 OS 를 이긴다 — 양방향', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('appliedTheme: 강조색은 모드에 맞게 풀린다(R3·R4)', () => {
  it('프리셋 색은 모드별로 다른 HEX 가 된다', () => {
    expect(appliedTheme({ mode: 'light', accentColor: SKY_LIGHT, systemDark: false })).toEqual({
      resolved: 'light',
      accent: SKY_LIGHT,
    });
    expect(appliedTheme({ mode: 'dark', accentColor: SKY_LIGHT, systemDark: false })).toEqual({
      resolved: 'dark',
      accent: SKY_DARK,
    });
  });

  it('system 모드에서는 OS 선호가 강조색까지 바꾼다', () => {
    expect(appliedTheme({ mode: 'system', accentColor: SKY_LIGHT, systemDark: true }).accent).toBe(
      SKY_DARK,
    );
    expect(appliedTheme({ mode: 'system', accentColor: SKY_LIGHT, systemDark: false }).accent).toBe(
      SKY_LIGHT,
    );
  });

  it('팔레트 밖 색은 두 모드에서 그대로다(R4)', () => {
    expect(appliedTheme({ mode: 'dark', accentColor: OUTSIDE, systemDark: false }).accent).toBe(
      OUTSIDE,
    );
    expect(appliedTheme({ mode: 'light', accentColor: OUTSIDE, systemDark: false }).accent).toBe(
      OUTSIDE,
    );
  });
});

describe('toggledMode: ☾ 버튼이 고를 다음 모드(§2)', () => {
  it('지금 보이는 것의 반대를 명시 모드로 고정한다', () => {
    expect(toggledMode({ mode: 'system', systemDark: true })).toBe('light');
    expect(toggledMode({ mode: 'system', systemDark: false })).toBe('dark');
    expect(toggledMode({ mode: 'light', systemDark: true })).toBe('dark');
    expect(toggledMode({ mode: 'dark', systemDark: false })).toBe('light');
  });
});

describe('미러 직렬화(R6·R8)', () => {
  it('모드별 강조색을 미리 풀어 담는다 — 스크립트가 팔레트를 몰라도 되게', () => {
    expect(toMirror('dark', SKY_LIGHT)).toEqual({
      theme: 'dark',
      accent: { light: SKY_LIGHT, dark: SKY_DARK },
    });
  });

  it('왕복한다', () => {
    const mirror = toMirror('light', SKY_LIGHT);
    expect(parseMirror(JSON.stringify(mirror))).toEqual(mirror);
  });

  it.each([
    ['없음', null],
    ['JSON 아님', '{'],
    ['객체 아님', '"dark"'],
    ['모드 없음', '{"accent":{"light":"#7CC6FF","dark":"#6AAEE3"}}'],
    ['모드가 목록 밖', '{"theme":"sepia","accent":{"light":"#7CC6FF","dark":"#6AAEE3"}}'],
    ['강조색 없음', '{"theme":"dark"}'],
    ['강조색이 문자열 아님', '{"theme":"dark","accent":{"light":1,"dark":2}}'],
    ['null', 'null'],
  ])(
    '손상된 미러(%s)는 예외 없이 undefined 다 — 캐시라서 없으면 기본값으로 시작한다',
    (_l, raw) => {
      expect(parseMirror(raw)).toBeUndefined();
    },
  );
});

describe('상수가 다른 파일의 단일 소스와 어긋나지 않는다', () => {
  const tokens = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf-8');

  /** tokens.css 블록 안의 `--color-bg` 를 뽑는다(대소문자 표기는 파일을 따른다). */
  function bgIn(blockMarker: string): string {
    const start = tokens.indexOf(blockMarker);
    expect(start).toBeGreaterThan(-1);
    const match = /--color-bg:\s*(#[0-9a-fA-F]{6})/.exec(tokens.slice(start));
    return (match?.[1] ?? '').toUpperCase();
  }

  it('THEME_COLOR 가 tokens.css 의 --color-bg 와 같다(pwa R9)', () => {
    expect(THEME_COLOR.light).toBe(bgIn('@theme {'));
    expect(THEME_COLOR.dark).toBe(bgIn(":root[data-theme='dark'] {"));
    // 두 값이 같으면 위 두 단언이 모두 통과해도 아무것도 구분하지 못한다.
    expect(THEME_COLOR.light).not.toBe(THEME_COLOR.dark);
  });

  it('미러 키는 스펙이 정한 이름 그대로다(R6)', () => {
    expect(THEME_MIRROR_KEY).toBe('tasky.theme.v1');
  });
});
