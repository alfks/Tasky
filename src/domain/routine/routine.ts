// 무기한 루틴 엔티티 타입 (routine.md §4). 생성·검증·지연 생성 판정 함수는 routine.rules.ts·routine-fill.ts.
//
// R21(`@/domain/todo/routine.rules#expandRoutineDates`)의 확장이다 — `RoutineRecurrence` 는 옮기지
// 않고 그 파일에서 그대로 재사용한다(`@/domain/todo/routine.rules` 밖 소비자의 import 경로를 바꾸지
// 않기 위해서다. T-81 owns 밖의 `RoutineDialog.tsx`·`useRoutineForm.ts` 가 그 경로로 이 타입을 이미
// import 하고 있다 — 옮기면 그 파일들이 깨진다).
import type { DateKey } from '@/domain/date/date-key';
import type { CategoryId } from '@/domain/ids';
import type { Meta } from '@/domain/meta';
import type { RoutineRecurrence } from '@/domain/todo/routine.rules';

/** 저장되는 반복 규칙 한 건(routine.md R5). id 는 `RoutineId`. */
export type Routine = Meta & {
  title: string;
  memo?: string;
  /**
   * **필수**(routine.md §4 정정 — 원문은 선택형이었다). `Todo.categoryId` 가 필수라 "카테고리 없이
   * 등록"은 애초에 성립하지 않는다 — 카테고리가 지워지면 `categoryId` 를 비우는 대신(원문 R11) 그
   * 카테고리가 살아 있는 동안만 지연 생성을 계속한다(살아 있는 카테고리가 아니면 생성을 멈춘다.
   * `routine-fill.ts` 호출부가 판정한다 — 루틴 레코드 자체는 바뀌지 않는다).
   */
  categoryId: CategoryId;
  recurrence: RoutineRecurrence;
  startDate: DateKey;
  /** 없으면 무기한(R2). 있으면 R21 과 같은 즉시 채우기로 끝나 R6 지연 생성이 할 일이 없다(R7-a). */
  endDate?: DateKey;
  /** false 면 지연 생성이 멈춘다(R7). 이미 만든 인스턴스는 영향받지 않는다. */
  active: boolean;
  /**
   * 이 날짜까지의 슬롯은 **전부 생성이 끝났다**(그 뒤 삭제·이동된 것 포함 — R9 로 그 뒤는 완전히
   * 독립된 투두라 워터마크와 무관하다). 생성 시 `startDate` 전날로 시작한다. 지연 생성(R6)은 이 값
   * 다음 날부터만 채우고, 채운 뒤 이 값을 그 구간의 끝으로 옮긴다 — `(routineId, date)` 슬롯이 평생
   * 한 번만 만들어지는 근거이자(조회로 판정하지 않는다 — ADR-0017), 재개(R7)의 "소급 없음"도 이 값을
   * 옮기는 것으로 표현한다.
   */
  materializedThrough: DateKey;
};
