'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import type { CategoryId } from '@/domain/ids';
import { TODO_TITLE_MAX_LENGTH } from '@/domain/todo/todo.rules';

import { TODO_MESSAGES as M } from '@/features/todo/messages';
import { SAVE_FAILED } from '@/features/todo/store/todo-state';
import { useTodoStore } from '@/features/todo/store/todo-store';

import { Kbd } from '@/components/ui/Kbd';

import { isImeKey } from '@/lib/ime';

type TodoAddRowProps = {
  categoryId: CategoryId;
  /** 접근 이름에 들어가는 그룹 이름 (§5 `aria-label="… 에 할 일 추가"`). */
  categoryName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * 그룹 끝의 인라인 입력 행 (todo.md §2-A·R3·R4·R5).
 *
 * 저장에 성공해도 행은 **열린 채로 남고 텍스트만 비운다** — 한 카테고리에 여러 개를 이어 넣는 것이
 * 이 앱에서 가장 잦은 동작이다(R3 연속 입력). 실패하면 반대로 사용자가 친 문장을 돌려준다:
 * 방금 친 것을 다시 치게 만들지 않는다(§2-C "입력 행 텍스트 유지").
 *
 * **입력칸은 제출을 거는 그 순간 비운다**(T-67). 저장이 끝난 뒤에 비우면 그 사이가 통째로 함정이
 * 된다: 그 창은 "몇 ms" 가 아니라 **한 번의 저장이 걸리는 시간**이라 데이터가 쌓이거나 기기가
 * 느려지면 그만큼 벌어지고, 그동안 입력칸은 **이미 보낸 문장**을 들고 있다. 그 위에 사용자가
 * 다음 글자를 치면 앞 문장에 붙고, 뒤늦게 도착한 `setTitle('')` 이 그 글자를 지운다.
 * 읽는 것과 비우는 것을 같은 틱에 묶으면 그 창 자체가 없어진다.
 *
 * **저장 중에 온 제출은 버리지 않고 줄을 세운다**(T-67). 예전에는 `submitting` 플래그로 조용히
 * 버렸다 — 오류도 토스트도 없이 사라졌다(T-65 실측: `Enter` 간격 0·1ms 에서 5/5 유실).
 * 줄을 세우는 쪽이 사용자가 친 것을 하나도 잃지 않고, 스토어의 쓰기 큐가 `order` 를 이어 발급한다(R5).
 *
 * `Enter` 는 **조합 중이면 무시한다**(R4). 한글에서 첫 `Enter` 는 글자를 확정하는 키라,
 * 그것으로 제출하면 "쓰다 만 할 일" 이 계속 생긴다. 판정은 `lib/ime.ts` 한 곳에서 온다.
 *
 * 검증 문구는 필드 아래에 **인라인으로** 남긴다(§2-C "제출 시 표시"). 저장 실패는 반대로 토스트가
 * 맡는다 — 입력한 문장의 문제가 아니라 화면 전체의 사고라 필드 아래에 붙여 둘 이유가 없다(§2-C).
 */
export function TodoAddRow({ categoryId, categoryName, open, onOpenChange }: TodoAddRowProps) {
  const addTodo = useTodoStore((state) => state.addTodo);
  const clearError = useTodoStore((state) => state.clearError);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  // 제출은 한 줄로 세운다 — 앞 제출의 뒷정리(문구·복원)가 끝난 뒤에 다음이 시작된다.
  const queue = useRef<Promise<void>>(Promise.resolve());
  // 방금 제출이 입력칸을 비웠고 그 뒤로 사용자가 아무것도 치지 않았다.
  const consumed = useRef(false);
  const returning = useRef(false);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      return;
    }
    // 닫는 순간에는 `+ 할 일 추가` 버튼이 아직 렌더되지 않았다 — 그때 `focus()` 를 부르면 아무 일도
    // 일어나지 않고 포커스가 `<body>` 로 떨어진다(Chromium 실측). 다시 그려진 뒤에 옮긴다.
    if (returning.current) {
      returning.current = false;
      openerRef.current?.focus();
    }
  }, [open]);

  /** 제출 한 건. 줄을 선 뒤 차례가 왔을 때 돈다 — 스토어를 읽는 구독이 겹치지 않는다. */
  const run = async (sent: string): Promise<void> => {
    // 문구는 스토어에 **놓이는 순간** 붙잡는다. `TodoList` 의 토스트 effect 가 같은 `error` 를
    // 가져가며 `clearError()` 하기 때문에, `await` 가 끝난 뒤 `getState()` 로 읽으면 이미 `null`
    // 이다(실브라우저 실측 — 인라인 문구가 한 번도 뜨지 않던 자리다). 구독 콜백은 `set()` 안에서
    // **동기로** 불리므로 React 가 다시 그리기 전이고, 경쟁이 성립하지 않는다.
    const raised: { current: string | null } = { current: null };
    const unsubscribe = useTodoStore.subscribe((state) => {
      if (state.error === null || raised.current !== null) return;
      raised.current = state.error;
      // 검증 오류는 이 행이 책임진다 — 곧바로 거둬들여 토스트로 새지 않게 한다. 같은 문장이 필드
      // 아래와 토스트에 두 번 나오면 어느 쪽이 지금 얘긴지 알 수 없다(§2-C 가 채널을 가른 이유).
      if (state.error !== SAVE_FAILED) clearError();
    });
    try {
      const saved = await addTodo({ categoryId, title: sent });
      // 실패 두 가지를 스토어가 `error` 로 가른다: 문구가 있으면 검증·저장 실패, 없으면 대상 없음.
      // 저장 실패(`SAVE_FAILED`)는 토스트가 말하므로 필드 아래는 비워 둔다.
      const inline = raised.current === SAVE_FAILED ? null : raised.current;
      setMessage(saved ? null : inline);
      if (!saved) {
        // 실패했으니 문장을 돌려준다. 단 **빈 칸일 때만** — 그 사이 사용자가 새로 친 글자가 있으면
        // 그것이 우선이다. 덮으면 이번엔 새 글자가 소리 없이 사라진다(고치려던 바로 그 사고다).
        setTitle((current) => (current === '' ? sent : current));
      }
    } finally {
      unsubscribe();
    }
  };

  const submit = (): void => {
    const sent = title;
    // 앞 제출이 비운 칸에서 난 `Enter` — 새로 친 글자가 없으니 보낼 것이 없다(연타의 두 번째 키).
    // 사용자가 직접 비운 칸에서 누른 `Enter` 는 그대로 통과해 "할 일을 입력해 주세요" 를 받는다.
    if (sent === '' && consumed.current) return;
    setTitle('');
    consumed.current = true;
    queue.current = queue.current.then(
      () => run(sent),
      () => run(sent),
    );
  };

  const close = (): void => {
    setTitle('');
    consumed.current = false;
    setMessage(null);
    returning.current = true;
    onOpenChange(false);
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (isImeKey(e.nativeEvent)) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  const handleBlur = (): void => {
    // R3: 텍스트가 남아 있으면 저장하고, 비어 있으면 닫는다. 닫을 때 포커스를 끌어오지 않는다 —
    // 이미 다른 곳으로 떠난 포커스를 되돌리면 Tab 으로 빠져나갈 수 없다.
    if (title.trim() === '') {
      setMessage(null);
      onOpenChange(false);
      return;
    }
    submit();
  };

  if (!open) {
    return (
      <button
        ref={openerRef}
        type="button"
        onClick={() => onOpenChange(true)}
        className="flex h-[var(--control-height)] w-full items-center gap-[var(--space-2)] rounded-[var(--radius-md)] px-[var(--space-2)] text-left text-base text-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {M.addButton}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--space-1)]">
      <div className="flex h-[var(--control-height)] items-center gap-[var(--space-2)] rounded-[var(--radius-md)] bg-surface-2 px-[var(--space-2)]">
        <span
          aria-hidden="true"
          className="size-[var(--control-checkbox-size)] shrink-0 rounded-full border-2 border-muted"
        />
        <input
          ref={inputRef}
          type="text"
          value={title}
          maxLength={TODO_TITLE_MAX_LENGTH}
          placeholder={M.addPlaceholder}
          aria-label={M.addLabel(categoryName)}
          aria-invalid={message !== null}
          onChange={(e) => {
            consumed.current = false;
            setTitle(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="min-w-0 flex-1 bg-transparent text-base text-text outline-none placeholder:text-faint"
        />
        <span className="flex shrink-0 items-center gap-[var(--space-1)] text-xs text-muted">
          <Kbd>Esc</Kbd> 닫기
        </span>
      </div>
      {/* --color-danger 는 본문 글자색으로 쓰지 않는다(theme.md R9: 4.5:1 미달) — 본문색을 섞어 올린다. */}
      <p
        role="status"
        style={{ color: 'color-mix(in srgb, var(--color-danger) 70%, var(--color-text))' }}
        className="min-h-[var(--space-4)] px-[var(--space-2)] text-xs"
      >
        {message}
      </p>
    </div>
  );
}
