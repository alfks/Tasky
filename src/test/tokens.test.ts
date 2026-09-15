// src/styles 는 .css 만 허용(아키텍처 규칙, src/styles/AGENTS.md 규칙 5) 이라
// 토큰 값을 검사하는 테스트는 여기(src/test/)에 둔다.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const tokensPath = join(process.cwd(), 'src/styles/tokens.css');
const CSS = readFileSync(tokensPath, 'utf-8');
const GLOBALS = readFileSync(join(process.cwd(), 'src/styles/globals.css'), 'utf-8');

/** startMarker 다음 첫 '{' 부터 짝이 맞는 '}' 까지의 내용을 돌려준다(중첩 블록 포함). */
function extractBlock(source: string, startMarker: string): string {
  const markerIndex = source.indexOf(startMarker);
  if (markerIndex === -1) throw new Error(`블록을 찾지 못함: ${startMarker}`);
  const openIndex = source.indexOf('{', markerIndex);
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, i);
    }
  }
  throw new Error(`짝이 맞는 '}' 를 찾지 못함: ${startMarker}`);
}

/** 블록 텍스트에서 `--토큰: 값;` 선언을 전부 뽑아 Map 으로 돌려준다. */
function parseDecls(block: string): Map<string, string> {
  const decls = new Map<string, string>();
  const re = /--([\w-]+):\s*([^;]+);/g;
  for (const match of block.matchAll(re)) {
    decls.set(match[1] as string, (match[2] as string).trim().replace(/\s+/g, ' '));
  }
  return decls;
}

const base = parseDecls(extractBlock(CSS, '@theme {'));
// 유틸을 만들면 안 되는 토큰(그림자 값 --elev-*, 카테고리 팔레트)은 @theme 밖 :root 에 있다.
const runtime = parseDecls(extractBlock(CSS, ':root {'));
const themeInline = parseDecls(extractBlock(CSS, '@theme inline {'));
const mediaDark = parseDecls(extractBlock(CSS, '@media (prefers-color-scheme: dark) {'));
const explicitDark = parseDecls(extractBlock(CSS, ":root[data-theme='dark'] {"));
const reducedMotion = parseDecls(extractBlock(CSS, '@media (prefers-reduced-motion: reduce) {'));

// docs/specs/theme.md §3-A — [토큰, 라이트, 다크]
const SEMANTIC: [string, string, string][] = [
  ['color-bg', '#fafafc', '#141418'],
  ['color-surface', '#ffffff', '#1c1c22'],
  ['color-surface-2', '#f3f3f7', '#26262e'],
  ['color-text', '#2b2b33', '#ededf2'],
  ['color-muted', '#6f6f7a', '#a0a0aa'],
  ['color-faint', '#b8b8c0', '#5a5a66'],
  ['color-border', '#e6e6ec', '#2e2e38'],
  ['color-accent', '#7cc6ff', '#6aaee3'], // 기본 프리셋(스카이)
  ['color-on-accent', '#1f1f26', '#1f1f26'],
  ['color-focus', '#4a7bd0', '#8fb6ff'],
  ['color-danger', '#e05a6b', '#f0808e'],
  ['color-saturday', '#5b8def', '#8fb6ff'],
  ['color-sunday', '#e06b7d', '#f08a9a'],
];

// docs/specs/theme.md §3-C — [id, 라이트, 다크]
const PALETTE: [string, string, string][] = [
  ['coral', '#ff8fa3', '#e27a8e'],
  ['peach', '#ffb38a', '#e39a73'],
  ['orange', '#ffc978', '#e3ae63'],
  ['yellow', '#ffeb99', '#e0cd7e'],
  ['lime', '#cfeb8f', '#b3cf76'],
  ['mint', '#a8e6b0', '#8ccb95'],
  ['teal', '#8fdcd0', '#76c1b6'],
  ['sky', '#7cc6ff', '#6aaee3'],
  ['blue', '#9db8f5', '#829ed9'],
  ['lavender', '#b5a8f0', '#9b8ed6'],
  ['lilac', '#d8b8e8', '#bc9ecc'],
  ['gray', '#c9ccd6', '#9ea1ab'],
];

