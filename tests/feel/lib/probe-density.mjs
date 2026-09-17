// 브라우저 안에서 도는 계측 함수들 — **밀도(여백)와 면(카드)** 쪽. T-60 에서 더했다.
// 여기 함수는 **Node 문맥에서 실행되지 않는다** — DOM 전역만 쓴다.
//
// 왜 새 파일인가: `probe.mjs` 의 `emptinessReport` 는 "자식 경계의 합집합" 으로 공백을 잰다. 그 방식은
// 컬럼이 `flex` 로 높이를 꽉 채우면 **언제나 0** 이 나온다(T-25 §7-D 가 "측정하지 못했다" 고 적은 지점).
// 여기서는 **잉크가 실제로 놓인 줄**만 세는 방식으로 다시 잰다.

/**
 * 컬럼(또는 스크롤 영역) 안에서 **잉크가 놓인 세로 줄의 비율**. `flex` 로 높이를 꽉 채운 래퍼에
 * 속지 않는다 — 잉크를 놓는 요소의 세로 구간만 합집합으로 모으고, 컬럼 상자에서 그만큼을 뺀다.
 *
 * `gaps` 는 잉크 구간 사이의 빈 띠다. **꼬리 공백**(마지막 잉크 아래)이 따로 나오는 이유는
 * "아래가 통째로 비었다" 와 "사이사이가 성기다" 가 다른 문제이기 때문이다.
 */
export function inkDensity(selector) {
  const box = document.querySelector(selector);
  if (box === null) return null;
  /**
   * 한 요소가 **잉크를 놓는가** — 화면에 무언가를 그리는가. 배경/보더/그림자를 가졌거나, 직계
   * 텍스트 노드를 가졌거나, 그 자체가 그림(svg·img·input)이면 잉크다. 투명한 래퍼는 아니다.
   * (`page.evaluate` 는 함수 하나만 직렬화한다 — 그래서 바깥 헬퍼를 부르지 않고 여기 둔다.)
   */
  const inks = (el) => {
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
    const bg = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(s.backgroundColor);
    if (bg !== null && (bg[4] === undefined || Number(bg[4]) > 0)) return true;
    if (s.boxShadow !== 'none' && s.boxShadow !== '') return true;
    const sides = ['Top', 'Right', 'Bottom', 'Left'];
    if (
      sides.some(
        (d) => parseFloat(s[`border${d}Width`]) > 0 && s[`border${d}Style`] !== 'none',
      )
    )
      return true;
    if (['svg', 'IMG', 'INPUT', 'HR', 'CANVAS', 'VIDEO'].includes(el.tagName)) return true;
    return [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '');
  };
  const rect = box.getBoundingClientRect();
  const top = rect.top;
  const bottom = rect.bottom;
  const spans = [];
  for (const el of box.querySelectorAll('*')) {
    if (!inks(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const a = Math.max(top, r.top);
    const b = Math.min(bottom, r.bottom);
    if (b > a) spans.push([a, b]);
  }
  spans.sort((p, q) => p[0] - q[0]);
  const merged = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last !== undefined && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else merged.push([s[0], s[1]]);
  }
  const inked = merged.reduce((sum, [a, b]) => sum + (b - a), 0);
  const gaps = [];
  let cursor = top;
  for (const [a, b] of merged) {
    if (a - cursor >= 8) gaps.push({ from: Math.round(cursor - top), px: Math.round(a - cursor) });
    cursor = b;
  }
  const tail = Math.round(bottom - cursor);
  return {
    boxHeight: Math.round(rect.height),
    inkedPx: Math.round(inked),
    emptyPx: Math.round(rect.height - inked),
    emptyRatio: Number((1 - inked / Math.max(1, rect.height)).toFixed(3)),
    tailEmptyPx: tail > 0 ? tail : 0,
    gaps: gaps.filter((g) => g.px >= 24),
  };
}

/**
 * **눈에 보이는 카드**의 인구조사. "라운드가 있고 자기 배경을 가진 상자" 를 카드로 보고, 그 뒤에
 * 실제로 깔린 색과의 **명도비**·그림자·보더를 함께 낸다. 클래스 문자열을 세지 않는다 — 계산된
 * 스타일만 본다(T-57 이 증명했듯 클래스는 지워져도 테스트가 초록일 수 있다).
 */
export function cardCensus() {
  const rgb = (v) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(v ?? '');
    return m === null ? null : { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  };
  const hex = (c) =>
    c === null ? null : '#' + [c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, '0')).join('');
  const lum = (c) => {
    const f = (x) => {
      const s = x / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (x, y) => {
    if (x === null || y === null) return null;
    const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p);
    return Number(((hi + 0.05) / (lo + 0.05)).toFixed(3));
  };
  const behind = (el) => {
    let n = el.parentElement;
    while (n !== null) {
      const c = rgb(getComputedStyle(n).backgroundColor);
      if (c !== null && c.a > 0) return c;
      n = n.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const cards = [];
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 120 || r.height < 60) continue;
    if (s.visibility === 'hidden') continue;
    if (parseFloat(s.borderTopLeftRadius) < 12) continue;
    const own = rgb(s.backgroundColor);
    if (own === null || own.a === 0) continue;
    const back = behind(el);
    // `box-shadow` 는 투명한 조각(`rgba(0,0,0,0) 0 0 0 0`)이 앞에 줄줄이 붙는다(Tailwind ring 변수).
    // 첫 조각의 알파를 읽으면 **언제나 0** 이 나온다 — 알파가 0 이 아닌 조각만 고른다.
    const parts = s.boxShadow.split(/,(?![^(]*\))/).map((x) => x.trim());
    const painted = parts.filter((x) => {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(x);
      return m !== null && (m[4] === undefined || Number(m[4]) > 0);
    });
    const alphaMatch = painted.length === 0 ? null : /,\s*([\d.]+)\)/.exec(painted[0]);
    cards.push({
      tag: el.tagName.toLowerCase(),
      label: (el.getAttribute('aria-label') ?? (el.className ?? '').toString()).slice(0, 44),
      w: Math.round(r.width),
      h: Math.round(r.height),
      bg: hex(own),
      behind: hex(back),
      contrast: ratio(own, back),
      radius: s.borderTopLeftRadius,
      borderWidth: s.borderTopWidth,
      borderColor: s.borderTopColor,
      borderContrast: ratio(rgb(s.borderTopColor), back),
      hasShadow: painted.length > 0,
      shadow: painted.length === 0 ? null : painted.join(' | ').slice(0, 64),
      shadowAlpha: alphaMatch === null ? null : Number(alphaMatch[1]),
    });
  }
  return cards;
}

