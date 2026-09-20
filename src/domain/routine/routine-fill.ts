// 무기한 루틴 채우기 계획 — 즉시 채우기(R3·R4)와 지연 생성(R6)이 공유하는 **하나의 계산**.
//
// 워터마크 설계(ADR-0017)의 핵심: `(routineId, date)` 슬롯은 `routine.materializedThrough` 를 지나며
// 정확히 한 번만 계획된다. `TodoRepository.listByDateRange` 로 "이미 있는지" 되물어 판정하지 않는다
// — 그 조회는 소프트 삭제 툼스톤을 감추므로(ADR-0007) 지운 인스턴스가 다음 방문에 부활한다
// (routine.md §4 원문의 "결과에 없는 쌍만 upsert" 를 정정하는 이유, ADR-0017 §결정).
import { addCivilDays } from '@/domain/date/civil';
import type { DateKey } from '@/domain/date/date-key';
import { touch, type MetaDeps, type Persistable } from '@/domain/meta';
import type { Routine } from '@/domain/routine/routine';
import { shouldMaterialize } from '@/domain/routine/routine.rules';
import { expandRoutineDates } from '@/domain/todo/routine.rules';
import type { Todo } from '@/domain/todo/todo';
import { createTodo, normalizeTodoTitle } from '@/domain/todo/todo.rules';

/** `planRoutineFill` 의 결과. 채울 것이 있든 없든 `routine` 은 항상 워터마크가 이동한 새 값이다. */
export type RoutineFillPlan = {
  todos: readonly Persistable<Todo>[];
  routine: Persistable<Routine>;
};

/**
 * `routine.materializedThrough` 다음 날부터 `through` 까지(양끝 포함, 종료일 상한 적용)를 계획한다.
 * 만들 투두가 0건이어도(routine.md R4 — 패턴 자체는 유효한데 그 구간엔 맞는 날짜가 없는 경우) **오류가
 * 아니다**: `routine` 은 워터마크가 이동한 채로 돌아온다. 채울 구간 자체가 없으면(비활성이거나
 * `through` 가 다음 날보다 앞) `null` — 이때는 워터마크도 움직이지 않아 다음 호출이 같은 구간을
 * 다시 시도한다(ADR-0017 원자성).
 *
 * `existing` 은 이 구간의 **살아 있는** 투두다(같은 날짜·카테고리·정규화된 제목이면 건너뛴다 — R21
 * 과 같은 dedup 규칙, `routine-fill.contract.ts` 가 두 흐름이 갈리지 않는지 고정한다).
 */
export function planRoutineFill(
  input: { routine: Routine; through: DateKey; existing: readonly Todo[] },
  deps: MetaDeps,
): RoutineFillPlan | null {
  const { routine, through, existing } = input;
  const from = addCivilDays(routine.materializedThrough, 1);
  const to = routine.endDate !== undefined && routine.endDate < through ? routine.endDate : through;
  if (!routine.active || to < from) {
    return null;
  }

  const title = normalizeTodoTitle(routine.title);
  const todos: Persistable<Todo>[] = [];
  for (const date of expandRoutineDates({
    startDate: from,
    endDate: to,
    recurrence: routine.recurrence,
  })) {
    if (!shouldMaterialize(routine, date)) {
      continue;
    }
    const siblings = existing.filter(
      (todo) => todo.date === date && todo.categoryId === routine.categoryId,
    );
    // 기존 값은 백업 복원 경로에서 정규화되지 않은 채로 올 수 있어 다시 정규화해 비교한다
    // (todo-actions.ts#createRoutineAction 의 같은 주석 — 복제가 아니라 같은 이유의 같은 판단이다).
    if (siblings.some((sibling) => normalizeTodoTitle(sibling.title) === title)) {
      continue;
    }
    todos.push(
      createTodo(
        {
          categoryId: routine.categoryId,
          date,
          title: routine.title,
          memo: routine.memo,
          siblings,
          routineId: routine.id,
        },
        deps,
      ),
    );
  }

  return {
    todos,
    routine: touch({ ...routine, materializedThrough: to }, deps.now()),
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
