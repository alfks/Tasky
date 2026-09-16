// 브라우저 안에서 도는 계측 함수들 — **상태의 언어** 쪽(선택·호버·포커스·비활성·네이티브 컨트롤).
// `probe.mjs` 와 나뉜 이유는 주제가 다르기도 하고 한 파일 300줄 상한(code-style) 때문이기도 하다.
// 여기 함수는 **Node 문맥에서 실행되지 않는다** — DOM 전역만 쓴다.

/**
 * **상태의 언어** 조사 — "선택됨/호버/포커스/비활성" 을 컴포넌트마다 무엇으로 말하는가.
 *
 * 한 앱 안에서 같은 상태를 서로 다른 신호로 말하면(한쪽은 강조색 채움, 다른 쪽은 1.1:1 회색)
 * 개별 컴포넌트는 규칙을 어기지 않은 채로도 화면 전체가 "한 제품" 으로 읽히지 않는다.
 * 그래서 **선택된 것과 안 된 것의 명도비** 를 컨트롤 묶음마다 뽑는다.
 */
export function stateLanguageReport() {
  const rgb = (v) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(v ?? '');
    if (m === null) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  };
  const hex = (v) => {
    const c = rgb(v);
    if (c === null || c.a === 0) return null;
    return '#' + [c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, '0')).join('');
  };
  const lum = (c) => {
    const f = (x) => {
      const s = x / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const x = rgb(a);
    const y = rgb(b);
    if (x === null || y === null) return null;
    const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p);
    return Number(((hi + 0.05) / (lo + 0.05)).toFixed(3));
  };
  /** 투명한 요소는 뒤에 깔린 색이 실제 배경이다 — 조상을 거슬러 올라가 불투명한 색을 찾는다. */
  const effectiveBg = (el) => {
    let n = el;
    while (n !== null) {
      const c = rgb(getComputedStyle(n).backgroundColor);
      if (c !== null && c.a > 0) return getComputedStyle(n).backgroundColor;
      n = n.parentElement;
    }
    return 'rgb(255, 255, 255)';
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };

  const groups = {};
  const selectable = document.querySelectorAll(
    '[role=radio],[role=option],[role=tab],[aria-pressed],[aria-selected],[aria-checked]',
  );
  for (const el of selectable) {
    if (!visible(el)) continue;
    const container =
      el.closest('[role=radiogroup],[role=listbox],[role=tablist],[role=group]') ??
      el.parentElement;
    const key =
      container?.getAttribute('aria-label') ??
      container?.getAttribute('role') ??
      el.getAttribute('role') ??
      '?';
    const on =
      el.getAttribute('aria-checked') === 'true' ||
      el.getAttribute('aria-selected') === 'true' ||
      el.getAttribute('aria-pressed') === 'true';
    const s = getComputedStyle(el);
    const entry = {
      label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24),
      bg: effectiveBg(el),
      color: s.color,
      borderColor: s.borderTopColor,
      borderWidth: s.borderTopWidth,
      boxShadow: s.boxShadow === 'none' ? null : s.boxShadow,
      fontWeight: s.fontWeight,
      radius: s.borderTopLeftRadius,
      child: (() => {
        const c = el.firstElementChild;
        if (c === null) return null;
        const cs = getComputedStyle(c);
        return `${(c.textContent ?? '').trim()}|${cs.borderTopWidth} ${cs.borderTopColor}|${hex(cs.backgroundColor)}`;
      })(),
    };
    groups[key] ??= { selected: [], unselected: [] };
    groups[key][on ? 'selected' : 'unselected'].push(entry);
  }

  const out = {};
  for (const [key, g] of Object.entries(groups)) {
    const on = g.selected[0];
    const off = g.unselected[0];
    out[key] = {
      선택됨: on === undefined ? null : { ...on, bg: hex(on.bg), color: hex(on.color) },
      안됨: off === undefined ? null : { ...off, bg: hex(off.bg), color: hex(off.color) },
      선택_대_비선택_명도비: on === undefined || off === undefined ? null : ratio(on.bg, off.bg),
      선택신호: (() => {
        if (on === undefined || off === undefined) return '(짝을 찾지 못함)';
        const signals = [];
        if (hex(on.bg) !== hex(off.bg)) signals.push('배경색');
        if (hex(on.color) !== hex(off.color)) signals.push('글자색');
        if (on.fontWeight !== off.fontWeight) signals.push('굵기');
        if (on.borderColor !== off.borderColor || on.borderWidth !== off.borderWidth)
          signals.push('보더');
        if (on.boxShadow !== off.boxShadow) signals.push('그림자');
        // **표식이 자식에 그려지는 경우가 있다**(색 스와치는 안쪽 span 에 ✓ + 굵은 테두리를 준다).
        // 요소만 보고 "선택 신호 없음" 이라고 적으면 거짓 보고가 된다 — 자식 한 겹을 더 본다.
        if (on.child !== off.child) signals.push('자식표식');
        return signals.length === 0 ? '(없음)' : signals.join('+');
      })(),
    };
  }
  return out;
}

/** 포커스 링의 표기가 컴포넌트마다 같은가 — Tab 궤적에서 outline 값을 모은다. */
export function focusRingOf() {
  const el = document.activeElement;
  if (el === null || el === document.body) return null;
  const s = getComputedStyle(el);
  return {
    name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24),
    tag: el.tagName.toLowerCase(),
    outline: `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}`,
    outlineOffset: s.outlineOffset,
    boxShadow: s.boxShadow === 'none' ? null : s.boxShadow.slice(0, 60),
  };
}

/** 비활성 표현이 컴포넌트마다 같은가. */
export function disabledCensus() {
  const out = [];
  for (const el of document.querySelectorAll('[disabled],[aria-disabled="true"]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const s = getComputedStyle(el);
    out.push({
      name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24),
      opacity: s.opacity,
      color: s.color,
      cursor: s.cursor,
    });
  }
  return out;
}

/**
 * **네이티브 컨트롤 조사** — 공용 프리미티브(`components/ui/`)를 쓴 곳과 브라우저 기본 컨트롤을
 * 그대로 쓴 곳이 한 화면에 섞여 있는가. 섞이면 같은 의미의 컨트롤이 크기·모양·색이 전부 달라진다.
 *
 * 판정: `appearance` 가 `auto` 이고(브라우저가 그린다) 가려지지 않았으면(opacity>0) 네이티브다.
 * 공용 `Checkbox` 는 진짜 `input` 을 `opacity-0` 으로 깔고 옆 `span` 을 그리므로 여기 걸리지 않는다.
 */
export function nativeControlCensus() {
  const out = [];
  for (const el of document.querySelectorAll('input, select, textarea')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const s = getComputedStyle(el);
    const native = s.appearance === 'auto' && Number(s.opacity) > 0;
    if (!native) continue;
    out.push({
      type: el.tagName.toLowerCase() === 'input' ? `input[${el.type}]` : el.tagName.toLowerCase(),
      size: `${Math.round(r.width)}x${Math.round(r.height)}`,
      accentColor: s.accentColor,
      radius: s.borderTopLeftRadius,
      hasFocusRingClass: el.className.includes('outline-focus'),
      near: (
        el.closest('section,fieldset,[role=group]')?.querySelector('h2,h3,legend')?.textContent ??
        ''
      )
        .trim()
        .slice(0, 20),
    });
  }
  return out;
}
