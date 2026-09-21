// 무기한 루틴 채우기 계획 — 즉시 채우기(R3·R4)와 지연 생성(R6)이 공유하는 **하나의 계산**.
//
// **슬롯 id 설계(ADR-0018, ADR-0017 §재검토 위험 1)**: `(routineId, date)` 슬롯의 id 는
// `routineInstanceSlotId` 로 만든 결정적 값이다 — 두 기기가 독립적으로 같은 슬롯을 채워도 같은 id 를
// 만들어, 서버의 "생성은 없을 때만"(`server-rules.ts`)이 하나만 남기고 나머지를 거절한다(F1).
// 이미 그 슬롯 id 를 가진 로우가 있으면(살아 있든 툼스톤이든) `existingIds` 로 건너뛴다 — 판정
// 자체는 **호출부**(`SyncRepository.existingIds`, T-92 후속)의 몫이고 이 함수는 멤버십만 본다.
//
// **`fillFloor`(구 `materializedThrough`)는 이 함수가 다시 전진시킨다(2026-09-21 정정, PR #121 리뷰
// Blocker).** 최종 설계(SYNC_DESIGN.md §①-2 결정 (a)-3, ADR-0018 §결정 3)는 이 값을 사용자 조작
// (`createRoutine`·`resumeRoutine`)에만 묶고, 배경 채우기의 dedup 은 `SyncRepository.existingIds`
// (툼스톤 포함 벌크 조회, T-92 후속 — 이 티켓 owns 밖)가 맡긴다. 그 포트가 아직 배선되지 않은 지금은
// 호출부(`todo-routine-fill.ts`)가 만드는 `existingIds` 가 **살아 있는 로우만** 본다 — 그래서
// `fillFloor` 가 멈춰 있으면 재방문마다 지난 구간을 다시 훑고, 소프트 삭제한 슬롯은 그 구간의 조회에
// 안 잡혀 **부활한다**(실측: 인스턴스 1건 삭제 → 더 넓은 범위 재방문 → 부활). 그 포트가 들어올 때까지
// **임시로** `fillFloor` 전진을 되살려 재스캔 자체를 없앤다 — 사용자 조작 전용이라는 불변식이 깨지는
// 대가는 있지만(ADR-0018 §재검토 트리거), 동기화 아웃박스 적재가 **아직 어떤 쓰기 경로에도 배선되지
// 않아**(T-92b 착수 전, `syncOutbox` 는 빈 스토어) 이 전진이 F2(배경 채우기가 아웃박스에 실려 다른
// 기기의 "중지" 를 덮는 것)를 당장 재현하지는 않는다. 포트가 배선되는 순간 이 전진은 다시 없애야
// 한다(ADR-0018 재검토 트리거).
import { addCivilDays } from '@/domain/date/civil';
import type { DateKey } from '@/domain/date/date-key';
import { touch, type MetaDeps, type Persistable } from '@/domain/meta';
import type { Routine } from '@/domain/routine/routine';
import { shouldMaterialize } from '@/domain/routine/routine.rules';
import { routineInstanceSlotId } from '@/domain/routine/slot-id';
import { expandRoutineDates } from '@/domain/todo/routine.rules';
import type { Todo } from '@/domain/todo/todo';
import { createTodo } from '@/domain/todo/todo.rules';

/**
 * 지연 생성(R6)이 한 번의 호출에서 **뒤로** 훑는 최대 길이(스캔 비용 상한, SYNC_DESIGN.md §①-2
 * 결정(a)-4·PR #121 리뷰 Major 3). `fillFloor` 가 이보다 오래 전에 멈춰 있어도(예: 한 번도 재방문
 * 하지 않은 3년 된 매일 루틴) 이 값보다 오래된 구간은 다시 훑지 않는다 — 그 구간의 슬롯은 영영
 * 채워지지 않는다(설계가 감수한 트레이드오프). 값의 근거는 SYNC_DESIGN.md 의 완료 조건 "fake-
 * indexeddb 에서 10루틴 × 3년(1,095일) 재스캔 < 200ms" 다.
 */
export const FILL_BACKFILL_HORIZON_DAYS = 1095;

/** `planRoutineFill` 의 결과. 채울 것이 있든 없든 `routine` 은 항상 `fillFloor` 가 전진한 새 값이다. */
export type RoutineFillPlan = {
  todos: readonly Persistable<Todo>[];
  routine: Persistable<Routine>;
};

