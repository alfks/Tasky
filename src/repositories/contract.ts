// 계약 테스트의 공통 토대: 구현을 가리키는 `ContractTarget` 과 결정적 엔티티 팩토리.
//
// **왜 `src/test/fixtures` 를 쓰지 않는가**: 계약 스위트는 `src/repositories` 레이어의 파일이라
// 허용 목록(`@/repositories` · `@/domain` · `@/lib`) 밖인 `@/test/**` 를 import 할 수 없다(ARCHITECTURE §1).
// 스위트를 `*.test.ts` 로 만들면 fixtures 를 쓸 수 있지만, 그러면 T-10 이 스위트를 import 하는 순간
// memory 실행분까지 그 파일에서 다시 돌아간다. 계약은 어떤 구현에도 그대로 붙어야 하므로 데이터도
// 계약 안에서 만든다 — 정적 JSON 이 아니라 팩토리이고(TECH_PLAN §7) 기본값은 fixtures 와 같은 값이다.
//
// 엔티티는 전부 도메인 `createMeta` 로 만든다. 그래서 이 파일에도 `Meta` 필드 리터럴이 없고
// (`NO_META_WRITE` 를 끄지 않는다) 팩토리의 반환값이 그대로 `upsert` 에 들어간다.
import type { Category } from '@/domain/category/category';
import type { DateKey } from '@/domain/date/date-key';
import type { FocusSession } from '@/domain/focus/focus-session';
import { createMeta, type Meta, type MetaDeps, type Persistable } from '@/domain/meta';
import { DEFAULT_ACCENT_COLOR, PALETTE } from '@/domain/theme/palette';
import { SETTINGS_ID, type Settings } from '@/domain/theme/settings';
import type { Todo } from '@/domain/todo/todo';

import type { Repositories } from '@/repositories/container';

/**
 * 계약을 돌릴 구현 하나. `create()` 는 호출할 때마다 **빈 상태**의 저장소 묶음을 돌려준다
 * (indexeddb 구현이라면 테이블을 비운 뒤 돌려준다). 다섯 저장소는 같은 상태를 공유해야 한다 —
 * `dataset.write()` 의 결과가 `todos.getById()` 에 보여야 하기 때문이다.
 */
export type ContractTarget = {
  name: string;
  create: () => Promise<Repositories>;
};

/** 모든 계약 픽스처의 기준 날짜(목요일)와 시각. */
export const CONTRACT_DATE = '2026-01-15' as DateKey;
export const CONTRACT_INSTANT = '2026-01-15T00:00:00.000Z';
/** 기본 카테고리 id — 투두 팩토리의 기본 `categoryId` 와 짝이 맞는다. */
export const CONTRACT_CATEGORY_ID = '20000000-0000-4000-8000-000000000001';

/** 도메인 필드만 덮어쓰는 override 타입. `Meta` 필드는 `createMeta` 가 만든다. */
type Fields<T extends Meta> = Partial<Omit<T, keyof Meta>> & { id?: string };

/**
 * 고정 시각 + 증가하는 UUID v4 형식 id 를 주는 `MetaDeps`.
 * id 가 실제 v4 모양인 이유는 `adopt()` 의 형식 검증(ADR-0009 결정 3)을 통과해야 하기 때문이다.
 */
export function contractDeps(options: { now?: string; seed?: number } = {}): MetaDeps {
  let seq = options.seed ?? 1;
  return {
    now: () => options.now ?? CONTRACT_INSTANT,
    id: () => `f0000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`,
  };
}

/** 투두 한 건. 기본은 기준 날짜·기본 카테고리의 미완료 투두다. */
export function contractTodo(deps: MetaDeps, fields: Fields<Todo> = {}): Persistable<Todo> {
  return createMeta<Todo>(deps, {
    categoryId: CONTRACT_CATEGORY_ID,
    date: CONTRACT_DATE,
    title: '할 일',
    done: false,
    order: 0,
    ...fields,
  });
}

/** 카테고리 한 건. 기본은 활성이고 색은 팔레트 첫 색이다. */
export function contractCategory(
  deps: MetaDeps,
  fields: Fields<Category> = {},
): Persistable<Category> {
  return createMeta<Category>(deps, {
    name: '카테고리',
    color: PALETTE[0].light,
    order: 0,
    status: 'active',
    ...fields,
  });
}

/** 설정 한 행. 단일 행이므로 id 는 항상 `'default'` 다 (ADR-0005 규칙 1). */
export function contractSettings(
  deps: MetaDeps,
  fields: Fields<Settings> = {},
): Persistable<Settings> {
  return createMeta<Settings>(deps, {
    id: SETTINGS_ID,
    theme: 'system',
    accentColor: DEFAULT_ACCENT_COLOR,
    ...fields,
  });
}

/** 집중 세션 한 건. 기본은 25분짜리 실행 중 세션이다. */
export function contractFocusSession(
  deps: MetaDeps,
  fields: Fields<FocusSession> = {},
): Persistable<FocusSession> {
  return createMeta<FocusSession>(deps, {
    date: CONTRACT_DATE,
    plannedSeconds: 25 * 60,
    startedAt: CONTRACT_INSTANT,
    pausedTotalSeconds: 0,
    elapsedSeconds: 0,
    status: 'running',
    ...fields,
  });
}

/** 조회 결과를 id 목록으로. 순서 단언을 한 줄로 만든다. */
export function idsOf(rows: readonly Meta[]): string[] {
  return rows.map((row) => row.id);
}
