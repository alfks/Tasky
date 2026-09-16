'use client';

// 대기 화면 (timer §2·R1). 길이 프리셋(radiogroup) + 직접 입력 + 투두 선택 + 시작.
import { useId, useState } from 'react';

import { FOCUS_MAX_MINUTES, FOCUS_MIN_MINUTES } from '@/domain/focus/focus-session.rules';
import type { Todo } from '@/domain/todo/todo';

import { useTimerStore } from '@/features/timer/store/timer-store';
import { selectTodos, useTodoStore } from '@/features/todo';

import { Button } from '@/components/ui/Button';

/** §2 의 프리셋. 이 둘 밖의 길이는 "직접" 으로 넣는다. */
const PRESET_MINUTES = [25, 50] as const;

/**
 * 선택 날짜의 **미완료** 투두만 (timer §2). 완료한 일에 다시 집중을 걸 일은 없다.
 * 구독하는 것은 참조가 안정적인 `byId` 하나이고 정렬·필터는 렌더 중에 한다 —
 * `selectTodos` 를 그대로 구독하면 매 렌더 새 배열이라 무한 렌더가 된다(todo-selectors.ts 주석).
 */
function useUndoneTodos(): Todo[] {
  const byId = useTodoStore((state) => state.byId);
  return selectTodos({ byId }).filter((todo) => !todo.done);
}

export function TimerSetup() {
  const groupId = useId();
  const minutes = useTimerStore((state) => state.minutes);
  const soundOff = useTimerStore((state) => state.soundOff);
  const selectedTodoId = useTimerStore((state) => state.selectedTodoId);
  const setMinutes = useTimerStore((state) => state.setMinutes);
  const setSoundOff = useTimerStore((state) => state.setSoundOff);
  const selectTodo = useTimerStore((state) => state.selectTodo);
  const start = useTimerStore((state) => state.start);

  const presetMatch = PRESET_MINUTES.find((preset) => preset === minutes);
  const [custom, setCustom] = useState(presetMatch === undefined);
  const todos = useUndoneTodos();

  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      <p className="text-sm text-muted">
        {todos.length === 0
          ? '오늘 남은 할 일이 없어요. 할 일 없이 집중할 수 있어요.'
          : '집중할 할 일을 고르고 시간을 정해 주세요.'}
      </p>

      <label className="flex flex-col gap-[var(--space-1)] text-sm text-muted">
        집중할 할 일
        <select
          value={selectedTodoId ?? ''}
          onChange={(event) => selectTodo(event.target.value === '' ? null : event.target.value)}
          className="h-[var(--control-height)] rounded-[var(--radius-md)] border border-border bg-surface px-[var(--space-2)] text-base text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <option value="">할 일 없이 집중</option>
          {todos.map((todo) => (
            <option key={todo.id} value={todo.id}>
              {todo.title}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="flex flex-col gap-[var(--space-2)] border-0 p-0">
        <legend className="text-sm text-muted">집중 시간</legend>
        <div className="flex flex-wrap items-center gap-[var(--space-2)]">
          {PRESET_MINUTES.map((preset) => (
            <label key={preset} className="inline-flex items-center gap-[var(--space-1)] text-base">
              <input
                type="radio"
                name={groupId}
                checked={!custom && minutes === preset}
                onChange={() => {
                  setCustom(false);
                  setMinutes(preset);
                }}
              />
              {preset}분
            </label>
          ))}
          <label className="inline-flex items-center gap-[var(--space-1)] text-base">
            <input type="radio" name={groupId} checked={custom} onChange={() => setCustom(true)} />
            직접
          </label>
        </div>
        {custom && (
          <label className="flex items-center gap-[var(--space-2)] text-sm text-muted">
            분 단위로 입력
            <input
              type="number"
              min={FOCUS_MIN_MINUTES}
              max={FOCUS_MAX_MINUTES}
              step={1}
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
              className="h-[var(--control-height)] w-[6rem] rounded-[var(--radius-md)] border border-border bg-surface px-[var(--space-2)] text-base text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            />
          </label>
        )}
      </fieldset>

      <label className="inline-flex items-center gap-[var(--space-2)] text-sm text-muted">
        <input
          type="checkbox"
          checked={!soundOff}
          onChange={(event) => setSoundOff(!event.target.checked)}
        />
        끝났을 때 소리로 알리기
      </label>

      <Button onClick={() => void start()}>집중 시작</Button>
    </div>
  );
}
