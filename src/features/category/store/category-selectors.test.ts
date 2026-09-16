// 카테고리 선택자 테스트 (category.md R5·R8). 픽스처는 활성 3 · 종료 2 로 **비대칭**이고
// `order`·`closedAt` 도 서로 다르게 둔다 — 한 건씩만 두면 정렬을 뒤집어도 같은 결과가 나온다.
import { describe, expect, it } from 'vitest';

import {
  selectActiveCategories,
  selectCategories,
  selectCategoryById,
  selectClosedCategories,
} from '@/features/category/store/category-selectors';
import { indexCategories } from '@/features/category/store/category-state';
import { makeCategory } from '@/test/fixtures/category';

const 공부 = makeCategory({ seq: 1, name: '공부', order: 2 });
const 운동 = makeCategory({ seq: 2, name: '운동', order: 0 });
const 독서 = makeCategory({ seq: 3, name: '독서', order: 1 });
const 요리 = makeCategory({
  seq: 4,
  name: '요리',
  status: 'completed',
  closedAt: '2026-01-20T00:00:00.000Z',
});
const 산책 = makeCategory({
  seq: 5,
  name: '산책',
  status: 'paused',
  closedAt: '2026-01-25T00:00:00.000Z',
});

const state = { byId: indexCategories([공부, 운동, 독서, 요리, 산책]) };

describe('selectActiveCategories (R5)', () => {
  it('활성만 `order` 오름차순으로 돌려준다', () => {
    expect(selectActiveCategories(state).map((c) => c.name)).toEqual(['운동', '독서', '공부']);
  });
});

describe('selectClosedCategories (R8)', () => {
  it('완료·중단을 함께 담고 `closedAt` 내림차순으로 정렬한다', () => {
    expect(selectClosedCategories(state).map((c) => c.name)).toEqual(['산책', '요리']);
  });
});

describe('selectCategories (todo R15 와 같은 순서)', () => {
  it('활성(`order`) 다음에 종료(`closedAt` 내림차순)가 온다', () => {
    expect(selectCategories(state).map((c) => c.name)).toEqual([
      '운동',
      '독서',
      '공부',
      '산책',
      '요리',
    ]);
  });
});

describe('selectCategoryById', () => {
  it('없는 id 는 undefined 다', () => {
    expect(selectCategoryById(state, 공부.id)?.name).toBe('공부');
    expect(selectCategoryById(state, '없는-id')).toBeUndefined();
  });
});