describe('디자인 토큰: 의미 토큰(§3-A)', () => {
  it.each(SEMANTIC)('%s — 라이트 %s / 다크 %s 가 정확히 대응한다', (token, light, dark) => {
    expect(base.get(token)).toBe(light);
    expect(mediaDark.get(token)).toBe(dark);
    expect(explicitDark.get(token)).toBe(dark);
  });
});

describe('디자인 토큰: 카테고리 팔레트 12색(§3-C)', () => {
  it.each(PALETTE)('cat-%s — 라이트 %s / 다크 %s 가 정확히 대응한다', (id, light, dark) => {
    expect(runtime.get(`color-cat-${id}`)).toBe(light);
    expect(runtime.get(`color-cat-${id}-dark`)).toBe(dark);
  });

  it('정확히 12색이다(더 많지도 적지도 않다)', () => {
    const ids = [...runtime.keys()].filter(
      (k) => /^color-cat-[\w-]+$/.test(k) && !k.endsWith('-dark'),
    );
    expect(ids).toHaveLength(12);
  });

  it('@theme 밖에 둬서 bg-cat-* 유틸이 생기지 않는다(R1 우회 경로 차단)', () => {
    expect([...base.keys()].filter((k) => k.startsWith('color-cat-'))).toHaveLength(0);
  });
});

describe('디자인 토큰: 형태·간격·타이포·모션·z-index(§3-D)', () => {
  it('라운드 5종', () => {
    expect(base.get('radius-sm')).toBe('8px');
    expect(base.get('radius-md')).toBe('12px');
    expect(base.get('radius-lg')).toBe('16px');
    expect(base.get('radius-xl')).toBe('20px');
    expect(base.get('radius-full')).toBe('9999px');
  });

  it('간격 8단계 = 4·8·12·16·20·24·32·48px', () => {
    const expected = [4, 8, 12, 16, 20, 24, 32, 48];
    expected.forEach((px, i) => expect(base.get(`space-${i + 1}`)).toBe(`${px}px`));
  });

  it('글자 크기 8단계 + 행간 1.5', () => {
    const expected: [string, string][] = [
      ['xs', '12px'],
      ['sm', '13px'],
      ['base', '14px'],
      ['md', '15px'],
      ['lg', '17px'],
      ['xl', '20px'],
      ['2xl', '24px'],
      ['3xl', '30px'],
    ];
    expected.forEach(([suffix, px]) => expect(base.get(`text-${suffix}`)).toBe(px));
    expect(base.get('leading-normal')).toBe('1.5');
  });

  it('굵기는 400/600/700 세 단계만(§3-F R11)', () => {
    expect(base.get('font-weight-regular')).toBe('400');
    expect(base.get('font-weight-semibold')).toBe('600');
    expect(base.get('font-weight-bold')).toBe('700');
  });

  it('그림자 2종, 다크에서 알파값이 짙어진다(라이트 .06/.08 → 다크 .30/.45)', () => {
    expect(runtime.get('elev-sm')).toBe('0 1px 2px rgb(0 0 0 / 0.06)');
    expect(runtime.get('elev-md')).toBe('0 6px 20px rgb(0 0 0 / 0.08)');
    for (const dark of [mediaDark, explicitDark]) {
      expect(dark.get('elev-sm')).toBe('0 1px 2px rgb(0 0 0 / 0.3)');
      expect(dark.get('elev-md')).toBe('0 6px 20px rgb(0 0 0 / 0.45)');
    }
  });

  it('그림자 유틸(.shadow-*)이 빌드 시점 라이트 값으로 굳지 않는다', () => {
    // @theme 에 리터럴을 등록하면 Tailwind 가 색을 뽑아 .shadow-md 안에 굽고, 다크 재정의가
    // 무시된다(리뷰 실측). 값은 --elev-* 에만 두고 @theme inline 으로 var() 를 흘려보낸다.
    expect(base.has('shadow-sm')).toBe(false);
    expect(base.has('shadow-md')).toBe(false);
    expect(themeInline.get('shadow-sm')).toBe('var(--elev-sm)');
    expect(themeInline.get('shadow-md')).toBe('var(--elev-md)');
  });

  it('모션 3단계 + 이징, reduced-motion 에서 전부 0ms(R5)', () => {
    expect(base.get('motion-fast')).toBe('150ms');
    expect(base.get('motion-base')).toBe('200ms');
    expect(base.get('motion-slow')).toBe('300ms');
    expect(reducedMotion.get('motion-fast')).toBe('0ms');
    expect(reducedMotion.get('motion-base')).toBe('0ms');
    expect(reducedMotion.get('motion-slow')).toBe('0ms');
  });

  it('z-index 5단계', () => {
    expect(base.get('z-base')).toBe('0');
    expect(base.get('z-sticky')).toBe('10');
    expect(base.get('z-popover')).toBe('20');
    expect(base.get('z-modal')).toBe('30');
    expect(base.get('z-toast')).toBe('40');
  });
});

