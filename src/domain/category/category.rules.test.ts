import { describe, expect, it } from 'vitest';

import {
  activeCategories,
  assertCategoryCapacity,
  CATEGORY_MAX_COUNT,
  closedCategories,
  createCategory,
  nextCategoryOrder,
  normalizeCategoryName,
  planFirstRunSeed,
  reorderCategories,
  SEED_CATEGORY,
  sortCategoriesForDisplay,
  transitionCategory,
  updateCategory,
  validateCategoryColor,
  validateCategoryEmoji,
  validateCategoryName,
} from '@/domain/category/category.rules';
import { PALETTE } from '@/domain/theme/palette';

import { makeCategories, makeCategory } from '@/test/fixtures/category';
import { FIXTURE_INSTANT, fixedDeps } from '@/test/fixtures/deps';
import { makeSettings } from '@/test/fixtures/settings';

const LATER = '2026-02-01T10:00:00.000Z';
const deps = fixedDeps();
const laterDeps = fixedDeps({ now: LATER });
const CORAL = PALETTE[0].light;

describe('이름 검증 (R1·R2)', () => {
  it('줄바꿈은 공백, 앞뒤 공백은 제거', () => {
    expect(normalizeCategoryName(' 공\n부 ')).toBe('공 부');
  });

  it('빈 이름·20자 초과는 거부한다', () => {
    expect(() => validateCategoryName('  ', [])).toThrow(
      expect.objectContaining({ code: 'CATEGORY_NAME_REQUIRED' }),
    );
    expect(validateCategoryName('가'.repeat(20), [])).toHaveLength(20);
    expect(() => validateCategoryName('가'.repeat(21), [])).toThrow(
      expect.objectContaining({ code: 'CATEGORY_NAME_TOO_LONG' }),
    );
  });

  it('삭제되지 않은 카테고리(종료 포함) 사이에서 대소문자 무시 유일', () => {
    const existing = [
      makeCategory({ seq: 1, name: 'Study' }),
      makeCategory({ seq: 2, name: '운동', status: 'completed', closedAt: FIXTURE_INSTANT }),
      makeCategory({ seq: 3, name: '독서', deletedAt: FIXTURE_INSTANT }),
    ];
    expect(() => validateCategoryName('study', existing)).toThrow(
      expect.objectContaining({ code: 'CATEGORY_NAME_DUPLICATE' }),
    );
    expect(() => validateCategoryName('운동', existing)).toThrow(
      expect.objectContaining({ code: 'CATEGORY_NAME_DUPLICATE' }),
    );
    // 삭제된 이름은 다시 쓸 수 있다.
    expect(validateCategoryName('독서', existing)).toBe('독서');
    // 수정 모드에서는 자기 자신을 뺀다.
    expect(validateCategoryName('Study', existing, existing[0].id)).toBe('Study');
  });
});

describe('색·이모지·개수 (R3·R4·R6)', () => {
  it('팔레트 12색만 허용하고 대문자로 정규화한다', () => {
    expect(validateCategoryColor(CORAL.toLowerCase())).toBe(CORAL);
    expect(() => validateCategoryColor('#123456')).toThrow(
      expect.objectContaining({ code: 'CATEGORY_COLOR_INVALID' }),
    );
    expect(() => validateCategoryColor('red')).toThrow(
      expect.objectContaining({ code: 'CATEGORY_COLOR_INVALID' }),
    );
  });

  it('이모지는 0 또는 1 grapheme', () => {
    expect(validateCategoryEmoji(undefined)).toBeUndefined();
    expect(validateCategoryEmoji('  ')).toBeUndefined();
    expect(validateCategoryEmoji('📝')).toBe('📝');
    expect(() => validateCategoryEmoji('📝📚')).toThrow(
      expect.objectContaining({ code: 'CATEGORY_EMOJI_INVALID' }),
    );
  });

  it('50개를 넘기면 만들 수 없다', () => {
    const full = makeCategories(CATEGORY_MAX_COUNT);
    expect(() => assertCategoryCapacity(full)).toThrow(
      expect.objectContaining({ code: 'CATEGORY_LIMIT_EXCEEDED' }),
    );
    // 툼스톤은 모집단에서 빠진다.
    expect(() =>
      assertCategoryCapacity([
        ...full.slice(1),
        makeCategory({ seq: 99, deletedAt: FIXTURE_INSTANT }),
      ]),
    ).not.toThrow();
  });
});

describe('createCategory (R5)', () => {
  it('order 는 활성 최대 + 1, status 는 active', () => {
    const existing = [
      makeCategory({ seq: 1, order: 3 }),
      makeCategory({ seq: 2, order: 9, status: 'paused', closedAt: FIXTURE_INSTANT }),
    ];
    const created = createCategory({ name: '공부', color: CORAL, existing }, deps);
    expect(created).toMatchObject({
      name: '공부',
      color: CORAL,
      order: 4,
      status: 'active',
      rev: 1,
    });
    expect('emoji' in created).toBe(false);
  });

  it('활성이 없으면 order 0', () => {
    expect(createCategory({ name: '공부', color: CORAL, existing: [] }, deps).order).toBe(0);
  });
});

describe('updateCategory', () => {
  it('이름·색을 바꾸고 emoji: null 은 이모지를 지운다', () => {
    const category = makeCategory({ emoji: '📝' });
    const updated = updateCategory(
      category,
      { name: '새 이름', emoji: null },
      [category],
      laterDeps,
    );
    expect(updated).toMatchObject({ name: '새 이름', rev: 2, updatedAt: LATER });
    expect('emoji' in updated).toBe(false);
  });

  it('자기 이름을 그대로 저장해도 중복이 아니다', () => {
    const category = makeCategory({ name: '공부' });
    expect(updateCategory(category, { name: '공부' }, [category], laterDeps).name).toBe('공부');
  });
});

