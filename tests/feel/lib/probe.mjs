// 브라우저 안에서 도는 계측 함수들(문자열이 아니라 함수로 넘겨 `page.evaluate` 에 태운다).
// 여기 함수는 **Node 문맥에서 실행되지 않는다** — DOM 전역만 쓴다.

/**
 * 컬럼 세 개(사이드바 래퍼 · 메인 · 인사이트)의 **면** 속성. "카드처럼 보이는가" 를 색·보더·그림자·
 * 라운드 네 값으로만 판정한다 — "떠 보인다" 같은 서술을 쓰지 않기 위한 측정이다.
 */
export function surfaceReport() {
  const hex = (v) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(v ?? '');
    if (m === null) return null;
    if (m[4] !== undefined && Number(m[4]) === 0) return null;
    return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
  };
  const describe = (el, label) => {
    if (el === null) return { label, present: false };
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      label,
      present: true,
      background: hex(s.backgroundColor),
      boxShadow: s.boxShadow === 'none' ? null : s.boxShadow,
      borderRadius: s.borderTopLeftRadius,
      borderTopWidth: s.borderTopWidth,
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  };
  const main = document.querySelector('main#shell-main');
  const nav = document.querySelector('nav[aria-label="카테고리"]');
  const aside = document.querySelector('aside[aria-label="오늘 요약"]');
  return {
    root: describe(document.body, 'body'),
    sidebar: describe(nav === null ? null : nav.parentElement, '사이드바 컬럼(래퍼)'),
    main: describe(main, '메인 컬럼'),
    insight: describe(aside, '인사이트 컬럼'),
    cards: [...document.querySelectorAll('aside[aria-label="오늘 요약"] > div > *')].map((el, i) =>
      describe(el, `인사이트 섹션 ${i + 1}`),
    ),
  };
}

/** 그림자를 가진 요소 / 전체 요소 수. 리서치 §6 "은은한 드롭섀도우로 카드 부유감" 의 실측 대응값. */
export function shadowCensus() {
  const all = [...document.querySelectorAll('body *')];
  const shadowed = all.filter((el) => {
    const s = getComputedStyle(el);
    if (s.boxShadow === 'none' || s.boxShadow === '') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden';
  });
  return {
    total: all.length,
    shadowed: shadowed.length,
    samples: shadowed.slice(0, 12).map((el) => ({
      tag: el.tagName.toLowerCase(),
      label: (el.getAttribute('aria-label') ?? el.className ?? '').slice(0, 60),
      boxShadow: getComputedStyle(el).boxShadow,
    })),
  };
}

/** 메인 스크롤 영역에서 콘텐츠가 실제로 차지한 세로 픽셀과 남은 공백. */
export function emptinessReport() {
  const scroller = document.querySelector('main#shell-main > div:nth-child(2)');
  const measure = (el) => {
    if (el === null) return null;
    const box = el.getBoundingClientRect();
    const kids = [...el.querySelectorAll('*')]
      .map((k) => k.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0);
    if (kids.length === 0)
      return { boxHeight: Math.round(box.height), contentHeight: 0, emptyRatio: 1 };
    const top = Math.min(...kids.map((r) => r.top));
    const bottom = Math.max(...kids.map((r) => r.bottom));
    const content = Math.max(0, Math.round(bottom - top));
    return {
      boxHeight: Math.round(box.height),
      contentHeight: content,
      emptyPx: Math.round(box.height) - content,
      emptyRatio: Number((1 - content / Math.max(1, box.height)).toFixed(3)),
    };
  };
  const nav = document.querySelector('nav[aria-label="카테고리"]');
  const aside = document.querySelector('aside[aria-label="오늘 요약"]');
  return {
    mainScroller: measure(scroller),
    sidebar: measure(nav),
    insight: measure(aside),
  };
}

/** R3: 메인 상단 고정 영역 높이. 스크롤 영역의 top 에서 메인의 top 을 뺀 값이 곧 고정 영역이다. */
export function fixedHeaderHeight() {
  const main = document.querySelector('main#shell-main');
  const fixed = main === null ? null : main.firstElementChild;
  if (fixed === null) return null;
  return Math.round(fixed.getBoundingClientRect().height);
}

/** 달성률(퍼센트·n/m)을 읽는 표면이 화면에 몇 군데인가 — 헤더/패널 중복의 실측. */
export function completionSurfaces() {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const text = (el.textContent ?? '').trim();
    if (el.children.length > 0) continue;
    if (/^\d+\s*\/\s*\d+$/.test(text) || /^\d+%$/.test(text) || text === '—') {
      out.push({ text, x: Math.round(r.x), y: Math.round(r.y) });
    }
  }
  const rings = [...document.querySelectorAll('svg[role="img"]')].map((el) => ({
    label: el.getAttribute('aria-label'),
    x: Math.round(el.getBoundingClientRect().x),
    y: Math.round(el.getBoundingClientRect().y),
  }));
  return { texts: out, rings };
}

/** 라운드 값 분포 — 리서치 §6 "12~20px" 과 대조한다. */
export function radiusCensus() {
  const counts = {};
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) continue;
    const v = getComputedStyle(el).borderTopLeftRadius;
    if (v === '0px') continue;
    counts[v] = (counts[v] ?? 0) + 1;
  }
  return counts;
}

/**
 * 토큰 실측값 + 완료 항목의 실제 렌더 색 + 폰트. 리서치 §6 의 색·타이포 후보와 1:1 로 대조하기 위한
 * 값들이다. 완료 색은 토큰이 아니라 **완료된 행을 실제로 만들어 놓고** 읽는다.
 */
export function paletteReport() {
  const hex = (v) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(v ?? '');
    if (m === null) return null;
    if (m[4] !== undefined && Number(m[4]) === 0) return null;
    return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
  };
  const root = getComputedStyle(document.documentElement);
  const token = (n) => root.getPropertyValue(n).trim();
  const done = document.querySelector('li[data-flip-id] input[type=checkbox]:checked');
  const doneLabel = done === null ? null : done.closest('li').querySelector('button[id]');
  const weights = {};
  for (const el of document.querySelectorAll('body *')) {
    const t = (el.textContent ?? '').trim();
    if (t === '' || el.children.length > 0) continue;
    const w = getComputedStyle(el).fontWeight;
    weights[w] = (weights[w] ?? 0) + 1;
  }
  return {
    tokens: {
      bg: token('--color-bg'),
      surface: token('--color-surface'),
      surface2: token('--color-surface-2'),
      text: token('--color-text'),
      muted: token('--color-muted'),
      accent: token('--color-accent'),
      elevSm: token('--elev-sm'),
      elevMd: token('--elev-md'),
    },
    fontFamily: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/["']/g, ''),
    fontWeights: weights,
    doneTitle:
      doneLabel === null
        ? null
        : {
            color: hex(getComputedStyle(doneLabel).color),
            textDecoration: getComputedStyle(doneLabel).textDecorationLine,
          },
    /** 상단에 상시 뜬 알림(저장 공간 배너 등)이 차지하는 높이 — 첫 화면의 인상을 좌우한다. */
    topNoticeHeight: (() => {
      const spacer = document.querySelector('[data-shell-notice-spacer]');
      return spacer === null ? null : Math.round(spacer.getBoundingClientRect().height);
    })(),
  };
}
