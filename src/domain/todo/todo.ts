// 투두 엔티티 타입 (docs/ARCHITECTURE.md §4). 생성·변경 함수는 후속 티켓에서 이 디렉토리에 추가한다.
import type { DateKey } from '@/domain/date/date-key';
import type { Meta } from '@/domain/meta';

/** 특정 날짜·카테고리에 속한 할 일 한 건. */
export type Todo = Meta & {
  /** 소속 카테고리 id. 카테고리가 삭제돼도 유지된다(캐스케이드 없음 — ADR-0005). */
  categoryId: string;
  /** 이 투두가 놓인 날짜. */
  date: DateKey;
  /** 사용자가 입력한 제목. */
  title: string;
  /** 완료 여부. */
  done: boolean;
  /** 같은 날짜·카테고리 안에서의 표시 순서. */
  order: number;
};
