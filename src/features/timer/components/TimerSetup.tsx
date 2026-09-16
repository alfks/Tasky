'use client';

// 대기 화면 (timer §2·R1). 길이 프리셋(radiogroup) + 직접 입력 + 투두 선택 + 시작.
import { useId, useState, type Ref } from 'react';

import { FOCUS_MAX_MINUTES, FOCUS_MIN_MINUTES } from '@/domain/focus/focus-session.rules';
import type { Todo } from '@/domain/todo/todo';

import { useTimerStore } from '@/features/timer/store/timer-store';
import { selectTodos, useTodoStore } from '@/features/todo';

import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';

import { cn } from '@/lib/cn';

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

type TimerSetupProps = {
  /** 중지 직후 포커스가 돌아올 자리 (§5 완료 조건 3). 패널이 준다. */
  startRef?: Ref<HTMLButtonElement>;
};

export function TimerSetup({ startRef }: TimerSetupProps) {
  const groupId = useId();
  const soundLabelId = `${groupId}-sound`;
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
            <RadioOption
              key={preset}
              name={groupId}
              label={`${preset}분`}
              checked={!custom && minutes === preset}
              onSelect={() => {
                setCustom(false);
                setMinutes(preset);
              }}
            />
          ))}
          <RadioOption
            name={groupId}
            label="직접"
            checked={custom}
            onSelect={() => setCustom(true)}
          />
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

      {/* 보이는 문구가 그대로 이름이라 `labelledBy` 로 잇는다(Checkbox 주석). 감싼 label 덕에
          문구를 눌러도 토글된다 — 여기 문구는 편집 대상이 아니라서 todo R14 의 충돌이 없다. */}
      <label className="inline-flex w-fit items-center gap-[var(--space-1)] text-sm text-muted">
        <Checkbox
          checked={!soundOff}
          onCheckedChange={(checked) => setSoundOff(!checked)}
          labelledBy={soundLabelId}
        />
        <span id={soundLabelId}>끝났을 때 소리로 알리기</span>
      </label>

      <Button ref={startRef} onClick={() => void start()}>
        집중 시작
      </Button>
    </div>
  );
}

type RadioOptionProps = {
  /** 같은 값을 공유하는 라디오끼리 한 그룹이 된다 — 화살표 이동·탭 정지점 1개가 여기서 나온다. */
  name: string;
  label: string;
  checked: boolean;
  onSelect: () => void;
};

/**
 * 프리셋 라디오 한 칸. `role="radio"` 를 흉내 내지 않고 **네이티브 `input[type=radio]` 를 그대로 두고**
 * 시각 표현만 형제 요소에 맡긴다(Checkbox 와 같은 방식). 화살표 키 이동·그룹당 탭 정지점 1개·
 * "N개 중 M번째" 낭독은 브라우저가 주는 것이라 다시 구현하지 않는다.
 * 치수는 Checkbox 와 같은 토큰(32px 히트 영역 + 22px 원형)을 쓴다.
 */
function RadioOption({ name, label, checked, onSelect }: RadioOptionProps) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-[var(--space-1)] text-base text-text">
      <span className="relative inline-flex size-[var(--control-hit-min)] shrink-0 items-center justify-center">
        <input
          type="radio"
          name={name}
          checked={checked}
          onChange={onSelect}
          className="peer absolute inset-0 size-full cursor-pointer opacity-0"
        />
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none size-[var(--control-checkbox-size)] rounded-full bg-surface',
            '[border-width:var(--control-checkbox-border)] [border-style:solid]',
            'transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]',
            // 미체크에서 테두리가 유일한 식별 수단이라 3:1 이 필요하다(Checkbox 와 같은 근거).
            'border-muted peer-hover:border-accent',
            'peer-checked:border-accent peer-checked:bg-accent',
            'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute size-[calc(var(--control-checkbox-size)*0.36)] rounded-full',
            // 선택 표시는 Checkbox 의 ✓ 와 같은 자리를 맡는다 — 채운 원 위의 on-accent 점.
            'bg-on-accent opacity-0 peer-checked:opacity-100',
          )}
        />
      </span>
      {label}
    </label>
  );
}
