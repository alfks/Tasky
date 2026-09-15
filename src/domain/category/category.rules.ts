// 카테고리 검증·생성·상태 전이·정렬·첫 실행 시드 (category.md R1~R9·R18).
// 삭제 계획(R13~R15)은 분량이 커서 removal.ts 에 따로 둔다.
import type { Category, CategoryStatus } from '@/domain/category/category';
import { DomainError } from '@/domain/errors';
import type { CategoryId } from '@/domain/ids';
import { createMeta, isTombstone, touch, type MetaDeps, type Persistable } from '@/domain/meta';
import { DEFAULT_ACCENT_COLOR, isPaletteColor, normalizeHexColor } from '@/domain/theme/palette';
import type { Settings } from '@/domain/theme/settings';
import { markSeeded } from '@/domain/theme/settings.rules';

/** 이름 최대 길이 (category R1). */
export const CATEGORY_NAME_MAX_LENGTH = 20;
/** 삭제되지 않은 카테고리의 최대 개수 (category R6). */
export const CATEGORY_MAX_COUNT = 50;
/** 첫 실행 시드 카테고리 (category R18). 이름은 사용자가 바로 바꾸는 값이고 색은 기본 강조색과 같다. */
export const SEED_CATEGORY = { name: 'todo', emoji: '📝', color: DEFAULT_ACCENT_COLOR };

let segmenter: Intl.Segmenter | undefined;

/** 사람이 세는 "한 글자"(grapheme) 수. 이모지 ZWJ 조합을 1로 센다. */
function graphemeCount(value: string): number {
  if (typeof Intl === 'undefined' || !('Segmenter' in Intl)) {
    return [...value].length;
  }
  segmenter ??= new Intl.Segmenter('ko', { granularity: 'grapheme' });
  return [...segmenter.segment(value)].length;
}

/** 줄바꿈을 공백으로 바꾸고 앞뒤 공백을 제거한다 (category R1). */
export function normalizeCategoryName(raw: string): string {
  return raw.replace(/[\r\n\u2028\u2029]+/gu, ' ').trim();
}

/** 삭제되지 않은 카테고리만(종료 포함) — 이름 유일성·개수 제한의 모집단이다 (category R2·R6). */
function livingCategories(categories: readonly Category[]): Category[] {
  return categories.filter((c) => !isTombstone(c));
}

/**
 * 정규화한 이름을 돌려주고 규칙 위반이면 던진다 (category R1·R2).
 * 유일성은 **삭제되지 않은 카테고리(종료 포함) 사이에서 대소문자 무시**로 본다. 수정 시에는 자기 자신을 뺀다.
 */
export function validateCategoryName(
  raw: string,
  existing: readonly Category[],
  selfId?: CategoryId,
): string {
  const name = normalizeCategoryName(raw);
  if (name.length === 0) {
    throw new DomainError('CATEGORY_NAME_REQUIRED');
  }
  if (graphemeCount(name) > CATEGORY_NAME_MAX_LENGTH) {
    throw new DomainError('CATEGORY_NAME_TOO_LONG', String(graphemeCount(name)));
  }
  const duplicated = livingCategories(existing).some(
    (c) => c.id !== selfId && c.name.toLowerCase() === name.toLowerCase(),
  );
  if (duplicated) {
    throw new DomainError('CATEGORY_NAME_DUPLICATE', name);
  }
  return name;
}

/** 팔레트 12색 중 하나인지 검사하고 저장 표기(대문자 HEX)로 돌려준다 (category R3). */
export function validateCategoryColor(raw: string): string {
  const color = normalizeHexColor(raw);
  if (color === undefined || !isPaletteColor(color)) {
    throw new DomainError('CATEGORY_COLOR_INVALID', raw);
  }
  return color;
}

/** 이모지는 0 또는 1 grapheme (category R4). 빈 값은 "이모지 없음"이다. */
export function validateCategoryEmoji(raw: string | undefined): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const emoji = raw.trim();
  if (emoji.length === 0) {
    return undefined;
  }
  if (graphemeCount(emoji) !== 1) {
    throw new DomainError('CATEGORY_EMOJI_INVALID', emoji);
  }
  return emoji;
}

