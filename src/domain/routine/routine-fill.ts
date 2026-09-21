// 무기한 루틴 채우기 계획 — 즉시 채우기(R3·R4)와 지연 생성(R6)이 공유하는 **하나의 계산**.
//
// **슬롯 id 설계(ADR-0018, ADR-0017 §재검토 위험 1)**: `(routineId, date)` 슬롯의 id 는
// `routineInstanceSlotId` 로 만든 결정적 값이다 — 두 기기가 독립적으로 같은 슬롯을 채워도 같은 id 를
// 만들어, 서버의 "생성은 없을 때만"(`server-rules.ts`)이 하나만 남기고 나머지를 거절한다(F1).
// 이미 그 슬롯 id 를 가진 로우가 있으면(살아 있든 툼스톤이든) `existingIds` 로 건너뛴다 — 판정
// 자체는 **호출부**의 몫이고 이 함수는 멤버십만 본다.
//
// **`fillFloor`(구 `materializedThrough`)는 이 함수가 옮기지 않는다**(ADR-0018 §결정 3, 최종 설계로
// 복귀 — 2026-09-21 정정의 "임시 복원"을 T-92b 가 되돌렸다). 배경 채우기의 dedup 은
// `SyncRepository.existingIds`(툼스톤 포함 벌크 조회)가 맡는다 — 호출부(`todo-routine-fill.ts`)가
// `candidateFillDates` 로 이 함수와 **같은 날짜 후보**를 얻어 슬롯 id 로 바꾼 뒤 그 저장소에 물어
// 존재 여부(살아 있든 툼스톤이든)를 받아 `existingIds` 로 넘긴다. `fillFloor` 를 얼려 두므로
// 재방문마다 같은 구간을 다시 훑지만(비용은 `FILL_BACKFILL_HORIZON_DAYS` 로 상한을 둔다),
// 배경 작업이 루틴 로우를 전혀 쓰지 않아(이 파일도 `touch`를 import 하지 않는다) 아웃박스에 실릴
// 것 자체가 없다 — 다른 기기의 "중지" 를 덮는 경로(ADR-0017 §재검토 위험 2, F2)가 성립하지 않는다.
// `fillFloor` 를 바꾸는 곳은 `routine.rules.ts` 의 `createRoutine`·`resumeRoutine` 둘뿐이다(둘 다
// 사용자가 직접 누른 조작이라 아웃박스에 실려도 안전하다).
import { addCivilDays } from '@/domain/date/civil';
import type { DateKey } from '@/domain/date/date-key';
import type { MetaDeps, Persistable } from '@/domain/meta';
import type { Routine } from '@/domain/routine/routine';
import { shouldMaterialize } from '@/domain/routine/routine.rules';
import { routineInstanceSlotId } from '@/domain/routine/slot-id';
import { expandRoutineDates } from '@/domain/todo/routine.rules';
import type { Todo } from '@/domain/todo/todo';
import { createTodo } from '@/domain/todo/todo.rules';

/**
 * 지연 생성(R6)이 한 번의 호출에서 **뒤로** 훑는 최대 길이(스캔 비용 상한, SYNC_DESIGN.md §①-2
 * 결정(a)-4). `fillFloor` 를 얼려 두는 지금(ADR-0018 §결정 3 복귀) 이 상한이 **유일한** 스캔 비용
 * 방어선이다 — `fillFloor` 가 이보다 오래 전에 멈춰 있어도(예: 한 번도 재방문하지 않은 3년 된 매일
 * 루틴) 이 값보다 오래된 구간은 다시 훑지 않는다 — 그 구간의 슬롯은 영영 채워지지 않는다(설계가
 * 감수한 트레이드오프). 값의 근거는 SYNC_DESIGN.md 의 완료 조건 "fake-indexeddb 에서 10루틴 ×
 * 3년(1,095일) 재스캔 < 1,400ms"(T-92b 재실측, `todo-routine-fill.slow.test.ts`) 다 — 원래 목표는
 * 200ms 였으나, `fillFloor` 를 얼려 배경 채우기가 매번 `SyncRepository.existingIds` 벌크 조회를
 * 다시 치르게 되면서(F2 방어의 대가) fake-indexeddb 환경 실측치(약 980~1,070ms)에 맞춰 정직하게
 * 올렸다.
 */
