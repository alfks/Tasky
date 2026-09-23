// 첫 페인트 스크립트를 **실제로 실행해** 검사한다(문자열 매칭이 아니다 — 문자열은 깨진 스크립트도 통과시킨다).
// 매 경우마다 TS 경로(`appliedTheme`)와 결과를 대조해 두 구현이 갈라지는 순간 실패하게 만든다.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_ACCENT_COLOR } from '@/domain/theme/palette';
import type { ThemeMode } from '@/domain/theme/settings';

import { FONT_PRELOAD, THEME_INIT_SCRIPT } from '@/features/theme/store/theme-head';
import {
  appliedTheme,
  THEME_COLOR,
  THEME_MIRROR_KEY,
  toMirror,
} from '@/features/theme/store/theme-state';

const SKY_DARK = '#6AAEE3';
const CORAL_LIGHT = '#FF8FA3';
const CORAL_DARK = '#E27A8E';

function stubMatchMedia(dark: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({ matches: dark && query.includes('dark'), media: query }) as MediaQueryList,
  );
}

/** 첫 페인트 스크립트를 파서가 만났을 때와 같은 상태로 되돌린 뒤 실행한다. */
function runInitScript(): void {
  const el = document.documentElement;
  el.removeAttribute('data-theme');
  el.removeAttribute('style');
  document.head.innerHTML = '<meta name="theme-color" content="#FAFAFC">';
  new Function(THEME_INIT_SCRIPT)();
}

function applied() {
  const el = document.documentElement;
  return {
    theme: el.getAttribute('data-theme'),
    colorScheme: el.style.getPropertyValue('color-scheme'),
    accent: el.style.getPropertyValue('--color-accent'),
    themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
});

describe('THEME_INIT_SCRIPT: 저장된 선택을 첫 페인트에 적용한다(R6·R11)', () => {
  const cases: [label: string, mode: ThemeMode, accentColor: string, systemDark: boolean][] = [
    ['명시 다크 + OS 라이트 — 명시가 이긴다', 'dark', DEFAULT_ACCENT_COLOR, false],
    ['명시 라이트 + OS 다크 — 명시가 이긴다', 'light', DEFAULT_ACCENT_COLOR, true],
    ['system + OS 다크 — OS 를 따른다', 'system', DEFAULT_ACCENT_COLOR, true],
    ['system + OS 라이트 — OS 를 따른다', 'system', DEFAULT_ACCENT_COLOR, false],
    ['강조색이 모드별 값으로 풀린다(다크)', 'dark', CORAL_LIGHT, false],
    ['강조색이 모드별 값으로 풀린다(라이트)', 'light', CORAL_LIGHT, true],
  ];

  it.each(cases)('%s', (_label, mode, accentColor, systemDark) => {
    window.localStorage.setItem(THEME_MIRROR_KEY, JSON.stringify(toMirror(mode, accentColor)));
    stubMatchMedia(systemDark);

    runInitScript();

    // 기대값은 손으로 적지 않고 TS 경로에서 만든다 — 두 구현이 갈라지면 여기서 잡힌다.
    const expected = appliedTheme({ mode, accentColor, systemDark });
    expect(applied()).toEqual({
      theme: expected.resolved,
      colorScheme: expected.resolved,
      accent: expected.accent,
      themeColor: THEME_COLOR[expected.resolved],
    });
  });

  it('프리셋 색의 다크 값과 라이트 값을 실제로 가른다(대칭 픽스처 방지용 고정값)', () => {
    window.localStorage.setItem(THEME_MIRROR_KEY, JSON.stringify(toMirror('dark', CORAL_LIGHT)));
    stubMatchMedia(false);
    runInitScript();
    expect(applied().accent).toBe(CORAL_DARK);
    expect(applied().accent).not.toBe(CORAL_LIGHT);
  });
});

describe('THEME_INIT_SCRIPT: 어떤 실패도 렌더를 막지 않는다', () => {
  it('미러가 없으면 OS 선호를 따르고 강조색은 건드리지 않는다(토큰 기본값 유지)', () => {
    stubMatchMedia(true);
    runInitScript();
    expect(applied().theme).toBe('dark');
    expect(applied().accent).toBe('');
  });

  it('미러가 손상돼도 예외 없이 OS 선호로 떨어진다', () => {
    window.localStorage.setItem(THEME_MIRROR_KEY, '{not json');
    stubMatchMedia(true);
    expect(() => runInitScript()).not.toThrow();
    expect(applied().theme).toBe('dark');
  });

  it('강조색이 HEX 가 아니면 무시한다(주입 방지)', () => {
    window.localStorage.setItem(
      THEME_MIRROR_KEY,
      JSON.stringify({ theme: 'dark', accent: { light: 'red; x:y', dark: 'url(javascript:1)' } }),
    );
    stubMatchMedia(false);
    runInitScript();
    expect(applied().theme).toBe('dark');
    expect(applied().accent).toBe('');
  });

  it('localStorage 접근이 막혀도(프라이빗 모드) 던지지 않는다', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    stubMatchMedia(true);
    expect(() => runInitScript()).not.toThrow();
    expect(applied().theme).toBe('dark');
    spy.mockRestore();
  });

  it('matchMedia 가 없는 환경에서도 라이트로 그린다', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(() => runInitScript()).not.toThrow();
    expect(applied().theme).toBe('light');
  });

  it('system 저장값이 OS 다크를 만나면 다크로 그린다 — 미러가 있어도 OS 를 본다', () => {
    window.localStorage.setItem(THEME_MIRROR_KEY, JSON.stringify(toMirror('system', SKY_DARK)));
    stubMatchMedia(true);
    runInitScript();
    expect(applied().theme).toBe('dark');
  });
});