/** 개수 제한 확인 (category R6). 생성 직전에 부른다. */
export function assertCategoryCapacity(existing: readonly Category[]): void {
  if (livingCategories(existing).length >= CATEGORY_MAX_COUNT) {
    throw new DomainError('CATEGORY_LIMIT_EXCEEDED', String(livingCategories(existing).length));
  }
}

/** 활성 목록 끝에 붙일 `order` (category R5·R9). 활성이 없으면 0. */
export function nextCategoryOrder(categories: readonly Category[]): number {
  return activeCategories(categories).reduce((max, c) => Math.max(max, c.order), -1) + 1;
}

/** 활성 카테고리를 `order` 오름차순(동률은 `createdAt` → `id`)으로. */
export function activeCategories(categories: readonly Category[]): Category[] {
  return categories
    .filter((c) => !isTombstone(c) && c.status === 'active')
    .sort((a, b) => (a.order !== b.order ? a.order - b.order : compareCreated(a, b)));
}

/** 종료된 카테고리를 `closedAt` 내림차순으로 (category R8 "종료됨 (n)" 섹션). */
export function closedCategories(categories: readonly Category[]): Category[] {
  return categories
    .filter((c) => !isTombstone(c) && c.status !== 'active')
    .sort((a, b) => {
      const at = a.closedAt ?? a.updatedAt;
      const bt = b.closedAt ?? b.updatedAt;
      return at === bt ? (a.id < b.id ? -1 : 1) : at < bt ? 1 : -1;
    });
}

/**
 * 화면 표시 순서 (todo R15 · completion-rate R5): 활성(`order`) → 종료(`closedAt` 내림차순) → 삭제됨.
 * 본문 그룹 목록과 달성률 막대가 **같은 함수**를 쓰게 하는 단일 소스다 — 규칙을 복제하면 두 순서가
 * 조용히 갈린다. 삭제됨 그룹은 `deletedAt` 으로 읽는다(종료한 뒤 삭제한 카테고리도 삭제 시각 기준).
 * 정렬은 전부 동률에서 `id` 로 끝나므로 memory·indexeddb 가 같은 순서를 낸다.
 */
export function sortCategoriesForDisplay(categories: readonly Category[]): Category[] {
  return [...categories].sort(compareForDisplay);
}

/** `sortCategoriesForDisplay` 의 비교자. 활성 0 → 종료 1 → 삭제됨 2 순. */
function compareForDisplay(a: Category, b: Category): number {
  const rank = (c: Category): number => (isTombstone(c) ? 2 : c.status === 'active' ? 0 : 1);
  if (rank(a) !== rank(b)) {
    return rank(a) - rank(b);
  }
  if (rank(a) === 0) {
    return a.order !== b.order ? a.order - b.order : compareCreated(a, b);
  }
  const at =
    rank(a) === 2 ? (a.deletedAt ?? a.closedAt ?? a.updatedAt) : (a.closedAt ?? a.updatedAt);
  const bt =
    rank(b) === 2 ? (b.deletedAt ?? b.closedAt ?? b.updatedAt) : (b.closedAt ?? b.updatedAt);
  return at === bt ? (a.id < b.id ? -1 : 1) : at < bt ? 1 : -1;
}

/** 생성 시각 오름차순, 동률은 `id` — 활성 `order` 동률의 결정적 타이브레이커. */
function compareCreated(a: Category, b: Category): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  return a.id < b.id ? -1 : 1;
}

/** 새 카테고리 (category R1~R6). `order` 는 활성 목록 끝이고 상태는 항상 `active` 로 시작한다. */
export function createCategory(
  input: { name: string; color: string; emoji?: string; existing: readonly Category[] },
  deps: MetaDeps,
): Persistable<Category> {
  assertCategoryCapacity(input.existing);
  const name = validateCategoryName(input.name, input.existing);
  const color = validateCategoryColor(input.color);
  const emoji = validateCategoryEmoji(input.emoji);
  return createMeta<Category>(deps, {
    name,
    color,
    ...(emoji === undefined ? {} : { emoji }),
    order: nextCategoryOrder(input.existing),
    status: 'active',
  });
}

