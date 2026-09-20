// 투두 생성·검증·변경 규칙 (todo.md R1·R2·R5·R6·R10·R12·R13·R18, timer R8).
// 모든 변경 함수는 touch()/markDeleted() 로 끝나 `Persistable<Todo>` 를 돌려준다 — 그 값만 upsert 할 수 있다(ADR-0007).
import type { DateKey } from '@/domain/date/date-key';
import { DomainError } from '@/domain/errors';
import type { CategoryId, RoutineId } from '@/domain/ids';
import { createMeta, markDeleted, touch, type MetaDeps, type Persistable } from '@/domain/meta';
import { nextTodoOrder } from '@/domain/todo/ordering';
import type { Todo } from '@/domain/todo/todo';

/** 제목 최대 길이 (todo R1). */
export const TODO_TITLE_MAX_LENGTH = 100;
/** 메모 최대 길이 (todo R2). */
export const TODO_MEMO_MAX_LENGTH = 500;

/** 코드 유닛이 아니라 코드 포인트로 센다 — 이모지 한 글자가 두 자로 세이지 않게. */
const charCount = (value: string): number => [...value].length;

/** 줄바꿈을 공백으로 바꾸고 앞뒤 공백을 제거한다 (todo R1: 붙여넣기 줄바꿈은 공백). */
export function normalizeTodoTitle(raw: string): string {
  return raw.replace(/[\r\n\u2028\u2029]+/gu, ' ').trim();
}

/** 메모 정규화: 줄바꿈은 유지하고 앞뒤 공백만 제거한다. 빈 문자열은 "메모 없음"이다 (todo R2). */
export function normalizeTodoMemo(raw: string | undefined): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const trimmed = raw.replace(/\r\n/gu, '\n').trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/** 정규화한 제목을 돌려주고, 비었거나 너무 길면 `DomainError` 를 던진다 (todo R1). */
export function validateTodoTitle(raw: string): string {
  const title = normalizeTodoTitle(raw);
  if (title.length === 0) {
    throw new DomainError('TODO_TITLE_REQUIRED');
  }
  if (charCount(title) > TODO_TITLE_MAX_LENGTH) {
    throw new DomainError('TODO_TITLE_TOO_LONG', String(charCount(title)));
  }
  return title;
}

/** 정규화한 메모를 돌려주고, 너무 길면 `DomainError` 를 던진다 (todo R2). */
export function validateTodoMemo(raw: string | undefined): string | undefined {
  const memo = normalizeTodoMemo(raw);
  if (memo !== undefined && charCount(memo) > TODO_MEMO_MAX_LENGTH) {
    throw new DomainError('TODO_MEMO_TOO_LONG', String(charCount(memo)));
  }
  return memo;
}

/**
 * 새 투두 (todo R5). `order` 는 같은 날짜·카테고리 그룹의 끝이고 `done` 은 항상 false 로 시작한다.
 * `routineId` 는 무기한 루틴의 지연 생성(routine.md R6, `@/domain/routine/routine-fill.ts`)만 채운다 —
 * R21 의 즉시 채우기와 사용자가 직접 추가하는 투두는 이 필드를 넘기지 않는다(선택 필드라 기존 호출은
 * 그대로다).
 */
export function createTodo(
  input: {
    categoryId: CategoryId;
    date: DateKey;
    title: string;
    memo?: string;
    /** 같은 날짜·카테고리의 기존 투두. `order` 계산에만 쓴다. */
    siblings: readonly Todo[];
    routineId?: RoutineId;
  },
  deps: MetaDeps,
): Persistable<Todo> {
  const title = validateTodoTitle(input.title);
  const memo = validateTodoMemo(input.memo);
  return createMeta<Todo>(deps, {
    categoryId: input.categoryId,
    date: input.date,
    title,
    ...(memo === undefined ? {} : { memo }),
    done: false,
    order: nextTodoOrder(input.siblings),
    ...(input.routineId === undefined ? {} : { routineId: input.routineId }),
  });
}

/**
 * 완료 토글 (todo R6). 완료하면 `doneAt` 을 기록하고 해제하면 지운다. `order` 는 바뀌지 않는다 —
 * 화면에서 아래로 내려가는 것은 정렬(R7)의 결과일 뿐이라 해제하면 원래 자리로 돌아온다.
 */
export function toggleTodoDone(todo: Todo, done: boolean, deps: MetaDeps): Persistable<Todo> {
  const at = deps.now();
  if (done) {
    return touch({ ...todo, done: true, doneAt: at }, at);
  }
  const { doneAt: _cleared, ...rest } = todo;
  return touch({ ...rest, done: false }, at);
}

/** 제목·메모 편집 (todo R14). `memo: null` 은 메모 삭제다. */
export function editTodo(
  todo: Todo,
  patch: { title?: string; memo?: string | null },
  deps: MetaDeps,
): Persistable<Todo> {
  const { memo: _current, ...rest } = todo;
  const next = {
    ...rest,
    title: patch.title === undefined ? todo.title : validateTodoTitle(patch.title),
  };
  const memo =
    patch.memo === undefined
      ? todo.memo
      : patch.memo === null
        ? undefined
        : validateTodoMemo(patch.memo);
  return touch(memo === undefined ? next : { ...next, memo }, deps.now());
}

/** 그룹(날짜·카테고리) 이동의 공통 계산: 대상 그룹 끝으로 간다. 카테고리·완료 상태는 인자가 정한다. */
function moveToGroup(
  todo: Todo,
  target: { date: DateKey; categoryId: CategoryId },
  targetGroupTodos: readonly Todo[],
  deps: MetaDeps,
): Persistable<Todo> {
  return touch({ ...todo, ...target, order: nextTodoOrder(targetGroupTodos) }, deps.now());
}

/** 날짜 이동 (todo R10): 카테고리·`done` 은 유지하고 대상 날짜 그룹 끝으로 간다. */
export function moveTodoToDate(
  todo: Todo,
  date: DateKey,
  targetGroupTodos: readonly Todo[],
  deps: MetaDeps,
): Persistable<Todo> {
  return moveToGroup(todo, { date, categoryId: todo.categoryId }, targetGroupTodos, deps);
}

/** 카테고리 변경 (todo R12): 대상 그룹 끝으로 간다. 활성 카테고리만 대상이라는 판정은 호출부(UI)가 한다. */
export function changeTodoCategory(
  todo: Todo,
  categoryId: CategoryId,
  targetGroupTodos: readonly Todo[],
  deps: MetaDeps,
): Persistable<Todo> {
  return moveToGroup(todo, { date: todo.date, categoryId }, targetGroupTodos, deps);
}

/** 소프트 삭제 (todo R13). 물리 삭제는 없다 (ADR-0005 규칙 5). */
export function deleteTodo(todo: Todo, deps: MetaDeps): Persistable<Todo> {
  return markDeleted(todo, deps.now());
}

/**
 * 집중 시간 누적 (timer R8). `focusSeconds` 는 `FocusSession` 에서 재계산 가능한 **표시용 캐시**라
 * 저장 실패해도 정합을 회복할 수 있다. 음수·비정수는 받지 않는다.
 */
export function addTodoFocusSeconds(
  todo: Todo,
  seconds: number,
  deps: MetaDeps,
): Persistable<Todo> {
  const added = Math.max(0, Math.round(seconds));
  return touch({ ...todo, focusSeconds: (todo.focusSeconds ?? 0) + added }, deps.now());
}
