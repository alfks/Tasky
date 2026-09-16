// 사이드바에서 카테고리를 고르면 본문 그룹으로 데려간다 (category §2-A).
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CategoryId } from '@/domain/ids';

import { useCategoryFocus } from '@/features/shell/hooks/useCategoryFocus';
import { makeCategory } from '@/test/fixtures/category';

const STUDY = makeCategory({ seq: 1, name: '공부' });
const EXERCISE = makeCategory({ seq: 2, name: '운동' });

let focusCategory: (id: CategoryId) => void;

function Probe() {
  focusCategory = useCategoryFocus([STUDY, EXERCISE]);
  return null;
}

/** 본문 그룹은 `<section aria-label="{이름}">` + 안쪽 `ul[tabindex=-1]` 이다(`TodoGroupSection`). */
function buildMain(): { study: HTMLElement; exercise: HTMLElement } {
  document.body.innerHTML = '';
  const main = document.createElement('main');
  const make = (name: string): HTMLElement => {
    const section = document.createElement('section');
    section.setAttribute('aria-label', name);
    const list = document.createElement('ul');
    list.tabIndex = -1;
    section.append(list);
    main.append(section);
    return list;
  };
  const study = make('공부');
  const exercise = make('운동');
  document.body.append(main);
  return { study, exercise };
}

describe('useCategoryFocus', () => {
  it('고른 카테고리의 그룹 목록으로 포커스를 옮긴다', () => {
    const { exercise } = buildMain();
    render(<Probe />);
    focusCategory(EXERCISE.id);
    expect(document.activeElement).toBe(exercise);
  });

  it('본문에 그 그룹이 없으면 아무것도 하지 않는다', () => {
    document.body.innerHTML = '';
    render(<Probe />);
    expect(() => focusCategory(STUDY.id)).not.toThrow();
    expect(document.activeElement?.tagName).toBe('BODY');
  });

  it('모르는 id 면 아무것도 하지 않는다', () => {
    const { study } = buildMain();
    render(<Probe />);
    study.focus();
    focusCategory('20000000-0000-4000-8000-000000000999' as CategoryId);
    expect(document.activeElement).toBe(study);
  });
});
