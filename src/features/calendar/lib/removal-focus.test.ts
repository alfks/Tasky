// `focus-fallback.test.ts` 의 같은 이름 테스트에서 그대로 옮겼다(원본 이식 사유는 removal-focus.ts 머리주석).
import { beforeEach, describe, expect, it } from 'vitest';

import { focusAfterRowRemoval, rowAnchorOf } from '@/features/calendar/lib/removal-focus';

/** `<ul><li><button>n</button></li>…</ul>` */
function buildList(count: number): { list: HTMLElement; rows: HTMLElement[] } {
  const list = document.createElement('ul');
  const rows = Array.from({ length: count }, (_, index) => {
    const row = document.createElement('li');
    const button = document.createElement('button');
    button.textContent = `행 ${index}`;
    row.append(button);
    list.append(row);
    return row;
  });
  document.body.append(list);
  return { list, rows };
}

beforeEach(() => {
  document.body.innerHTML = '';
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

  it('목록마저 사라지면 null 이다 — D-day 카드에는 `region`(nav) 이 없다', () => {
    const { list, rows } = buildList(1);
    const anchor = rowAnchorOf(rows[0]?.querySelector('button') ?? null);
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
