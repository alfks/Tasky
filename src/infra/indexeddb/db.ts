// Dexie 스키마·버전의 단일 소스 (docs/ARCHITECTURE.md §4). 이 파일을 import 할 수 있는 **비테스트** 파일은
// src/infra/indexeddb/query.ts 하나뿐이다 — 툼스톤 필터와 쓰기 경로가 그 한 곳에 있다(ADR-0007).
// 강제 범위를 정확히 적는다: `eslint.config.mjs` 의 `no-restricted-imports` 가 막는 것은 비테스트 파일뿐이고,
// 테스트 파일(`**/*.test.ts`)은 같은 파일의 테스트 블록이 그 규칙을 리셋하므로 **예외다**(`migration.test.ts`
// 가 스키마 문자열을 직접 읽어 v1→v2 를 재현하는 것이 그 예외를 쓰는 유일한 자리다 — 실측: 그 파일에
// eslint 를 돌리면 rc=0).
import Dexie, { type EntityTable } from 'dexie';

import type { Category } from '@/domain/category/category';
import type { FocusSession } from '@/domain/focus/focus-session';
import type { Settings } from '@/domain/theme/settings';
import type { Todo } from '@/domain/todo/todo';

/** 앱 데이터베이스. 테이블 4개 고정 — 추가·인덱스 변경은 ADR + version(n+1). */
export type TaskyDb = Dexie & {
  todos: EntityTable<Todo, 'id'>;
  categories: EntityTable<Category, 'id'>;
  settings: EntityTable<Settings, 'id'>;
  focusSessions: EntityTable<FocusSession, 'id'>;
};

/**
 * v1 스토어 선언. **수정 금지**(TECH_PLAN §5 마이그레이션 규칙 1) — 기존 버전 블록을 고치면 이미
 * v1 로 열린 적 있는 브라우저에서 Dexie 가 스키마 불일치를 일으킨다. v1 로 만들어진 DB 를 v2 로
 * 올리는 경로를 재현하는 마이그레이션 테스트(`migration.test.ts`)도 이 문자열을 쓴다.
 */
export const STORES_V1 = {
  todos: 'id, date, categoryId, [date+categoryId], updatedAt',
  categories: 'id, order',
  settings: 'id',
} as const;

/**
 * 현재(v2) 스토어 선언. 인덱스 이름의 단일 소스다 — query.ts 의 `IndexOf<>` 가 이 문자열에서 조회 가능한
 * 인덱스 이름을 뽑아 타입으로 만든다. 여기 없는 이름으로 조회하면 컴파일 에러이고, Dexie 가 전수 스캔으로
 * 조용히 떨어지는 일이 없다(TECH_PLAN §8 성능 예산).
 * 형식: 항목 구분자는 ', ' 고정(첫 항목은 기본 키). 인덱스에 없는 필드(rev, deletedAt)는 버전업 없이 추가·변경할 수 있다.
 */
export const STORES = {
  todos: 'id, date, categoryId, [date+categoryId], updatedAt',
  categories: 'id, order, status, updatedAt',
  settings: 'id',
  focusSessions: 'id, todoId, date, status, updatedAt',
} as const;

/** 현재 스키마 버전. 백업 파일의 `schemaVersion` 은 이 상수에서 파생한다(TECH_PLAN §5 규칙 6). */
export const DB_VERSION = 2;

/** 앱 DB 이름. 브라우저에는 이 이름의 DB 하나만 생긴다. */
export const DB_NAME = 'tasky';

/**
 * 같은 스키마를 가진 Dexie 인스턴스를 **이름을 받아** 만든다.
 *
 * 앱은 아래 `db`(= `DB_NAME`) 하나만 쓴다. 이름을 인자로 받는 이유는 테스트 격리다: IndexedDB 는
 * 이름이 다르면 완전히 별개의 DB 이므로, 계약 테스트가 묶음마다 다른 이름으로 열면 "한 묶음을 건드려도
 * 다른 묶음은 안 변한다" 가 memory 구현과 같은 의미로 성립한다(테이블 비우기로는 그게 안 된다 —
 * 그건 격리가 아니라 전역 리셋이고, 먼저 만든 묶음의 데이터까지 지운다).
 *
 * `v2` (ADR-0011): `focusSessions` 테이블 신설 + `categories` 에 `status`·`updatedAt` 인덱스 추가.
 * `.upgrade(tx => …)` 를 달지 않는다: 두 변경 모두 **기존 로우의 값을 바꾸지 않는다**. 테이블 신설은
 * 빈 스토어를 만들 뿐이고, 인덱스 추가는 Dexie/IndexedDB 가 기존 로우를 자동으로 재색인한다
 * (`migration.test.ts` 가 v1 로 넣은 카테고리가 v2 의 `status` 인덱스로 조회되는지를 단언한다).
 * 값 변환이 필요한 다음 버전업은 규칙대로 `.upgrade()` 를 단다(TECH_PLAN §5 규칙 1·4).
 */
export function createDb(name: string): TaskyDb {
  // Dexie 는 스토어 선언 후 테이블을 동적으로 붙이므로 타입 단언이 필요하다(역직렬화 경계 — code-style.md §9).
  const database = new Dexie(name) as TaskyDb;
  database.version(1).stores(STORES_V1);
  database.version(DB_VERSION).stores(STORES);
  return database;
}

/** 앱이 쓰는 인스턴스. 생성자는 `indexedDB` 를 건드리지 않는다(첫 조회·쓰기에서 연다 — providers.tsx 주석). */
export const db = createDb(DB_NAME);
