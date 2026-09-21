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
   * 등록"은 애초에 성립하지 않는다 — 카테고리가 지워지면 `categoryId` 를 비우는 대신(원문 R11) 이
   * 루틴 레코드 자체는 바뀌지 않는다.
   *
   * **카테고리가 살아 있지 않을 때 생성을 멈추는 검사는 호출부에 있다**(T-82, ADR-0017 §결정 4) —
   * `src/features/todo/store/todo-routine-fill.ts#planMaterializeRoutines` 가 `categories.list()`
   * (살아 있는 목록)와 대조해 지운 카테고리를 가리키는 루틴을 `due` 에서 뺀다. `planRoutineFill`
   * (`routine-fill.ts`) 자체는 이 필드의 생존 여부를 보지 않는다 — 판정은 호출부의 몫으로 남긴다.
   */
  categoryId: CategoryId;
  recurrence: RoutineRecurrence;
  startDate: DateKey;
  /** 없으면 무기한(R2). 있으면 R21 과 같은 즉시 채우기로 끝나 R6 지연 생성이 할 일이 없다(R7-a). */
  endDate?: DateKey;
  /** false 면 지연 생성이 멈춘다(R7). 이미 만든 인스턴스는 영향받지 않는다. */
  active: boolean;
  /**
   * **이 날짜 이하의 슬롯은 절대 만들지 않는다**(하한, ADR-0018 — 구 `materializedThrough`).
   * **사용자 조작으로만 바뀐다**: 생성 시 `startDate` 전날로 시작하고, 재개(R7)가 `max(기존, today
   * 전날)` 로 옮긴다("소급 없음"). 채우기(`planRoutineFill`) 자체는 이 값을 **다시는 옮기지 않는다**
   * — 예전에는 채우기가 매 호출마다 이 값을 구간 끝으로 전진시켰지만, 그러면 배경 채우기(R6)가
   * 사용자 조작 없이도 루틴 로우를 `touch()` 해 동기화 아웃박스에 실리고, 다른 기기의 "중지" 편집을
   * LWW 로 덮을 수 있었다(ADR-0017 §재검토 위험 2). 지금은 슬롯 중복 방지를 `existingIds`(호출부가
   * 넘기는, 살아 있든 툼스톤이든 이미 있는 슬롯 id 집합)가 맡고, 이 필드는 순수하게 "여기까지는
   * 되살리지 않는다"는 사용자 의도만 표현한다.
   */
  fillFloor: DateKey;
};
