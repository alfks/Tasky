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
   * **이 날짜 이하의 슬롯은 만들지 않는다**(하한, ADR-0018 — 구 `materializedThrough`).
   *
   * **최종 설계는 사용자 조작으로만 바뀌는 값이다**: 생성 시 `startDate` 전날로 시작하고, 재개(R7)가
   * `max(기존, today 전날)` 로 옮긴다("소급 없음"). 배경 채우기(`planRoutineFill`)는 원래 이 값을
   * 옮기지 않아야 한다 — 그래야 배경 채우기가 사용자 조작 없이 루틴 로우를 `touch()` 해 동기화
   * 아웃박스에 싣고, 다른 기기의 "중지" 편집을 LWW 로 덮는 경로(ADR-0017 §재검토 위험 2)가 안 열린다.
   *
   * **지금은 `planRoutineFill` 도 이 값을 `through` 까지 전진시킨다(임시, PR #121 리뷰 Blocker,
   * ADR-0018 §재검토 트리거)**: 슬롯 중복 방지가 최종적으로 기대는 `SyncRepository.existingIds`
   * (툼스톤 포함 벌크 조회, T-92 후속)가 아직 배선되지 않아, 호출부의 `existingIds` 가 살아 있는
   * 로우만 본다 — 그 상태로 `fillFloor` 를 고정해 두면 재방문마다 지난 구간을 다시 훑어 소프트
   * 삭제한 슬롯이 부활한다. 그 포트가 들어오면 이 전진을 다시 없앤다. 동기화 아웃박스 적재가 아직
   * 어떤 쓰기 경로에도 배선돼 있지 않아(T-92b 착수 전) 지금 당장은 이 전진이 F2 를 재현하지 않는다.
   */
  fillFloor: DateKey;
};
