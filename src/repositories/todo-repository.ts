// 투두 저장소 계약 (TECH_PLAN §6). 구현은 memory(`memory/todo-repository.ts`)와 infra(indexeddb) 둘뿐이다.
//
// 목록 메서드는 전부 **표준 정렬**(`order` asc → `createdAt` asc → `id` asc, `@/domain/todo/ordering`)이고
// 툼스톤을 반환하지 않는다(ADR-0007 결정 4). 쓰기는 `upsert` 하나뿐이라 삭제는
// `upsert(markDeleted(todo, now))` 다 — `remove`·`softDelete`·`restore` 는 이 계약에 없다(ADR-0007 규칙 2).
import type { DateKey } from '@/domain/date/date-key';
import type { CategoryId, TodoId } from '@/domain/ids';
import type { Persistable } from '@/domain/meta';
import type { Todo } from '@/domain/todo/todo';

/** 투두 저장소. 조회는 툼스톤을 반환하지 않고, 쓰기는 `upsert` 하나뿐이다 (ADR-0007). */
export interface TodoRepository {
  /** id 로 한 건. 없거나 툼스톤이면 `undefined`. */
  getById(id: TodoId): Promise<Todo | undefined>;
  /** 그 날짜의 투두 전부(표준 정렬). */
  listByDate(date: DateKey): Promise<Todo[]>;
  /** `from`~`to` **양끝 포함** 범위의 투두 전부(표준 정렬). 날짜 스트립의 점 표시·통계용. */
  listByDateRange(from: DateKey, to: DateKey): Promise<Todo[]>;
  /** 그 카테고리의 투두 전부(표준 정렬). 카테고리 삭제 계획의 입력이다. */
  listByCategory(categoryId: CategoryId): Promise<Todo[]>;
  /** 전량(표준 정렬). 검색·통계용이며 인덱스를 탈 수 없는 조회만 쓴다. */
  listAll(): Promise<Todo[]>;
  /**
   * 제목 부분 일치 검색 (shortcuts R9): 대소문자 무시, 메모는 보지 않는다.
   * 정렬은 `date` 내림차순 → 미완료 우선 → 표준 정렬이고 `limit` 건까지 돌려준다.
   */
  search(query: string, limit: number): Promise<Todo[]>;
  /** 도메인 함수가 만든 값만 저장한다. 삭제는 `markDeleted` 의 결과를 넘긴다. */
  upsert(todo: Persistable<Todo>): Promise<void>;
}
