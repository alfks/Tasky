// 무기한 루틴 검증·생성·중지·재개·삭제·정렬·지연 생성 판정 (routine.md R2·R5·R7·R7-a·R9·R10·R11).
//
// 즉시 채우기(R3·R4)의 날짜 계산은 그대로 `@/domain/todo/routine.rules#expandRoutineDates` 를 쓴다
// (복제 금지 — R21 과 같은 날짜 계산이어야 두 흐름이 갈리지 않는다). 이 파일은 그 위에 "루틴 자체를
// 저장한다" 는 새 개념만 더한다.
import { addCivilDays, isValidDateKey } from '@/domain/date/civil';
import type { DateKey } from '@/domain/date/date-key';
import { DomainError } from '@/domain/errors';
import type { CategoryId } from '@/domain/ids';
import { createMeta, markDeleted, touch, type MetaDeps, type Persistable } from '@/domain/meta';
import type { Routine } from '@/domain/routine/routine';
import {
  matchesRoutineRecurrence,
  validateRecurrence,
  type RoutineRecurrence,
} from '@/domain/todo/routine.rules';
import { validateTodoMemo, validateTodoTitle } from '@/domain/todo/todo.rules';

/**
 * 지연 생성 판정(R6): 오늘 이후 새 날짜 범위를 볼 때 이 날짜에 인스턴스를 만들어야 하는지.
 * **시각 의존이 없는 순수 함수**다 — `date`·`routine.startDate`·`routine.endDate` 만 비교하고
 * "오늘"을 스스로 읽지 않는다(호출부가 `today` 를 주입한다, routine.md §4).
 */
export function shouldMaterialize(routine: Routine, date: DateKey): boolean {
  return (
    routine.active &&
    date >= routine.startDate &&
    (routine.endDate === undefined || date <= routine.endDate) &&
    matchesRoutineRecurrence(date, routine.recurrence)
  );
}

/**
 * 새 루틴 레코드 (routine.md R5). `endDate` 가 없으면 무기한이고 `fillFloor` 는
 * `startDate` 전날로 시작한다 — 그래야 R6 지연 생성이 `startDate` 당일부터 채운다. 즉시 채우기
 * (R3·R4) 자체는 이 함수가 하지 않는다 — 호출부(`routine-fill.ts#planRoutineFill`)가 이 레코드를
 * 입력으로 받아 투두를 계획한다.
 */
export function createRoutine(
  input: {
    title: string;
    memo?: string;
    categoryId: CategoryId;
    recurrence: RoutineRecurrence;
    startDate: DateKey;
    endDate?: DateKey;
  },
  deps: MetaDeps,
): Persistable<Routine> {
  const title = validateTodoTitle(input.title);
  const memo = validateTodoMemo(input.memo);
  validateRecurrence(input.recurrence);
  if (!isValidDateKey(input.startDate)) {
    throw new DomainError('ROUTINE_DATE_RANGE_INVALID', input.startDate);
  }
  if (input.endDate !== undefined) {
    if (!isValidDateKey(input.endDate) || input.endDate < input.startDate) {
      throw new DomainError('ROUTINE_DATE_RANGE_INVALID', `${input.startDate}~${input.endDate}`);
    }
  }
  return createMeta<Routine>(deps, {
    title,
    ...(memo === undefined ? {} : { memo }),
    categoryId: input.categoryId,
    recurrence: input.recurrence,
    startDate: input.startDate,
    ...(input.endDate === undefined ? {} : { endDate: input.endDate }),
    active: true,
    fillFloor: addCivilDays(input.startDate, -1),
  });
}

/** 종료일이 있는 루틴은 중지·재개 자체가 없다(R7-a) — 도메인이 마지막 방어선이다. */
function assertIndefinite(routine: Routine): void {
  if (routine.endDate !== undefined) {
    throw new DomainError('ROUTINE_NOT_INDEFINITE');
  }
}

/** 중지 (R7): 지연 생성을 멈춘다. 이미 만든 인스턴스는 그대로다 — 루틴 레코드만 `active: false`. */
export function pauseRoutine(routine: Routine, deps: MetaDeps): Persistable<Routine> {
  assertIndefinite(routine);
  return touch({ ...routine, active: false }, deps.now());
}

/**
 * 재개 (R7): 다시 지연 생성을 켠다. **소급하지 않는다** — 멈춰 있던 구간은 채우지 않도록
 * `fillFloor` 를 `max(기존 값, today 전날)` 로 옮긴다(과거로 되돌아가지 않는다). 최종 설계에서
 * `fillFloor` 를 바꾸는 곳은 이 함수와 생성(`createRoutine`) 둘뿐이다(ADR-0018) — 둘 다 사용자가
 * 직접 누른 조작이라 아웃박스에 실려도 안전하다. **지금은 `planRoutineFill`(배경 채우기)도 이 값을
 * 전진시킨다** — `routine.ts` 의 `fillFloor` 필드 주석과 ADR-0018 재검토 트리거를 본다(임시,
 * PR #121 리뷰 Blocker, `SyncRepository.existingIds` 가 배선되면 없앤다).
 */
export function resumeRoutine(
  routine: Routine,
  today: DateKey,
  deps: MetaDeps,
): Persistable<Routine> {
  assertIndefinite(routine);
  const yesterday = addCivilDays(today, -1);
  const fillFloor = routine.fillFloor > yesterday ? routine.fillFloor : yesterday;
  return touch({ ...routine, active: true, fillFloor }, deps.now());
}

/**
 * 삭제 (R10): 소프트 삭제뿐이다. 과거 인스턴스의 `Todo.routineId` 연결은 손대지 않는다(기록 보존) —
 * `list()` 가 툼스톤을 감추므로 이후 지연 생성만 자연히 멈춘다.
 */
export function deleteRoutine(routine: Routine, deps: MetaDeps): Persistable<Routine> {
  return markDeleted(routine, deps.now());
}

/** 표준 정렬: 만든 순서(`createdAt` asc) → `id` asc. 두 저장소 구현이 갈리지 않게 동률을 끊는다. */
export function compareRoutines(a: Routine, b: Routine): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
