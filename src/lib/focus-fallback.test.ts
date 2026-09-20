// 사라진 요소 대신 갈 곳 (app-shell.md R14).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OVERLAY_ALWAYS_LIVE_ATTR } from '@/components/ui/overlay-rules';

import {
  focusAfterRowRemoval,
  handoffFocus,
  rowAnchorOf,
  toastActionButton,
} from '@/lib/focus-fallback';

/** `<nav><ul><li><button>n</button></li>…</ul><button>+ 추가</button></nav>` */
function buildList(count: number): { nav: HTMLElement; rows: HTMLElement[] } {
  const nav = document.createElement('nav');
  const list = document.createElement('ul');
  const rows = Array.from({ length: count }, (_, index) => {
    const row = document.createElement('li');
    const button = document.createElement('button');
    button.textContent = `행 ${index}`;
    row.append(button);
    list.append(row);
    return row;
  });
  const add = document.createElement('button');
  add.textContent = '+ 추가';
  nav.append(list, add);
  document.body.append(nav);
  return { nav, rows };
}

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('rowAnchorOf', () => {
  it('행 안의 요소에서 목록과 자리 번호를 뜬다', () => {
    const { rows } = buildList(3);
    const anchor = rowAnchorOf(rows[1]?.querySelector('button') ?? null);
    expect(anchor?.index).toBe(1);
    expect(anchor?.list.tagName).toBe('UL');
  });

  it('행 밖이면 null — 자리표가 없으면 아래 규칙도 적용할 수 없다', () => {
    buildList(1);
    expect(rowAnchorOf(document.body)).toBeNull();
    expect(rowAnchorOf(null)).toBeNull();
  });
});

describe('focusAfterRowRemoval (R14 순서)', () => {
  it('다음 형제로 간다', () => {
    const { rows } = buildList(3);
    const anchor = rowAnchorOf(rows[1]?.querySelector('button') ?? null);
    rows[1]?.remove();
    expect(focusAfterRowRemoval(anchor)?.textContent).toBe('행 2');
  });

  it('다음이 없으면 이전 형제로 간다', () => {
    const { rows } = buildList(3);
    const anchor = rowAnchorOf(rows[2]?.querySelector('button') ?? null);
    rows[2]?.remove();
    expect(focusAfterRowRemoval(anchor)?.textContent).toBe('행 1');
  });

  it('목록이 통째로 사라지면 그 영역의 첫 조작 지점으로 간다', () => {
    const { nav, rows } = buildList(1);
    const anchor = rowAnchorOf(rows[0]?.querySelector('button') ?? null);
    anchor?.list.remove();
    void nav;
    expect(focusAfterRowRemoval(anchor)?.textContent).toBe('+ 추가');
  });

  it('목록이 `<nav>` 밖(예: D-day 카드)에서 통째로 사라지면 region 폴백도 없어 null 이다', () => {
    const list = document.createElement('ul');
    const row = document.createElement('li');
    row.append(document.createElement('button'));
    list.append(row);
    document.body.append(list);
    const anchor = rowAnchorOf(row.querySelector('button'));
    list.remove();
    expect(focusAfterRowRemoval(anchor)).toBeNull();
  });

  it('행에 포커스 가능한 것이 없으면 목록 컨테이너로 가되 `tabindex=-1` 을 달아 준다', () => {
    const { rows } = buildList(2);
    const anchor = rowAnchorOf(rows[0]?.querySelector('button') ?? null);
    rows[0]?.remove();
    rows[1]?.replaceChildren();
    const target = focusAfterRowRemoval(anchor);
    expect(target?.tagName).toBe('UL');
    expect(target?.getAttribute('tabindex')).toBe('-1');
  });

  it('자리표가 없으면 null 이다 — 아무 데나 포커스를 던지지 않는다', () => {
    expect(focusAfterRowRemoval(null)).toBeNull();
  });
});

describe('toastActionButton', () => {
  // `OVERLAY_ALWAYS_LIVE_ATTR` 를 import 해서 단다 — `toastActionButton` 의 셀렉터 리터럴과 이
  // 상수가 갈라지면(lib 는 그 상수를 직접 import 할 수 없다, 함수 주석 참고) 이 테스트가 빨간불이
  // 된다. 그것이 이 테스트의 존재 이유다.
  function addToast(label: string | null): HTMLElement {
    const viewport = document.createElement('div');
    viewport.setAttribute(OVERLAY_ALWAYS_LIVE_ATTR, '');
    const region = document.createElement('div');
    if (label !== null) {
      const button = document.createElement('button');
      button.textContent = label;
      region.append(button);
    }
    viewport.append(region);
    document.body.append(viewport);
    return viewport;
  }

  it('액션이 있는 토스트의 버튼을 준다', () => {
    addToast('되돌리기');
    expect(toastActionButton(document)?.textContent).toBe('되돌리기');
  });

  it('액션 없는 토스트만 있으면 null 이다', () => {
    addToast(null);
    expect(toastActionButton(document)).toBeNull();
  });

  it('뷰포트가 없으면 null 이다', () => {
    expect(toastActionButton(document)).toBeNull();
  });
});

describe('handoffFocus', () => {
  it('영역 안에 포커스가 있으면 후임으로 넘긴다', async () => {
    const { nav, rows } = buildList(1);
    const successor = document.createElement('button');
    successor.setAttribute('data-successor', '');
    document.body.append(successor);
    (rows[0]?.querySelector('button') as HTMLElement).focus();

    expect(handoffFocus(nav, '[data-successor]')).toBe(true);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    expect(document.activeElement).toBe(successor);
  });

  it('영역 밖에 포커스가 있으면 아무것도 하지 않는다', () => {
    const { nav } = buildList(1);
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    expect(handoffFocus(nav, '[data-successor]')).toBe(false);
    expect(document.activeElement).toBe(outside);
  });

  it('영역이 없으면 아무것도 하지 않는다', () => {
    expect(handoffFocus(null, '[data-successor]')).toBe(false);
  });
});
