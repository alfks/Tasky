// 삭제 뒤 포커스 복귀 3경로 (app-shell R14, todo.md §5).
//
// 픽스처는 **비대칭**이다: 행 사이에 입력 행·구분선이 끼어 있고 행 개수도 3개라, "바로 옆 형제" 만
// 보는 구현은 구분선을 집어 포커스가 `<body>` 로 떨어진다.
import { beforeEach, describe, expect, it } from 'vitest';

import { focusFallback, LIST_FOCUS_ATTR } from '@/features/todo/components/todo-focus';
import { FLIP_ATTR } from '@/features/todo/components/useFlipRows';

function 목록(): HTMLUListElement {
  document.body.innerHTML = `
    <ul ${LIST_FOCUS_ATTR}="공부" tabindex="-1">
      <li ${FLIP_ATTR}="t1" tabindex="0">하나</li>
      <li ${FLIP_ATTR}="t2" tabindex="0">둘</li>
      <li class="add-row">+ 할 일 추가</li>
      <li class="divider">완료 1</li>
      <li ${FLIP_ATTR}="t3" tabindex="0">셋</li>
    </ul>`;
  const list = document.querySelector('ul');
  if (list === null) throw new Error('픽스처가 깨졌다');
  return list;
}

const row = (id: string): HTMLElement => {
  const found = document.querySelector<HTMLElement>(`[${FLIP_ATTR}="${id}"]`);
  if (found === null) throw new Error(`${id} 행이 없다`);
  return found;
};

beforeEach(() => {
  목록();
});

describe('focusFallback', () => {
  it('① 다음 형제 행을 먼저 고른다', () => {
    expect(focusFallback(row('t1'))).toBe(row('t2'));
  });

  it('구분선·입력 행을 건너뛰고 다음 **행**을 고른다', () => {
    expect(focusFallback(row('t2'))).toBe(row('t3'));
  });

  it('② 다음이 없으면 이전 형제 행으로 간다', () => {
    expect(focusFallback(row('t3'))).toBe(row('t2'));
  });

  it('③ 형제가 없으면 목록 컨테이너로 간다', () => {
    const list = 목록();
    list.innerHTML = `<li ${FLIP_ATTR}="only" tabindex="0">혼자</li>`;
    expect(focusFallback(row('only'))).toBe(list);
  });

  it('목록 밖으로 떨어진 행에는 줄 곳이 없다', () => {
    const detached = document.createElement('li');
    detached.setAttribute(FLIP_ATTR, 'gone');
    expect(focusFallback(detached)).toBeNull();
    expect(focusFallback(null)).toBeNull();
  });
});