export const FILL_BACKFILL_HORIZON_DAYS = 1095;

/** `planRoutineFill` 의 결과. 루틴 로우는 실리지 않는다(위 파일 주석) — 호출부가 다시 쓸 일이 없다. */
export type RoutineFillPlan = {
  todos: readonly Persistable<Todo>[];
};

/**
 * `candidateFillDates`·`planRoutineFill` 이 공유하는 채울 구간 계산. `null` 이면 채울 구간 자체가
 * 없다(비활성이거나 `through` 가 다음 날보다 앞).
 */
function resolveFillWindow(
  routine: Pick<Routine, 'fillFloor' | 'endDate' | 'active'>,
  through: DateKey,
  today: DateKey | undefined,
): { from: DateKey; to: DateKey } | null {
  const earliestFrom = addCivilDays(routine.fillFloor, 1);
  const horizonFloor =
    today === undefined ? undefined : addCivilDays(today, -FILL_BACKFILL_HORIZON_DAYS);
  const from =
    horizonFloor !== undefined && horizonFloor > earliestFrom ? horizonFloor : earliestFrom;
  const to = routine.endDate !== undefined && routine.endDate < through ? routine.endDate : through;
  if (!routine.active || to < from) {
    return null;
  }
  return { from, to };
}

/**
 * `routine.fillFloor` 다음 날부터 `through` 까지(양끝 포함, 종료일·스캔 지평선 상한 적용) 이 루틴이
 * **실제로 채울 후보 날짜**. `existingIds`(멤버십 판정)를 아직 적용하지 않은, 패턴에 맞는 날짜
 * 전체다 — 호출부가 이 목록을 `routineInstanceSlotId` 로 슬롯 id 화해 `SyncRepository.existingIds`
 * (툼스톤 포함)에 먼저 묻고, 그 결과를 `planRoutineFill` 의 `existingIds` 로 넘긴다.
 * **`planRoutineFill` 과 같은 `resolveFillWindow` 를 쓰므로 후보 목록이 절대 갈리지 않는다**(두
 * 계산이 따로 노는 경로가 없다 — 갈리면 호출부가 존재를 안 물어본 슬롯을 만들거나, 반대로 물어본
 * 슬롯을 안 만드는 사고가 난다).
 */
export function candidateFillDates(routine: Routine, through: DateKey, today?: DateKey): DateKey[] {
  const window = resolveFillWindow(routine, through, today);
  if (window === null) {
    return [];
  }
  return expandRoutineDates({
    startDate: window.from,
    endDate: window.to,
    recurrence: routine.recurrence,
  }).filter((date) => shouldMaterialize(routine, date));
}

/**
 * `routine.fillFloor` 다음 날부터 `through` 까지(양끝 포함, 종료일 상한 적용)를 계획한다. 만들 투두가
 * 0건이어도(routine.md R4 — 패턴 자체는 유효한데 그 구간엔 맞는 날짜가 없는 경우) **오류가 아니다**.
 * 채울 구간 자체가 없으면(비활성이거나 `through` 가 다음 날보다 앞) `null`.
 *
 * `existingIds` 에 이미 있는 슬롯 id 는 건너뛴다 — 살아 있든 툼스톤이든 호출부가 이미 판정해 넘긴
 * 값이라 이 함수는 다시 묻지 않는다(F1 방어 + 재방문 dedup, `fillFloor` 가 전진하지 않으므로
 * 같은 구간을 여러 번 다시 훑어도 이 판정 하나로 멱등하다).
 *
 * `siblings` 는 `order` 계산에만 쓴다(todo.md R5) — 같은 날짜·카테고리에 이미 있는 투두 **뒤**에
 * 새 인스턴스를 붙인다. dedup 판정에는 관여하지 않는다(그건 `existingIds` 뿐이다) — 호출부가
 * `siblings` 를 비워 보내도 정확성은 그대로다(순서만 그룹 맨 앞에서 시작한다).
 *
 * `today` 가 있으면 `from` 이 `today - FILL_BACKFILL_HORIZON_DAYS` 아래로 내려가지 않는다.
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
  if (resolveFillWindow(routine, through, today) === null) {
    return null;
  }

  const todos: Persistable<Todo>[] = [];
  for (const date of candidateFillDates(routine, through, today)) {
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
