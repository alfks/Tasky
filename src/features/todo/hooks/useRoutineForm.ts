// 루틴 등록 다이얼로그의 폼 상태 + 검증 (todo R21). 검증은 도메인 함수를 그대로 부른다
// (`validateTodoTitle`·`validateTodoMemo`·`expandRoutineDates`) — 저장 직전 스토어가 부르는 것과
// 같은 함수라 화면 미리보기·인라인 오류 문구와 실제 결과가 갈리지 않는다.
//
// **저장(store) 실패는 여기서 문구를 다시 만들지 않는다.** `createRoutine` 이 `false` 를 돌려주면
// 그대로 실패를 알리고 끝낸다 — 그 순간의 원인 문구는 스토어의 전역 `error` 에 있고, `TodoList` 의
// effect 가 그것을 토스트로 띄우면서 **`clearError()` 로 지운다**(같은 렌더 사이클에 스토어를
// 구독하는 다른 컴포넌트가 있으면 이 다이얼로그가 나중에 읽을 때는 이미 비어 있을 수 있다). 그 값을
// 다시 읽어 인라인에 echo 하면 타이밍에 따라 틀린 문구(예: 다른 액션의 문구)가 뜬다 — `TodoEditPanel`
// 도 저장 실패에는 인라인 문구 없이 같은 전역 토스트에만 맡긴다(같은 규칙).
import { useState } from 'react';

import { isValidDateKey } from '@/domain/date/civil';
import type { DateKey } from '@/domain/date/date-key';
import { domainErrorMessage } from '@/domain/errors';
import type { CategoryId, TodoId } from '@/domain/ids';
import { expandRoutineDates, type RoutineRecurrence } from '@/domain/todo/routine.rules';
import type { Todo } from '@/domain/todo/todo';
import { validateTodoMemo, validateTodoTitle } from '@/domain/todo/todo.rules';

import { MAX_DATE_KEY, MIN_DATE_KEY } from '@/features/date-strip';
import { useTodoActions } from '@/features/todo/hooks/useTodoActions';
import { TODO_MESSAGES } from '@/features/todo/messages';
import { messageOf } from '@/features/todo/store/todo-state';

export type RoutineRecurrenceType = RoutineRecurrence['type'];

/**
 * 쉼표·공백으로 구분한 숫자 목록을 정수 배열로. 조각 하나라도 정수로 못 읽으면 **전체를 빈
 * 배열로** 돌려준다 — 일부만 조용히 버리면("1, 15일" → `[1]`) 사용자가 알아채지 못한 채 의도한
 * 날짜가 소실된다. 빈 배열은 도메인의 "반복 패턴 없음" 오류로 이어져 다시 고치라고 안내한다.
 */
function parseMonthDays(raw: string): number[] {
  const pieces = raw
    .split(/[,\s]+/u)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0);
  const parsed = pieces.map(Number);
  return parsed.some((value) => !Number.isInteger(value)) ? [] : parsed;
}

type RecurrenceInput = {
  recurrenceType: RoutineRecurrenceType;
  setRecurrenceType: (value: RoutineRecurrenceType) => void;
  /** 0(일)~6(토). */
  weekdays: readonly number[];
  toggleWeekday: (day: number) => void;
  monthDaysText: string;
  setMonthDaysText: (value: string) => void;
  recurrence: RoutineRecurrence;
};

/** 반복 패턴 입력만 따로 뗀 조각 — `useRoutineForm` 본문 길이를 줄인다(code-style §2). */
function useRecurrenceInput(): RecurrenceInput {
  const [recurrenceType, setRecurrenceType] = useState<RoutineRecurrenceType>('weekly');
  const [weekdays, setWeekdays] = useState<readonly number[]>([]);
  const [monthDaysText, setMonthDaysText] = useState('');

  const toggleWeekday = (day: number): void => {
    setWeekdays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((a, b) => a - b),
    );
  };

  const recurrence: RoutineRecurrence =
    recurrenceType === 'weekly'
      ? { type: 'weekly', daysOfWeek: weekdays }
      : { type: 'monthly', daysOfMonth: parseMonthDays(monthDaysText) };

  return {
    recurrenceType,
    setRecurrenceType,
    weekdays,
    toggleWeekday,
    monthDaysText,
    setMonthDaysText,
    recurrence,
  };
}

/** 등록에 성공했을 때. `ids` 는 "되돌리기"가 지울 대상이다. 실패면 `null`. */
export type RoutineSubmitResult = { count: number; ids: TodoId[] } | null;