/**
 * **"선택됨" 을 무엇으로 말하는가** 를 링 하나로 좁혀 본다. T-42/T-46 이 `--color-selected-ring` 를
 * 깔았으므로, 선택된 컨트롤이 실제로 그 링(2px, `--color-text` 색)을 그리는지 계산된 값으로 확인한다.
 * `ring-*` 유틸은 `box-shadow` 로, `border-*` 는 보더로 떨어지므로 **둘 다** 본다.
 */
export function selectedRingCensus(groups) {
  const root = getComputedStyle(document.documentElement);
  const ringColor = root.getPropertyValue('--color-selected-ring').trim();
  const ringWidth = root.getPropertyValue('--control-selected-ring').trim();
  /** 링은 요소 자신이 아니라 **형제/자식 span** 에 그려질 수 있다(스와치·타이머). 서브트리를 본다. */
  const ringOf = (el) => {
    const s = getComputedStyle(el);
    const inset = s.boxShadow.split(/,(?![^(]*\))/).find((p) => /inset/.test(p));
    if (inset !== undefined) return { on: 'self', kind: 'box-shadow inset', value: inset.trim() };
    if (parseFloat(s.borderTopWidth) >= 2 && s.borderTopStyle !== 'none')
      return {
        on: 'self',
        kind: 'border',
        value: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
      };
    return null;
  };
  const entries = [];
  for (const { group, selector, scopeSelector } of groups) {
    const el = document.querySelector(selector);
    if (el === null) {
      entries.push({ group, found: false });
      continue;
    }
    const scope = scopeSelector === undefined ? el : (el.closest(scopeSelector) ?? el);
    let ring = ringOf(el);
    if (ring === null) {
      for (const d of scope.querySelectorAll('*')) {
        const r = ringOf(d);
        if (r !== null && d.getBoundingClientRect().width > 0) {
          ring = { ...r, on: 'descendant' };
          break;
        }
      }
    }
    const rect = el.getBoundingClientRect();
    entries.push({
      group,
      found: true,
      label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24),
      size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      background: getComputedStyle(el).backgroundColor,
      ring,
    });
  }
  return { ringColorToken: ringColor, ringWidthToken: ringWidth, entries };
}