describe('index.html 배선(R13·pwa R9)', () => {
  // `index.html` 이 실제로 나가는 <head> 다(ADR-0013 — 프리렌더 HTML 이 없다). 여기 있는 사본과
  // 이 모듈의 상수가 갈라지면, 위 describe 들이 검증한 동작과 실제로 브라우저가 실행하는 코드가 달라진다.
  const html = readFileSync(join(process.cwd(), 'index.html'), 'utf-8');
  const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
  const fontsCss = readFileSync(join(process.cwd(), 'src/styles/fonts.css'), 'utf-8');
  const inlineScript = /<script>([\s\S]*?)<\/script>/.exec(head);

  it('첫 페인트 스크립트 본문이 THEME_INIT_SCRIPT 와 같다 — 사본이 갈라지면 여기서 잡힌다', () => {
    expect(inlineScript?.[1]).toBe(THEME_INIT_SCRIPT);
  });

  it('preload href 가 fonts.css 의 @font-face url() 과 같다(R13·R14)', () => {
    const url = /url\('([^']+\.woff2)'\)/.exec(fontsCss)?.[1];
    expect(url).toBeDefined();
    expect(FONT_PRELOAD.href).toBe(url);
  });

  it('preload 는 폰트 1건이고 CORS 모드다 — 값은 FONT_PRELOAD 와 같다', () => {
    expect(FONT_PRELOAD).toMatchObject({ rel: 'preload', as: 'font', crossOrigin: 'anonymous' });
    const preloads = head.match(/<link[^>]*rel="preload"[^>]*>/g) ?? [];
    expect(preloads).toHaveLength(1);
    const tag = (preloads[0] ?? '').replace(/\s+/g, ' ');
    for (const [key, value] of [
      ['rel', FONT_PRELOAD.rel],
      ['as', FONT_PRELOAD.as],
      ['type', FONT_PRELOAD.type],
      ['href', FONT_PRELOAD.href],
      ['crossorigin', FONT_PRELOAD.crossOrigin],
    ]) {
      expect(tag).toContain(`${key}="${value}"`);
    }
  });

  it('theme-color 메타가 스크립트보다 먼저 나온다 — 순서가 바뀌면 스크립트가 못 찾는다', () => {
    const metaAt = head.indexOf('name="theme-color"');
    const scriptAt = head.indexOf('<script>');
    expect(metaAt).toBeGreaterThan(-1);
    expect(scriptAt).toBeGreaterThan(metaAt);
  });

  it('<html> 에 data-theme 을 박아 두지 않는다 — 박으면 스크립트·시스템 추종이 무력해진다', () => {
    expect(html).not.toMatch(/<html[^>]*data-theme=/);
    expect(html).toMatch(/<html lang="ko">/);
  });

  it('스크립트는 동기다(async·defer·type=module·src 금지 — 첫 페인트를 놓친다)', () => {
    const tag = /<script[^>]*>/.exec(head)?.[0] ?? '';
    expect(tag).toBe('<script>');
  });

  it('Cloudflare Web Analytics 비콘은 <head> 의 첫 스크립트가 아니다 — 동기 테마 스크립트가 먼저다(ADR-0021)', () => {
    const firstHeadScript = /<script[^>]*>/.exec(head)?.[0] ?? '';
    expect(firstHeadScript).not.toContain('cloudflareinsights');
  });

  it('Cloudflare Web Analytics 비콘은 <body> 에서 앱 진입 모듈 스크립트 뒤에 정확히 1건 나온다(ADR-0021)', () => {
    const beaconMatches = [
      ...html.matchAll(
        /<script[^>]*src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js"[^>]*>/g,
      ),
    ];
    expect(beaconMatches).toHaveLength(1);
    const tag = beaconMatches[0]?.[0] ?? '';
    expect(tag).toContain('defer');
    expect(tag).toMatch(/"token":\s*"d5be062eb83c46b9b9f5eb621f7a1342"/);

    const entryAt = html.search(/<script[^>]+type="module"[^>]+src="[^"]+"/);
    const beaconAt = html.indexOf(tag);
    expect(entryAt).toBeGreaterThan(-1);
    expect(beaconAt).toBeGreaterThan(entryAt);
  });
});