describe('transitionCategory (R7·R9)', () => {
  const active = makeCategory({ seq: 1, order: 0 });
  const closed = makeCategory({ seq: 2, status: 'completed', closedAt: FIXTURE_INSTANT, order: 0 });

  it('활성을 떠나면 closedAt 을 기록한다', () => {
    for (const next of ['completed', 'paused'] as const) {
      const moved = transitionCategory(active, next, [active], laterDeps);
      expect(moved).toMatchObject({ status: next, closedAt: LATER });
    }
  });

  it('종료끼리도 바꿀 수 있고 closedAt 이 갱신된다', () => {
    expect(transitionCategory(closed, 'paused', [], laterDeps)).toMatchObject({
      status: 'paused',
      closedAt: LATER,
    });
  });

  it('재개하면 closedAt 이 사라지고 order 가 활성 목록 끝이 된다', () => {
    const others = [makeCategory({ seq: 3, order: 0 }), makeCategory({ seq: 4, order: 1 })];
    const reopened = transitionCategory(closed, 'active', others, laterDeps);
    expect(reopened).toMatchObject({ status: 'active', order: 2 });
    expect('closedAt' in reopened).toBe(false);
  });

  it('같은 상태로의 전이는 거부한다(자동 전이 없음)', () => {
    expect(() => transitionCategory(active, 'active', [], laterDeps)).toThrow(
      expect.objectContaining({ code: 'CATEGORY_TRANSITION_INVALID' }),
    );
  });
});

describe('목록 정렬·재매김', () => {
  it('activeCategories 는 order 순, closedCategories 는 closedAt 내림차순', () => {
    const list = [
      makeCategory({ seq: 1, order: 2 }),
      makeCategory({ seq: 2, order: 0 }),
      makeCategory({ seq: 3, status: 'completed', closedAt: '2026-01-01T00:00:00.000Z' }),
      makeCategory({ seq: 4, status: 'paused', closedAt: '2026-01-05T00:00:00.000Z' }),
      makeCategory({ seq: 5, deletedAt: FIXTURE_INSTANT }),
    ];
    expect(activeCategories(list).map((c) => c.id)).toEqual([list[1].id, list[0].id]);
    expect(closedCategories(list).map((c) => c.id)).toEqual([list[3].id, list[2].id]);
    expect(nextCategoryOrder(list)).toBe(3);
  });

  it('reorderCategories 는 활성 목록을 0..n-1 로 다시 매기고 바뀐 것만 돌려준다', () => {
    const list = makeCategories(3, (i) => ({ order: i }));
    const changed = reorderCategories(list, list[2].id, 0, laterDeps);
    expect(changed.map((c) => [c.id, c.order])).toEqual([
      [list[2].id, 0],
      [list[0].id, 1],
      [list[1].id, 2],
    ]);
    expect(reorderCategories(list, list[1].id, 1, laterDeps)).toEqual([]);
  });

  it('reorderCategories 는 목록에 없는 id 를 삭제 대화상자 문구가 아닌 코드로 거부한다', () => {
    const list = makeCategories(2, (i) => ({ order: i }));
    expect(() => reorderCategories(list, 'missing', 0, laterDeps)).toThrow(
      expect.objectContaining({ code: 'CATEGORY_NOT_IN_LIST' }),
    );
  });

  it('sortCategoriesForDisplay 는 활성 order → 종료 closedAt desc → 삭제됨 deletedAt desc 로 한 줄로 세운다 (R15·R5)', () => {
    const active2 = makeCategory({ seq: 1, order: 1 });
    const active1 = makeCategory({ seq: 2, order: 0 });
    const closedOld = makeCategory({
      seq: 3,
      status: 'completed',
      closedAt: '2026-01-01T00:00:00.000Z',
    });
    const closedNew = makeCategory({
      seq: 4,
      status: 'paused',
      closedAt: '2026-01-05T00:00:00.000Z',
    });
    // 종료한 뒤 삭제한 카테고리 — closedAt 이 아니라 deletedAt 으로 읽는다.
    const removedLate = makeCategory({
      seq: 5,
      status: 'completed',
      closedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: '2026-01-20T00:00:00.000Z',
    });
    const removedEarly = makeCategory({ seq: 6, deletedAt: '2026-01-10T00:00:00.000Z' });
    const list = [removedEarly, closedOld, active2, removedLate, closedNew, active1];
    expect(sortCategoriesForDisplay(list).map((c) => c.id)).toEqual([
      active1.id,
      active2.id,
      closedNew.id,
      closedOld.id,
      removedLate.id,
      removedEarly.id,
    ]);
    // 입력 배열을 바꾸지 않는다(호출자가 들고 있는 스냅샷 보호).
    expect(list[0].id).toBe(removedEarly.id);
  });
});

describe('planFirstRunSeed (R18)', () => {
  it('카테고리가 없고 seededAt 도 없으면 한 개를 만들고 seededAt 을 남긴다', () => {
    const plan = planFirstRunSeed([], makeSettings(), deps);
    expect(plan?.category).toMatchObject({ ...SEED_CATEGORY, status: 'active', order: 0 });
    expect(plan?.settings.seededAt).toBe(FIXTURE_INSTANT);
  });

  it('이미 시드했거나 카테고리가 있으면 아무것도 하지 않는다', () => {
    expect(planFirstRunSeed([], makeSettings({ seededAt: FIXTURE_INSTANT }), deps)).toBeUndefined();
    expect(planFirstRunSeed([makeCategory()], makeSettings(), deps)).toBeUndefined();
  });
});
