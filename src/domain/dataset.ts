// 데이터셋 단위 연산의 **값 타입** (ADR-0009, TECH_PLAN §6).
//
// 왜 domain 에 있는가: `planCategoryRemoval`(category.md R13)·백업 병합(backup R6)처럼 **무엇을 쓸지 정하는 쪽**이
// 도메인이고, 도메인은 `repositories` 를 import 할 수 없다(ARCHITECTURE §1 허용 목록). 계약 인터페이스
// (`DatasetRepository`)는 `src/repositories/dataset-repository.ts` 에 두고, 그 파일이 이 타입들을 import 한다
// (repositories → domain 은 허용 방향). 타입의 단일 소스는 여기 하나다.
import type { Category } from '@/domain/category/category';
import type { Dday } from '@/domain/dday/dday';
import type { DiaryEntry } from '@/domain/diary/diary-entry';
import type { FocusSession } from '@/domain/focus/focus-session';
import type { Persistable } from '@/domain/meta';
import type { Routine } from '@/domain/routine/routine';
import type { Settings } from '@/domain/theme/settings';
import type { Todo } from '@/domain/todo/todo';

/**
 * 저장할 로우 한 건 + 그 테이블. 전부 `Persistable` 이라 도메인을 거치지 않은 값은 실릴 수 없다.
 *
 * `routines` 가 있는 이유: 루틴 관리 조작(등록·중지·재개·삭제)이 그 구간에서 만든 투두들과 루틴
 * 레코드 자체를 **한 트랜잭션**으로 커밋해야 하기 때문이다(routine.md §4, ADR-0018 — 지연 생성
 * 자체는 더 이상 루틴 로우를 쓰지 않는다, `Routine.fillFloor` 필드 주석) — `write()` 가 이미 "여러
 * 테이블에 걸친 upsert 를 단일 트랜잭션으로" 처리하는 유일한 통로다(category R13·R15 의
 * `planCategoryRemoval` 과 같은 자리).
 */
export type DatasetWrite =
  | { table: 'todos'; entity: Persistable<Todo> }
  | { table: 'categories'; entity: Persistable<Category> }
  | { table: 'focusSessions'; entity: Persistable<FocusSession> }
  | { table: 'settings'; entity: Persistable<Settings> }
  | { table: 'routines'; entity: Persistable<Routine> };

/**
 * `readAll()` 이 돌려주는 **툼스톤 포함** 전량 스냅샷. 브랜드가 없으므로 그대로 `restore` 에 넘길 수 없다.
 *
 * `ddays`·`diaryEntries`·`routines` 가 있는 이유(T-86, ADR-0016 정정 2·ADR-0017 재검토 트리거):
 * 백업 내보내기/가져오기(`DatasetRepository.readAll`/`restore`)가 이 스냅샷 하나로 도니, 여기 없는
 * 테이블은 백업 파일에 실리지 않고 기기를 옮기면 조용히 사라진다 — 세 테이블 모두 그 상태였다.
 */
export type DatasetSnapshot = {
  todos: Todo[];
  categories: Category[];
  focusSessions: FocusSession[];
  settings: Settings;
  ddays: Dday[];
  diaryEntries: DiaryEntry[];
  routines: Routine[];
};

/** `restore()` 가 받는 스냅샷. 원소가 전부 `Persistable` 이다 (ADR-0009 규칙 2). */
export type PersistableSnapshot = {
  todos: readonly Persistable<Todo>[];
  categories: readonly Persistable<Category>[];
  focusSessions: readonly Persistable<FocusSession>[];
  settings: Persistable<Settings>;
  ddays: readonly Persistable<Dday>[];
  diaryEntries: readonly Persistable<DiaryEntry>[];
  routines: readonly Persistable<Routine>[];
};
