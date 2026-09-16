'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import type { CategoryId } from '@/domain/ids';
import { TODO_TITLE_MAX_LENGTH } from '@/domain/todo/todo.rules';

import { TODO_MESSAGES as M } from '@/features/todo/messages';
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
 * 이 앱에서 가장 잦은 동작이다(R3 연속 입력). 실패하면 반대로 텍스트를 지우지 않는다:
 * 사용자가 방금 친 문장을 다시 치게 만들지 않는다.
 *
 * `Enter` 는 **조합 중이면 무시한다**(R4). 한글에서 첫 `Enter` 는 글자를 확정하는 키라,
 * 그것으로 제출하면 "쓰다 만 할 일" 이 계속 생긴다. 판정은 `lib/ime.ts` 한 곳에서 온다.
 */
export function TodoAddRow({ categoryId, categoryName, open, onOpenChange }: TodoAddRowProps) {
  const addTodo = useTodoStore((state) => state.addTodo);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
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

  const submit = async (): Promise<boolean> => {
    if (submitting.current) return false;
    submitting.current = true;
    try {
      const saved = await addTodo({ categoryId, title });
      // 실패 두 가지를 스토어가 `error` 로 가른다: 문구가 있으면 검증·저장 실패, 없으면 대상 없음.
      setMessage(saved ? null : useTodoStore.getState().error);
      if (saved) setTitle('');
      return saved;
    } finally {
      submitting.current = false;
    }
  };

  const close = (): void => {
    setTitle('');
    setMessage(null);
    returning.current = true;
    onOpenChange(false);
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (isImeKey(e.nativeEvent)) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
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
    void submit();
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
          onChange={(e) => setTitle(e.target.value)}
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