describe('디자인 토큰: 폰트 스택(§3-F R10)', () => {
  it('Pretendard 우선, 외부 폰트 요청 없이 시스템 폴백으로 끝난다', () => {
    const stack = base.get('font-sans');
    expect(stack).toBeDefined();
    expect(stack).toMatch(/^'Pretendard Variable', Pretendard,/);
    expect(stack).toMatch(/sans-serif$/);
    expect(stack).not.toMatch(/@import|googleapis|fonts\.google/);
  });

  it('tokens.css 는 @font-face 를 갖지 않는다(폰트 파일 선언은 fonts.css 한 곳)', () => {
    // 임시 상태가 아니라 유지할 분리다: @font-face 는 src/styles/fonts.css 에만 두고
    // globals.css 가 import 한다(next/font 는 ADR-0010 으로 폐기). tokens.css 는 값만 갖는다.
    expect(CSS).not.toMatch(/@font-face/);
    expect(GLOBALS).toMatch(/@import\s+'\.\/fonts\.css';/);
  });
});

// R9(theme.md §7 완료 조건): 상대 휘도 기반 WCAG 대비 계산.
function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linearize = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [lr, lg, lb] = [r, g, b].map(linearize) as [number, number, number];
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrastRatio(hexA: string, hexB: string): number {
  const [l1, l2] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a);
  return ((l1 as number) + 0.05) / ((l2 as number) + 0.05);
}

describe('디자인 토큰: 접근성 대비(R9)', () => {
  it('본문 텍스트 대비 ≥ 12:1(라이트/다크)', () => {
    expect(
      contrastRatio(base.get('color-text') as string, base.get('color-bg') as string),
    ).toBeGreaterThanOrEqual(12);
    expect(
      contrastRatio(
        explicitDark.get('color-text') as string,
        explicitDark.get('color-bg') as string,
      ),
    ).toBeGreaterThanOrEqual(12);
  });

  it('보조 텍스트(muted) 대비 ≥ 4.5:1, bg·surface 기준 라이트/다크', () => {
    for (const surface of ['color-bg', 'color-surface']) {
      expect(
        contrastRatio(base.get('color-muted') as string, base.get(surface) as string),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(
          explicitDark.get('color-muted') as string,
          explicitDark.get(surface) as string,
        ),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('포커스 링 대비 ≥ 3:1, bg·surface 기준 라이트/다크', () => {
    for (const surface of ['color-bg', 'color-surface']) {
      expect(
        contrastRatio(base.get('color-focus') as string, base.get(surface) as string),
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrastRatio(
          explicitDark.get('color-focus') as string,
          explicitDark.get(surface) as string,
        ),
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(PALETTE)(
    '강조색 위 글자(on-accent) 대비 ≥ 4.5:1 — %s 프리셋(라이트/다크)',
    (_id, light, dark) => {
      const onAccent = base.get('color-on-accent') as string;
      expect(contrastRatio(onAccent, light)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(onAccent, dark)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
