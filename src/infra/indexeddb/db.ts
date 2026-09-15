// Dexie 스키마·버전의 단일 소스 (docs/ARCHITECTURE.md §4). 이 파일을 import 할 수 있는 파일은
// src/infra/indexeddb/query.ts 하나뿐이다(린트) — 툼스톤 필터와 쓰기 경로가 그 한 곳에 있다(ADR-0007).
import Dexie, { type EntityTable } from 'dexie';

import type { Category } from '@/domain/category/category';
import type { Settings } from '@/domain/theme/settings';
import type { Todo } from '@/domain/todo/todo';

/** 앱 데이터베이스. 테이블 3개 고정 — 추가·인덱스 변경은 ADR + version(n+1). */
export type TaskyDb = Dexie & {
  todos: EntityTable<Todo, 'id'>;
  categories: EntityTable<Category, 'id'>;
  settings: EntityTable<Settings, 'id'>;
};

// Dexie 는 스토어 선언 후 테이블을 동적으로 붙이므로 타입 단언이 필요하다(역직렬화 경계 — code-style.md §9).
export const db = new Dexie('tasky') as TaskyDb;

// 인덱스에 없는 필드(rev, deletedAt)는 버전업 없이 추가·변경할 수 있다.
db.version(1).stores({
  todos: 'id, date, categoryId, [date+categoryId], updatedAt',
  categories: 'id, order',
  settings: 'id',
});
