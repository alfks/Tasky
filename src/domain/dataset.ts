// 데이터셋 단위 연산의 **값 타입** (ADR-0009, TECH_PLAN §6).
//
// 왜 domain 에 있는가: `planCategoryRemoval`(category.md R13)·백업 병합(backup R6)처럼 **무엇을 쓸지 정하는 쪽**이
// 도메인이고, 도메인은 `repositories` 를 import 할 수 없다(ARCHITECTURE §1 허용 목록). 계약 인터페이스
// (`DatasetRepository`)는 `src/repositories/dataset-repository.ts` 에 두고, 그 파일이 이 타입들을 import 한다
// (repositories → domain 은 허용 방향). 타입의 단일 소스는 여기 하나다.
import type { Category } from '@/domain/category/category';
import type { FocusSession } from '@/domain/focus/focus-session';
import type { Persistable } from '@/domain/meta';
import type { Settings } from '@/domain/theme/settings';
import type { Todo } from '@/domain/todo/todo';

/** 저장할 로우 한 건 + 그 테이블. 전부 `Persistable` 이라 도메인을 거치지 않은 값은 실릴 수 없다. */
export type DatasetWrite =
  | { table: 'todos'; entity: Persistable<Todo> }
  | { table: 'categories'; entity: Persistable<Category> }
  | { table: 'focusSessions'; entity: Persistable<FocusSession> }
  | { table: 'settings'; entity: Persistable<Settings> };

/** `readAll()` 이 돌려주는 **툼스톤 포함** 전량 스냅샷. 브랜드가 없으므로 그대로 `restore` 에 넘길 수 없다. */
export type DatasetSnapshot = {
  todos: Todo[];
  categories: Category[];
  focusSessions: FocusSession[];
  settings: Settings;
};

/** `restore()` 가 받는 스냅샷. 원소가 전부 `Persistable` 이다 (ADR-0009 규칙 2). */
export type PersistableSnapshot = {
  todos: readonly Persistable<Todo>[];
  categories: readonly Persistable<Category>[];
  focusSessions: readonly Persistable<FocusSession>[];
  settings: Persistable<Settings>;
};