/** 다이얼로그가 쓰는 폼 한 벌. */
export type RoutineForm = {
  categoryId: CategoryId;
  setCategoryId: (value: CategoryId) => void;
  title: string;
  setTitle: (value: string) => void;
  memo: string;
  setMemo: (value: string) => void;
  startDate: string;
  setStartDate: (value: string) => void;
  endDate: string;
  setEndDate: (value: string) => void;
  recurrenceType: RoutineRecurrenceType;
  setRecurrenceType: (value: RoutineRecurrenceType) => void;
  weekdays: readonly number[];
  toggleWeekday: (day: number) => void;
  monthDaysText: string;
  setMonthDaysText: (value: string) => void;
  /** 검증 오류 문구. 저장(store) 실패는 여기 담기지 않는다(위 파일 머리 주석). */
  error: string | null;
  saving: boolean;
  submit: () => Promise<RoutineSubmitResult>;
};

/**
 * 다이얼로그가 열릴 때마다 **새로 마운트되는 것**을 전제로 한다(호출자가 조건부 렌더로 보장) —
 * `useEffect` 로 초기값을 다시 넣지 않는다(code-style §3: useEffect 상태 동기화 금지).
 */
export function useRoutineForm(todo: Todo): RoutineForm {
  const [categoryId, setCategoryId] = useState<CategoryId>(todo.categoryId);
  const [title, setTitle] = useState(todo.title);
  const [memo, setMemo] = useState(todo.memo ?? '');
  const [startDate, setStartDate] = useState<string>(todo.date);
  const [endDate, setEndDate] = useState<string>(todo.date);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const {
    recurrenceType,
    setRecurrenceType,
    weekdays,
    toggleWeekday,
    monthDaysText,
    setMonthDaysText,
    recurrence,
  } = useRecurrenceInput();
  const { createRoutine } = useTodoActions();

  const submit = async (): Promise<RoutineSubmitResult> => {
    let validTitle: string;
    let validMemo: string | undefined;
    try {
      validTitle = validateTodoTitle(title);
      validMemo = validateTodoMemo(memo);
    } catch (thrown) {
      setError(messageOf(thrown));
      return null;
    }
    if (startDate === '' || endDate === '') {
      setError(TODO_MESSAGES.routineDatesRequired);
      return null;
    }
    // `<input type="date">` 의 `min`/`max` 는 표시 계층 힌트일 뿐 값을 막지 않는다(직접 타이핑·
    // 붙여넣기로 벗어날 수 있다) — date-strip 이 다루는 범위(date-strip.md R6) 밖의 날짜는 스트립
    // 으로 다시 찾아갈 수 없으므로 여기서 실제로 거절한다.
    if (
      !isValidDateKey(startDate) ||
      !isValidDateKey(endDate) ||
      startDate < MIN_DATE_KEY ||
      startDate > MAX_DATE_KEY ||
      endDate < MIN_DATE_KEY ||
      endDate > MAX_DATE_KEY
    ) {
      setError(domainErrorMessage('ROUTINE_DATE_RANGE_INVALID'));
      return null;
    }

    let dates: DateKey[];
    try {
      dates = expandRoutineDates({ startDate, endDate, recurrence });
    } catch (thrown) {
      setError(messageOf(thrown));
      return null;
    }
    if (dates.length === 0) {
      setError(TODO_MESSAGES.routineEmptyResult);
      return null;
    }

    setSaving(true);
    const ids = await createRoutine({
      categoryId,
      title: validTitle,
      memo: validMemo,
      startDate,
      endDate,
      recurrence,
    });
    setSaving(false);
    if (ids === false) {
      return null;
    }
    if (ids.length === 0) {
      // 반복 조건에 맞는 날짜는 있었지만 전부 이미 등록돼 있었다(중복 방지, todo-actions.ts) —
      // "0개를 만들었다" 는 토스트를 띄우고 닫는 것보다, 여기서 멈추고 왜인지 알리는 편이 낫다.
      setError(TODO_MESSAGES.routineAllDuplicates);
      return null;
    }
    setError(null);
    return { count: ids.length, ids };
  };

  return {
    categoryId,
    setCategoryId,
    title,
    setTitle,
    memo,
    setMemo,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    recurrenceType,
    setRecurrenceType,
    weekdays,
    toggleWeekday,
    monthDaysText,
    setMonthDaysText,
    error,
    saving,
    submit,
  };
}
