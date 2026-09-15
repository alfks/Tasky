// 투두 저장소 계약. 구현은 infra(indexeddb)와 repositories/memory 두 곳뿐이다.
import type { DateKey } from '@/domain/date/date-key';
import type { Persistable } from '@/domain/meta';
import type { Todo } from '@/domain/todo/todo';

/** 투두 저장소. 조회는 툼스톤을 반환하지 않고, 쓰기는 upsert 하나뿐이다 (ADR-0007). */
export interface TodoRepository {
  /** id 로 한 건 조회. 없거나 툼스톤이면 undefined. */
  getById(id: string): Promise<Todo | undefined>;
  /** 특정 날짜의 투두 전부(툼스톤 제외). */
  listByDate(date: DateKey): Promise<Todo[]>;
  /** 모든 투두(툼스톤 제외). */
  listAll(): Promise<Todo[]>;
  /** 도메인 함수가 만든 값만 저장한다. 삭제는 markDeleted 결과를 upsert 한다. */
  upsert(todo: Persistable<Todo>): Promise<void>;
}
