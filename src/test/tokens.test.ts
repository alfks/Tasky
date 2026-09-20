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

interface ShadowLayer {
  offset: number;
  blur: number;
  alpha: number;
}

/** `0 1px 2px rgb(0 0 0 / 0.05), 0 4px 12px rgb(0 0 0 / 0.07)` → 겹 배열(y 오프셋·흐림·알파). */
function parseShadowLayers(value: string | undefined): ShadowLayer[] {
  if (value === undefined) throw new Error('그림자 토큰이 없다');
  return value.split('),').map((raw) => {
    const m = /^\s*0 (-?[\d.]+)px ([\d.]+)px rgb\(0 0 0 \/ ([\d.]+)\)?/.exec(raw);
    if (m === null) throw new Error(`그림자 겹을 읽지 못함: ${raw}`);
    return { offset: Number(m[1]), blur: Number(m[2]), alpha: Number(m[3]) };
  });
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

// docs/specs/theme.md §3-H — [토큰, 라이트, 다크] (기록 없음 → 100%, 진해지는 순서)
// — 잉크 명도 램프, 4단계 = --color-text
const HEATMAP: [string, string, string][] = [
  ['color-heatmap-0', '#e7e7f0', '#28282f'],
  ['color-heatmap-1', '#73747b', '#43434a'],
  ['color-heatmap-2', '#5a5a61', '#5d5d64'],
  ['color-heatmap-3', '#414249', '#787880'],
  ['color-heatmap-4', '#2b2b33', '#ededf2'],
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

  it('그림자 2종, 둘 다 두 겹(접촉+퍼짐)이고 다크에서 알파가 짙어진다', () => {
    // 두 겹인 이유: 한 겹짜리 `0 1px 2px/.06` 은 찍힌 픽셀이 2px 띠·1.102:1 이라 같은 카드의
    // 1px 보더(1.192:1)보다 약했다(T-63 실측). 퍼짐 층이 그 띠를 13px·1.218:1 로 넓힌다.
    // md 의 접촉 겹은 T-66 이 넣었다 — 그전까지 md 는 퍼짐 한 겹뿐이라 접촉 픽셀에서 사다리가
    // 뒤집혀 있었다(sm 228 vs md 236). 알파는 sm 과 같고 기하만 두 배다(R23).
    expect(runtime.get('elev-sm')).toBe(
      '0 1px 2px rgb(0 0 0 / 0.05), 0 4px 12px rgb(0 0 0 / 0.07)',
    );
    expect(runtime.get('elev-md')).toBe(
      '0 2px 4px rgb(0 0 0 / 0.05), 0 6px 20px rgb(0 0 0 / 0.08)',
    );
    for (const dark of [mediaDark, explicitDark]) {
      expect(dark.get('elev-sm')).toBe('0 1px 2px rgb(0 0 0 / 0.3), 0 4px 12px rgb(0 0 0 / 0.36)');
      expect(dark.get('elev-md')).toBe('0 2px 4px rgb(0 0 0 / 0.3), 0 6px 20px rgb(0 0 0 / 0.45)');
    }
  });

  it('고도 사다리가 단조다 — 모든 겹에서 md 가 sm 보다 낮지 않다(R23)', () => {
    // 위 테스트가 문자열을 고정한다면 이건 **관계**를 고정한다. 값이 나중에 바뀌더라도 사다리가
    // 다시 뒤집히면(낮은 단이 더 진해지면) 여기서 걸린다. 접촉 겹의 오프셋/흐림 비가 sm 이상이면
    // 같은 알파로도 감쇠 곡선이 sm 아래에 깔린다 — 실측으로 14개 표본 전부 md ≤ sm(밝기)이다.
    for (const [name, scope] of [
      ['라이트', runtime],
      ['@media 다크', mediaDark],
      ['명시 다크', explicitDark],
    ] as const) {
      const sm = parseShadowLayers(scope.get('elev-sm'));
      const md = parseShadowLayers(scope.get('elev-md'));
      expect(md.length, `${name}: 겹 수`).toBe(sm.length);
      md.forEach((layer, i) => {
        const lower = sm[i] as ShadowLayer;
        expect(layer.alpha, `${name} ${i}겹: 알파`).toBeGreaterThanOrEqual(lower.alpha);
        expect(layer.offset, `${name} ${i}겹: 오프셋`).toBeGreaterThanOrEqual(lower.offset);
        expect(layer.blur, `${name} ${i}겹: 흐림`).toBeGreaterThanOrEqual(lower.blur);
      });
      const contact = md[0] as ShadowLayer;
      const lowerContact = sm[0] as ShadowLayer;
      expect(
        contact.offset / contact.blur,
        `${name}: 접촉 겹의 오프셋/흐림 비`,
      ).toBeGreaterThanOrEqual(lowerContact.offset / lowerContact.blur);
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

  it('모션 4단계 + 이징, reduced-motion 에서 전부 0ms(R5)', () => {
    // xfast 는 date-strip R10("애니메이션은 120ms 페이드 이하")을 토큰으로 지키는 단계다.
    // 이 단언이 §3-D 표와 토큰을 묶어 둔다 — 한쪽만 바뀌면 여기서 죽는다.
    expect(base.get('motion-xfast')).toBe('120ms');
    expect(base.get('motion-fast')).toBe('150ms');
    expect(base.get('motion-base')).toBe('200ms');
    expect(base.get('motion-slow')).toBe('300ms');
    expect(reducedMotion.get('motion-xfast')).toBe('0ms');
    expect(reducedMotion.get('motion-fast')).toBe('0ms');
    expect(reducedMotion.get('motion-base')).toBe('0ms');
    expect(reducedMotion.get('motion-slow')).toBe('0ms');
  });

  it('120ms 상한을 지키는 모션 토큰이 정확히 하나다(R10 을 어디에 걸지 헷갈릴 자리가 없게)', () => {
    const durations = [...base.entries()].filter(
      ([token, value]) => token.startsWith('motion-') && value.endsWith('ms'),
    );
    expect(durations.filter(([, value]) => Number.parseInt(value, 10) <= 120)).toEqual([
      ['motion-xfast', '120ms'],
    ]);
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
    // globals.css 가 import 한다(next/font 경로는 빌드 스택에 없다 — ADR-0013). tokens.css 는 값만 갖는다.
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

/** `var(--x)` 를 가리키는 토큰을 실제 HEX 까지 따라간다(선택 토큰은 다른 토큰을 가리킨다). */
function resolve(decls: Map<string, string>, token: string): string {
  const value = decls.get(token);
  if (value === undefined) throw new Error(`토큰 없음: --${token}`);
  const alias = /^var\(--([\w-]+)\)$/.exec(value);
  return alias === null ? value : resolve(decls, alias[1] as string);
}

// 테마별 "최종 값" 조회표. 다크는 라이트 위에 재정의를 덮어 만든다(CSS 캐스케이드와 같은 순서).
const LIGHT_ALL = new Map([...base, ...runtime, ...themeInline]);
const DARK_ALL = new Map([...LIGHT_ALL, ...explicitDark]);
const SURFACES = ['color-bg', 'color-surface', 'color-surface-2'] as const;

describe('대비 계산기 자체 검증(이게 틀리면 아래 테스트는 전부 무의미하다)', () => {
  it('알려진 값과 일치한다', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 2);
    expect(contrastRatio('#7cc6ff', '#fafafc')).toBeCloseTo(1.77, 2); // 날짜 스트립 선택 셀 실측
    expect(contrastRatio('#6aaee3', '#1c1c22')).toBeCloseTo(7.09, 2); // 커맨드 팔레트 선택 행(다크)
    expect(contrastRatio('#e05a6b', '#ffffff')).toBeCloseTo(3.59, 2); // theme.md R9 의 danger
    expect(contrastRatio('#e6e6ec', '#ffffff')).toBeCloseTo(1.24, 2); // theme.md R9 의 border
    expect(contrastRatio('#fafafc', '#fafafc')).toBeCloseTo(1, 5);
  });
});

describe('디자인 토큰: "선택됨" 표현(§3-G)', () => {
  it('선택 토큰은 새 색을 만들지 않고 기존 토큰을 가리킨다(R18)', () => {
    expect(themeInline.get('color-selected')).toBe('var(--color-accent)');
    expect(themeInline.get('color-on-selected')).toBe('var(--color-on-accent)');
    expect(themeInline.get('color-selected-ring')).toBe('var(--color-text)');
    // 값이 아니라 참조라서 라이트/다크·강조색 변경을 자동으로 따라간다 — 다크 블록에 짝을
    // 다시 적을 필요가 없고, 적으면 오히려 두 곳이 갈린다.
    expect(mediaDark.has('color-selected-ring')).toBe(false);
    expect(explicitDark.has('color-selected-ring')).toBe(false);
  });

  it('링 두께는 2px 이고 미체크 체크박스 테두리와 같다(R17)', () => {
    expect(base.get('control-selected-ring')).toBe('2px');
    expect(base.get('control-selected-ring')).toBe(base.get('control-checkbox-border'));
  });

  it.each([
    ['라이트', LIGHT_ALL],
    ['다크', DARK_ALL],
  ] as const)('%s — 선택 링이 모든 면과 ≥ 3:1 (1.4.11 을 지는 선)', (_name, decls) => {
    const ring = resolve(decls, 'color-selected-ring');
    for (const surface of SURFACES) {
      expect(contrastRatio(ring, resolve(decls, surface))).toBeGreaterThanOrEqual(3);
    }
  });

  // 라이트: 파스텔 채움은 배경과 1.14~2.16:1 로 12색 전부 3:1 에 못 미친다(§3-G 표). 그래서
  // 라이트에서 상태를 식별시키는 것은 **링 vs 채움** 이다. 프리셋이 파스텔 범위를 벗어나
  // 어두워지면 잉크 링이 채움에 묻히고 이 단언이 죽는다 — 그게 이 테스트의 목적이다.
  it.each(PALETTE)('라이트 %s — 선택 링 vs 채움 ≥ 3:1', (_id, light) => {
    expect(contrastRatio(resolve(LIGHT_ALL, 'color-selected-ring'), light)).toBeGreaterThanOrEqual(
      3,
    );
  });

  // 다크: 채움 자체가 배경과 5.8:1 이상이라 채움이 상태를 식별시킨다(링은 언어 통일용).
  it.each(PALETTE)('다크 %s — 선택 채움 vs 배경/면 ≥ 3:1', (_id, _light, dark) => {
    for (const surface of SURFACES) {
      expect(contrastRatio(dark, resolve(DARK_ALL, surface))).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(PALETTE)('%s — 채움 위 글자(on-selected) ≥ 4.5:1 (라이트/다크)', (_id, light, dark) => {
    expect(contrastRatio(resolve(LIGHT_ALL, 'color-on-selected'), light)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrastRatio(resolve(DARK_ALL, 'color-on-selected'), dark)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('디자인 토큰: 데이터 표현 색 — 히트맵 진하기 5단계(§3-H)', () => {
  it.each(HEATMAP)('%s — 라이트 %s / 다크 %s 가 정확히 대응한다', (token, light, dark) => {
    expect(base.get(token)).toBe(light);
    expect(mediaDark.get(token)).toBe(dark);
    expect(explicitDark.get(token)).toBe(dark);
  });

  it('정확히 5단계다(더 많지도 적지도 않다) — 라이트·두 다크 블록 모두', () => {
    // 다크 두 블록에만 6번째 토큰이 몰래 생기면 base 카운트만으로는 안 걸린다(Nit).
    for (const [name, scope] of [
      ['라이트(base)', base],
      ['@media 다크', mediaDark],
      ['명시 다크', explicitDark],
    ] as const) {
      const tokens = [...scope.keys()].filter((k) => /^color-heatmap-\d+$/.test(k));
      expect(tokens, name).toHaveLength(5);
    }
  });

  it('4단계는 --color-text 와 같다(R24)', () => {
    expect(base.get('color-heatmap-4')).toBe(base.get('color-text'));
    expect(explicitDark.get('color-heatmap-4')).toBe(explicitDark.get('color-text'));
  });

  it('다섯 값 모두 무채색이다(R24) — RGB 채널 최대-최소 ≤ 10', () => {
    const chroma = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return (
        Math.max(r as number, g as number, b as number) -
        Math.min(r as number, g as number, b as number)
      );
    };
    for (const [token, light, dark] of HEATMAP) {
      expect(chroma(light), `${token} 라이트`).toBeLessThanOrEqual(10);
      expect(chroma(dark), `${token} 다크`).toBeLessThanOrEqual(10);
    }
  });

  it.each([
    ['라이트', SURFACES.map((s) => base.get(s) as string)],
    ['다크', SURFACES.map((s) => explicitDark.get(s) as string)],
  ] as const)(
    '%s — 세 면(bg·surface·surface-2) 모두에서 대비가 단조 증가한다(R25)',
    (name, surfaces) => {
      const cells =
        name === '라이트' ? HEATMAP.map(([, light]) => light) : HEATMAP.map(([, , dark]) => dark);
      for (const surface of surfaces) {
        const ratios = cells.map((hex) => contrastRatio(hex, surface));
        for (let i = 1; i < ratios.length; i += 1) {
          expect(ratios[i], `${name} ${surface}: 단계 ${i - 1}→${i}`).toBeGreaterThan(
            ratios[i - 1],
          );
        }
      }
    },
  );

  it('인접 단계 사이 대비가 라이트 ≥ 1.35 / 다크 ≥ 1.45 이다(R25, 육안 구분 기준)', () => {
    for (let i = 1; i < HEATMAP.length; i += 1) {
      const [, lightHi, darkHi] = HEATMAP[i] as [string, string, string];
      const [, lightLo, darkLo] = HEATMAP[i - 1] as [string, string, string];
      expect(contrastRatio(lightHi, lightLo), `라이트 단계 ${i - 1}→${i}`).toBeGreaterThanOrEqual(
        1.35,
      );
      expect(contrastRatio(darkHi, darkLo), `다크 단계 ${i - 1}→${i}`).toBeGreaterThanOrEqual(1.45);
    }
  });

  it.each(PALETTE)(
    '단계 1~4 가 %s 프리셋과 대비 ≥ 1.3 이다(R26 — 카테고리 색과 혼동되지 않는다)',
    (_id, light, dark) => {
      for (const [, lightHex, darkHex] of HEATMAP.slice(1)) {
        expect(contrastRatio(lightHex, light)).toBeGreaterThanOrEqual(1.3);
        expect(contrastRatio(darkHex, dark)).toBeGreaterThanOrEqual(1.3);
      }
    },
  );

  it('단계 1~4 가 sky(기본 강조색)와 대비 ≥ 1.8 이다(R26)', () => {
    const sky = PALETTE.find(([id]) => id === 'sky') as [string, string, string];
    const [, skyLight, skyDark] = sky;
    for (const [, lightHex, darkHex] of HEATMAP.slice(1)) {
      expect(contrastRatio(lightHex, skyLight)).toBeGreaterThanOrEqual(1.8);
      expect(contrastRatio(darkHex, skyDark)).toBeGreaterThanOrEqual(1.8);
    }
  });
});

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
