// 투두 엔티티 타입 (docs/ARCHITECTURE.md §4, TECH_PLAN §5). 생성·변경 함수는 todo.rules.ts.
import type { DateKey } from '@/domain/date/date-key';
import type { CategoryId, RoutineId } from '@/domain/ids';
import type { Meta } from '@/domain/meta';

/** 특정 날짜·카테고리에 속한 할 일 한 건. */
export type Todo = Meta & {
  /** 소속 카테고리 id. 카테고리가 삭제돼도 유지된다(캐스케이드 없음 — ADR-0005). */
  categoryId: CategoryId;
  /** 이 투두가 놓인 날짜. */
  date: DateKey;
  /** 사용자가 입력한 제목. 앞뒤 공백 제거 후 1~100자, 줄바꿈 없음 (todo R1). */
  title: string;
  /** 선택 메모. 0~500자, 줄바꿈 허용 (todo R2). */
  memo?: string;
  /** 완료 여부. */
  done: boolean;
  /**
   * 완료로 바뀐 시각(ISO UTC). 완료 블록 정렬 키이고(todo R7) 해제하면 제거된다(R6).
   * Phase 2 통계·피드에서 재구성할 수 없어 MVP 부터 기록한다(TECH_PLAN §5).
   */
  doneAt?: string;
  /** 같은 날짜·카테고리 안에서의 표시 순서. 완료 토글로는 바뀌지 않는다 (todo R6). */
  order: number;
  /** 이 투두에 누적된 집중 시간(초). 원천은 `FocusSession` 이고 이 값은 표시용 캐시다 (timer R8). */
  focusSeconds?: number;
  /**
   * 이 투두를 만든 루틴(routine.md §4). 무기한 루틴의 지연 생성(R6)이 채울 때만 찍히고, 그 뒤로는
   * 완전히 독립된 투두다(R9) — 루틴을 지워도(R10) 이 필드는 남아 "기록"으로 유지된다(원본이 없으면
   * 🔁 배지만 안 그린다). `Todo.routineId` 로 `todos` 를 다시 조회하는 경로는 없다(ADR-0016 §결정 2).
   */
  routineId?: RoutineId;
};
