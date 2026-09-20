import { describe, expect, it } from 'vitest';

import { markDeleted } from '@/domain/meta';

import { categoryBarViewValueText, toCategoryBarView } from '@/features/reports/lib/category-view';
import { makeCategory } from '@/test/fixtures/category';

describe('toCategoryBarView', () => {
  it('카테고리 이름·이모지·색을 붙인다', () => {
    const category = makeCategory({ name: '공부', emoji: '📚' });
    const views = toCategoryBarView([{ categoryId: category.id, done: 2, total: 4 }], [category]);

    expect(views).toEqual([
      { categoryId: category.id, done: 2, total: 4, label: '공부', emoji: '📚', color: category.color, ratio: 0.5 },
    ]);
  });

  it('삭제된(툼스톤) 카테고리는 이름 뒤에 "(삭제됨)"을 붙인다', () => {
    const category = markDeleted(makeCategory({ name: '운동' }), '2026-01-01T00:00:00.000Z');
    const views = toCategoryBarView([{ categoryId: category.id, done: 1, total: 1 }], [category]);

    expect(views[0]?.label).toBe('운동 (삭제됨)');
  });

  it('카테고리 행 자체가 없으면 "삭제된 카테고리"로 표시하고 색이 없다', () => {
    const views = toCategoryBarView([{ categoryId: 'unknown', done: 1, total: 2 }], []);

    expect(views[0]?.label).toBe('삭제된 카테고리');
    expect(views[0]?.color).toBeUndefined();
  });

  it('total 이 0이면 ratio 는 0이다(나눗셈 방지)', () => {
    const category = makeCategory();
    const views = toCategoryBarView([{ categoryId: category.id, done: 0, total: 0 }], [category]);

    expect(views[0]?.ratio).toBe(0);
  });
});

describe('categoryBarViewValueText', () => {
  it('"N개 중 M개 완료" 문구를 만든다', () => {
    expect(
      categoryBarViewValueText({
        categoryId: 'x',
        done: 2,
        total: 4,
        label: '공부',
        ratio: 0.5,
      }),
    ).toBe('4개 중 2개 완료');
  });
});