/** 이름·색·이모지 수정 (category §2-B 수정 모드). `emoji: null` 은 이모지 제거다. */
export function updateCategory(
  category: Category,
  patch: { name?: string; color?: string; emoji?: string | null },
  existing: readonly Category[],
  deps: MetaDeps,
): Persistable<Category> {
  const { emoji: _current, ...rest } = category;
  const next = {
    ...rest,
    name:
      patch.name === undefined
        ? category.name
        : validateCategoryName(patch.name, existing, category.id),
    color: patch.color === undefined ? category.color : validateCategoryColor(patch.color),
  };
  const emoji =
    patch.emoji === undefined
      ? category.emoji
      : patch.emoji === null
        ? undefined
        : validateCategoryEmoji(patch.emoji);
  return touch(emoji === undefined ? next : { ...next, emoji }, deps.now());
}

/**
 * 상태 전이 (category R7). 서로 다른 두 상태 사이 전이만 허용하고 자동 전이는 없다.
 * 활성을 떠나면 `closedAt` 을 기록하고, 활성으로 돌아오면 `closedAt` 을 지우고 `order` 를 활성 목록 끝으로 옮긴다(R9).
 */
export function transitionCategory(
  category: Category,
  next: CategoryStatus,
  existing: readonly Category[],
  deps: MetaDeps,
): Persistable<Category> {
  if (category.status === next) {
    throw new DomainError('CATEGORY_TRANSITION_INVALID', `${category.status}→${next}`);
  }
  const at = deps.now();
  const { closedAt: _cleared, ...rest } = category;
  if (next === 'active') {
    return touch({ ...rest, status: next, order: nextCategoryOrder(existing) }, at);
  }
  return touch({ ...rest, status: next, closedAt: at }, at);
}

/** 활성 목록 안에서 순서를 바꾸고 0..n-1 로 재매김한다 (category R5). 바뀐 것만 돌려준다. */
export function reorderCategories(
  categories: readonly Category[],
  categoryId: CategoryId,
  targetIndex: number,
  deps: MetaDeps,
): Persistable<Category>[] {
  const sequence = activeCategories(categories);
  const from = sequence.findIndex((c) => c.id === categoryId);
  if (from === -1) {
    // 삭제 대화상자 전용 문구(`CATEGORY_REMOVAL_TARGET_INVALID` = '옮길 카테고리를 골라 주세요')를
    // 순서 변경 실패에 쓰면 엉뚱한 안내가 된다 — 목록에 없다는 사실만 말하는 코드를 쓴다.
    throw new DomainError('CATEGORY_NOT_IN_LIST', categoryId);
  }
  const to = Math.min(Math.max(targetIndex, 0), sequence.length - 1);
  const [moved] = sequence.splice(from, 1);
  sequence.splice(to, 0, moved);
  const at = deps.now();
  const changed: Persistable<Category>[] = [];
  sequence.forEach((category, index) => {
    if (category.order !== index) {
      changed.push(touch({ ...category, order: index }, at));
    }
  });
  return changed;
}

/**
 * 첫 실행 시드 (category R18): 카테고리가 하나도 없고 `seededAt` 도 없을 때만 `📝 todo` 한 개를 만든다.
 * 사용자가 지운 뒤에는 `seededAt` 때문에 다시 만들지 않는다. 두 쓰기는 같은 트랜잭션으로 적용한다.
 */
export function planFirstRunSeed(
  categories: readonly Category[],
  settings: Settings,
  deps: MetaDeps,
): { category: Persistable<Category>; settings: Persistable<Settings> } | undefined {
  if (categories.length > 0 || settings.seededAt !== undefined) {
    return undefined;
  }
  return {
    category: createCategory({ ...SEED_CATEGORY, existing: [] }, deps),
    settings: markSeeded(settings, deps),
  };
}
