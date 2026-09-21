// 무기한 루틴 채우기 계획 — 즉시 채우기(R3·R4)와 지연 생성(R6)이 공유하는 **하나의 계산**.
//
// **슬롯 id 설계(ADR-0018, ADR-0017 §재검토 위험 1)**: `(routineId, date)` 슬롯의 id 는
// `routineInstanceSlotId` 로 만든 결정적 값이다 — 두 기기가 독립적으로 같은 슬롯을 채워도 같은 id 를
// 만들어, 서버의 "생성은 없을 때만"(`server-rules.ts`)이 하나만 남기고 나머지를 거절한다(F1).
// 이미 그 슬롯 id 를 가진 로우가 있으면(살아 있든 툼스톤이든) `existingIds` 로 건너뛴다 — 판정
// 자체는 **호출부**(`SyncRepository.existingIds`, T-92 후속)의 몫이고 이 함수는 멤버십만 본다.
//
// **`fillFloor`(구 `materializedThrough`)는 이 함수가 더 이상 옮기지 않는다**(ADR-0018 §위험 2).
// 예전에는 채우기 자체가 매 호출마다 이 값을 구간 끝으로 전진시켜 중복·부활을 막았지만, 그러면
// 배경 채우기(R6, 사용자 조작이 전혀 없는 방문)가 루틴 로우를 매번 `touch()` 해 동기화 아웃박스에
// 싣고, 그 뒤 다른 기기의 "중지" 편집을 LWW 로 덮을 수 있었다. 지금은 채우기가 루틴 로우를 전혀
// 쓰지 않는다 — `fillFloor` 는 `routine.rules.ts` 의 `createRoutine`·`resumeRoutine`(둘 다 사용자
// 조작)만 바꾼다.
import { addCivilDays } from '@/domain/date/civil';
import type { DateKey } from '@/domain/date/date-key';
import type { MetaDeps, Persistable } from '@/domain/meta';
import type { Routine } from '@/domain/routine/routine';
import { shouldMaterialize } from '@/domain/routine/routine.rules';
import { routineInstanceSlotId } from '@/domain/routine/slot-id';
import { expandRoutineDates } from '@/domain/todo/routine.rules';
import type { Todo } from '@/domain/todo/todo';
import { createTodo } from '@/domain/todo/todo.rules';

/** `planRoutineFill` 의 결과. 루틴 로우는 실리지 않는다(위 파일 주석) — 호출부가 다시 쓸 일이 없다. */
export type RoutineFillPlan = {
  todos: readonly Persistable<Todo>[];
};

/**
 * `routine.fillFloor` 다음 날부터 `through` 까지(양끝 포함, 종료일 상한 적용)를 계획한다. 만들 투두가
 * 0건이어도(routine.md R4 — 패턴 자체는 유효한데 그 구간엔 맞는 날짜가 없는 경우) **오류가 아니다**.
 * 채울 구간 자체가 없으면(비활성이거나 `through` 가 다음 날보다 앞) `null`.
 *
 * `existingIds` 에 이미 있는 슬롯 id 는 건너뛴다 — 살아 있든 툼스톤이든 호출부가 이미 판정해 넘긴
 * 값이라 이 함수는 다시 묻지 않는다(F1 방어 + 재방문 dedup, `fillFloor` 가 더 이상 전진하지 않으므로
 * 같은 구간을 여러 번 다시 훑어도 이 판정 하나로 멱등하다).
 *
 * `siblings` 는 `order` 계산에만 쓴다(todo.md R5) — 같은 날짜·카테고리에 이미 있는 투두 **뒤**에
 * 새 인스턴스를 붙인다. dedup 판정에는 관여하지 않는다(그건 `existingIds` 뿐이다) — 호출부가
 * `siblings` 를 비워 보내도 정확성은 그대로다(순서만 그룹 맨 앞에서 시작한다).
 */
export function planRoutineFill(
  input: {
    routine: Routine;
    through: DateKey;
    existingIds: ReadonlySet<string>;
    siblings?: readonly Todo[];
  },
  deps: MetaDeps,
): RoutineFillPlan | null {
  const { routine, through, existingIds, siblings = [] } = input;
  const from = addCivilDays(routine.fillFloor, 1);
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

  return { todos };
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
