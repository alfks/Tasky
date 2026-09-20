// Dexie 스키마·버전의 단일 소스 (docs/ARCHITECTURE.md §4). 이 파일을 import 할 수 있는 **비테스트** 파일은
// src/infra/indexeddb/query.ts 하나뿐이다 — 툼스톤 필터와 쓰기 경로가 그 한 곳에 있다(ADR-0007).
// 강제 범위를 정확히 적는다: `eslint.config.mjs` 의 `no-restricted-imports` 가 막는 것은 비테스트 파일뿐이고,
// 테스트 파일(`**/*.test.ts`)은 같은 파일의 테스트 블록이 그 규칙을 리셋하므로 **예외다**(`migration.test.ts`
// 가 스키마 문자열을 직접 읽어 v1→v2 를 재현하는 것이 그 예외를 쓰는 유일한 자리다 — 실측: 그 파일에
// eslint 를 돌리면 rc=0).
import Dexie, { type EntityTable } from 'dexie';

import type { Category } from '@/domain/category/category';
import type { Dday } from '@/domain/dday/dday';
import type { FocusSession } from '@/domain/focus/focus-session';
import type { Settings } from '@/domain/theme/settings';
import type { Todo } from '@/domain/todo/todo';

/**
 * 앱 데이터베이스. 추가·인덱스 변경은 ADR + version(n+1).
 *
 * `diaryEntries`·`routines` 는 v3(ADR-0016)에서 스토어 문자열(`STORES`)로는 이미 열려 있지만, 그
 * 도메인 타입(`DiaryEntry`·`Routine`)이 아직 없어(각각 T-80·T-81) 이 타입에는 넣지 않았다 — 그
 * 티켓들이 도메인 타입을 만들며 여기 `EntityTable` 필드를 더한다. 그때까지는 `db.table('routines')`
 * 처럼 이름으로만 접근할 수 있다(마이그레이션 테스트가 그렇게 쓴다).
 */
export type TaskyDb = Dexie & {
  todos: EntityTable<Todo, 'id'>;
  categories: EntityTable<Category, 'id'>;
  settings: EntityTable<Settings, 'id'>;
  focusSessions: EntityTable<FocusSession, 'id'>;
  ddays: EntityTable<Dday, 'id'>;
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
 * v2 스토어 선언. **수정 금지**(ADR-0011 결정 1, ADR-0016 §결정 4가 "두 세대로 일반화"). v1→v2
 * 마이그레이션 테스트가 이 문자열을 쓰고, v3 를 여는 `createDb()` 도 업그레이드 경로 재현을 위해
 * 이 블록을 그대로 거친다.
 */
export const STORES_V2 = {
  todos: 'id, date, categoryId, [date+categoryId], updatedAt',
  categories: 'id, order, status, updatedAt',
  settings: 'id',
  focusSessions: 'id, todoId, date, status, updatedAt',
} as const;

/**
 * 현재(v3) 스토어 선언 (ADR-0016). 인덱스 이름의 단일 소스다 — query.ts 의 `IndexOf<>` 가 이 문자열에서
 * 조회 가능한 인덱스 이름을 뽑아 타입으로 만든다. 여기 없는 이름으로 조회하면 컴파일 에러이고, Dexie 가
 * 전수 스캔으로 조용히 떨어지는 일이 없다(TECH_PLAN §8 성능 예산).
 * 형식: 항목 구분자는 ', ' 고정(첫 항목은 기본 키). 인덱스에 없는 필드(rev, deletedAt)는 버전업 없이 추가·변경할 수 있다.
 *
 * `ddays`·`diaryEntries`·`routines` 세 테이블을 **한 번에** 신설한다(ADR-0016 §결정 4 규칙 2) — calendar·
 * diary·routine 세 스펙이 거의 동시에 approved 됐고 셋 다 빈 스토어 신설이라 한 버전에 묶었다. 인덱스는
 * 각 스펙의 조회 메서드가 실제로 쓰는 것만 넣는다(ADR-0016 §결정 1, 과설계 방지):
 * `diaryEntries.date` 는 조회가 있어 넣되(diary.md `getByDate`) **유일 인덱스로 만들지 않는다** —
 * 소프트 삭제 툼스톤이 같은 `date` 값을 들고 남기 때문이다(ADR-0002·0007).
 *
 * **`routines` 는 `'id'` 뿐이다 — ADR-0016 원문의 `'id, active'` 를 정정한다.** IndexedDB 는 boolean
 * 을 키로 색인하지 못한다(`active: boolean`). 그 인덱스를 그대로 선언하면 죽은 인덱스가 되고
 * `where('active')` 조회는 `DataError` 로 죽는다 — `version(3)` 블록은 머지되는 순간 불변이라
 * 지금 바로잡는다(ADR-0016 "정정" 절). `list({ includeInactive })` 는 전량을 읽고 메모리에서 거른다
 * (루틴은 수십 건 규모라 예산 안, ADR-0016 §결정 1과 같은 판단).
 */
export const STORES = {
  ...STORES_V2,
  ddays: 'id',
  diaryEntries: 'id, date',
  routines: 'id',
} as const;

/** 현재 스키마 버전. 백업 파일의 `schemaVersion` 은 이 상수에서 파생한다(TECH_PLAN §5 규칙 6). */
export const DB_VERSION = 3;

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
 * `v3` (ADR-0016): `ddays`·`diaryEntries`·`routines` 테이블 신설.
 * `.upgrade(tx => …)` 를 달지 않는다: 두 버전업 모두 **기존 로우의 값을 바꾸지 않는다**. 테이블 신설은
 * 빈 스토어를 만들 뿐이고, 인덱스 추가는 Dexie/IndexedDB 가 기존 로우를 자동으로 재색인한다
 * (`migration.test.ts` 가 v1 로 넣은 카테고리가 v2 의 `status` 인덱스로 조회되는지, v2 로 넣은 로우가
 * v3 에서도 그대로인지를 단언한다).
 * 값 변환이 필요한 다음 버전업은 규칙대로 `.upgrade()` 를 단다(TECH_PLAN §5 규칙 1·4).
 */
export function createDb(name: string): TaskyDb {
  // Dexie 는 스토어 선언 후 테이블을 동적으로 붙이므로 타입 단언이 필요하다(역직렬화 경계 — code-style.md §9).
  const database = new Dexie(name) as TaskyDb;
  database.version(1).stores(STORES_V1);
  database.version(2).stores(STORES_V2);
  database.version(DB_VERSION).stores(STORES);
  return database;
}

/** 앱이 쓰는 인스턴스. 생성자는 `indexedDB` 를 건드리지 않는다(첫 조회·쓰기에서 연다 — providers.tsx 주석). */
export const db = createDb(DB_NAME);
