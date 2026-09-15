// 집중 세션 엔티티 타입 (timer.md §4, TECH_PLAN §5). 규칙 함수는 focus-session.rules.ts.
import type { DateKey } from '@/domain/date/date-key';
import type { CategoryId, TodoId } from '@/domain/ids';
import type { Meta } from '@/domain/meta';

/** 세션 상태 (timer R2·R4·R6·R7). `running`·`paused` 는 동시에 최대 1개다 (R5). */
export type FocusSessionStatus = 'running' | 'paused' | 'completed' | 'canceled';

/**
 * 한 번의 집중(카운트다운) 기록. **실행 중 상태의 원천**이라 새로고침·탭 닫기 후에도 이 레코드로 이어진다 (timer R2).
 * 삭제하지 않는다 — 소프트 삭제 필드는 `Meta` 공통이라 형식상 유지될 뿐이다 (timer R13).
 */
export type FocusSession = Meta & {
  /** 연결된 투두. "할 일 없이 집중"이면 없다. */
  todoId?: TodoId;
  /** 시작 시점의 카테고리 스냅샷. 투두 삭제·카테고리 변경 후에도 Phase 2 집계가 가능하게 한다 (timer §4). */
  categoryId?: CategoryId;
  /** 시작한 로컬 날짜. */
  date: DateKey;
  /** 계획한 길이(초). 1~180분 (timer R1). */
  plannedSeconds: number;
  /** 시작 시각(ISO UTC). 경과 계산의 기준점 (timer R3). */
  startedAt: string;
  /** 일시정지한 시각. 재개하면 제거된다 (timer R6). */
  pausedAt?: string;
  /** 지금까지 일시정지로 흘려보낸 시간의 합(초). */
  pausedTotalSeconds: number;
  /** 끝난 시각. 완료면 `startedAt + planned + pausedTotal`(현재 시각이 아니다 — timer R4), 취소면 취소 시각. */
  endedAt?: string;
  /** 확정된 경과(초). 끝나기 전에는 마지막으로 계산된 값이며 원천은 R3 의 시각 계산이다. */
  elapsedSeconds: number;
  /** 현재 상태. */
  status: FocusSessionStatus;
};