/**
 * `routine.fillFloor` 다음 날부터 `through` 까지(양끝 포함, 종료일 상한 적용)를 계획한다. 만들 투두가
 * 0건이어도(routine.md R4 — 패턴 자체는 유효한데 그 구간엔 맞는 날짜가 없는 경우) **오류가 아니다**:
 * `routine` 은 `fillFloor` 가 `through`(종료일 상한 적용 값)까지 전진한 채로 돌아온다. 채울 구간
 * 자체가 없으면(비활성이거나 `through` 가 다음 날보다 앞) `null`.
 *
 * `existingIds` 에 이미 있는 슬롯 id 는 건너뛴다 — 살아 있든 툼스톤이든 호출부가 이미 판정해 넘긴
 * 값이라 이 함수는 다시 묻지 않는다(F1 방어 + 재방문 dedup).
 *
 * `siblings` 는 `order` 계산에만 쓴다(todo.md R5) — 같은 날짜·카테고리에 이미 있는 투두 **뒤**에
 * 새 인스턴스를 붙인다. dedup 판정에는 관여하지 않는다(그건 `existingIds` 뿐이다) — 호출부가
 * `siblings` 를 비워 보내도 정확성은 그대로다(순서만 그룹 맨 앞에서 시작한다).
 *
 * `today` 가 있으면 `from` 이 `today - FILL_BACKFILL_HORIZON_DAYS` 아래로 내려가지 않는다(Major 3).
 * 즉시 등록(`planCreateRoutine`)은 항상 방금 만든 루틴이라 이 하한에 걸릴 일이 없어 생략해도 안전
 * 하다 — 지연 생성(`planMaterializeRoutines`)만 넘긴다.
 */
export function planRoutineFill(
  input: {
    routine: Routine;
    through: DateKey;
    existingIds: ReadonlySet<string>;
    siblings?: readonly Todo[];
    today?: DateKey;
  },
  deps: MetaDeps,
): RoutineFillPlan | null {
  const { routine, through, existingIds, siblings = [], today } = input;
  const earliestFrom = addCivilDays(routine.fillFloor, 1);
  const horizonFloor =
    today === undefined ? undefined : addCivilDays(today, -FILL_BACKFILL_HORIZON_DAYS);
  const from =
    horizonFloor !== undefined && horizonFloor > earliestFrom ? horizonFloor : earliestFrom;
  const to = routine.endDate !== undefined && routine.endDate < through ? routine.endDate : through;
  if (!routine.active || to < from) {
    return null;
  }

  const todos: Persistable<Todo>[] = [];
  for (const date of expandRoutineDates({
    startDate: from,
    endDate: to,
    recurrence: routine.recurrence,
  })) {
    if (!shouldMaterialize(routine, date)) {
      continue;
    }
    const id = routineInstanceSlotId(routine.id, date);
    if (existingIds.has(id)) {
      continue;
    }
    todos.push(
      createTodo(
        {
          categoryId: routine.categoryId,
          date,
          title: routine.title,
          memo: routine.memo,
          siblings: siblings.filter((todo) => todo.date === date),
          routineId: routine.id,
          id,
        },
        deps,
      ),
    );
  }

  return {
    todos,
    routine: touch({ ...routine, fillFloor: to }, deps.now()),
  };
}

/**
 * R3 구간 보정(등록 시점 한 번만 쓴다 — 지연 생성 R6 는 워터마크가 이미 진행 중이라 필요 없다):
 * 종료일이 있으면 그대로(R21 그대로, 상한 없음). 없으면 지금 보이는 날짜 범위의 끝까지만 — 단
 * 시작일이 그 끝보다 뒤면(예: 오늘이 수요일인데 시작일을 다음 주로 고름) 구간이 거꾸로 뒤집히지
 * 않도록 시작일 당일 하루만 즉시 채우기 대상으로 본다(`max(보이는 범위 끝, 시작일)`).
 */
export function resolveImmediateFillThrough(input: {
  startDate: DateKey;
  endDate?: DateKey;
  visibleRangeEnd: DateKey;
}): DateKey {
  if (input.endDate !== undefined) {
    return input.endDate;
  }
  return input.visibleRangeEnd > input.startDate ? input.visibleRangeEnd : input.startDate;
}
