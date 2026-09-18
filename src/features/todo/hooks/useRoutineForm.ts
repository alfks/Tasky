// 루틴 등록 다이얼로그의 폼 상태 + 검증 (todo R21). 검증은 도메인 함수(`expandRoutineDates`)를 그대로
// 부른다 — 저장 직전 스토어가 부르는 것과 같은 함수라 화면 미리보기와 실제 결과가 갈리지 않는다.
import { useState } from 'react';

import type { DateKey } from '@/domain/date/date-key';
import type { CategoryId } from '@/domain/ids';
import { expandRoutineDates, type RoutineRecurrence } from '@/domain/todo/routine.rules';
import type { Todo } from '@/domain/todo/todo';

import { useTodoActions } from '@/features/todo/hooks/useTodoActions';
import { TODO_MESSAGES } from '@/features/todo/messages';
import { messageOf, SAVE_FAILED } from '@/features/todo/store/todo-state';
import { useTodoStore } from '@/features/todo/store/todo-store';

export type RoutineRecurrenceType = RoutineRecurrence['type'];

/** 쉼표·공백으로 구분한 숫자 목록을 정수 배열로. 파싱 불가한 조각은 버린다(도메인이 범위를 검증한다). */
function parseMonthDays(raw: string): number[] {
  return raw
    .split(/[,\s]+/u)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0)
    .map(Number)
    .filter((value) => Number.isInteger(value));
}

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
  /** 0(일)~6(토). */
  weekdays: readonly number[];
  toggleWeekday: (day: number) => void;
  monthDaysText: string;
  setMonthDaysText: (value: string) => void;
  /** 검증 오류 또는 저장 실패 문구. */
  error: string | null;
  saving: boolean;
  /** 검증 → 저장. 성공하면 만들어진 투두 개수를 돌려준다(0 은 실패). */
  submit: () => Promise<number>;
};

/**
 * 다이얼로그가 열릴 때마다 **새로 마운트되는 것**을 전제로 한다(호출자가 `key` 로 보장) —
 * `useEffect` 로 초기값을 다시 넣지 않는다(code-style §3: useEffect 상태 동기화 금지).
 */
export function useRoutineForm(todo: Todo): RoutineForm {
  const [categoryId, setCategoryId] = useState<CategoryId>(todo.categoryId);
  const [title, setTitle] = useState(todo.title);
  const [memo, setMemo] = useState(todo.memo ?? '');
  const [startDate, setStartDate] = useState<string>(todo.date);
  const [endDate, setEndDate] = useState<string>(todo.date);
  const [recurrenceType, setRecurrenceType] = useState<RoutineRecurrenceType>('weekly');
  const [weekdays, setWeekdays] = useState<readonly number[]>([]);
  const [monthDaysText, setMonthDaysText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { createRoutine } = useTodoActions();

  const toggleWeekday = (day: number): void => {
    setWeekdays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort(),
    );
  };

  const submit = async (): Promise<number> => {
    const recurrence: RoutineRecurrence =
      recurrenceType === 'weekly'
        ? { type: 'weekly', daysOfWeek: weekdays }
        : { type: 'monthly', daysOfMonth: parseMonthDays(monthDaysText) };

    let dates: DateKey[];
    try {
      dates = expandRoutineDates({
        startDate: startDate as DateKey,
        endDate: endDate as DateKey,
        recurrence,
      });
    } catch (thrown) {
      setError(messageOf(thrown));
      return 0;
    }
    if (dates.length === 0) {
      setError(TODO_MESSAGES.routineEmptyResult);
      return 0;
    }

    setSaving(true);
    const ok = await createRoutine({
      categoryId,
      title,
      memo: memo === '' ? undefined : memo,
      startDate: startDate as DateKey,
      endDate: endDate as DateKey,
      recurrence,
    });
    setSaving(false);
    if (!ok) {
      setError(useTodoStore.getState().error ?? SAVE_FAILED);
      return 0;
    }
    setError(null);
    return dates.length;
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
