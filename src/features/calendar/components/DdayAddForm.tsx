'use client';

// D-day 추가 인라인 폼 (calendar.md §2·§5). 열림/닫힘은 부모(DdayPanelSection)가 들고, 이 컴포넌트는
// 입력·검증 실패 문구·Enter/Esc 만 맡는다. 날짜 입력은 date-strip 의 `MonthJump` 와 같은
// `input[type=date]`(새 위젯이 아니다) — 범위도 date-strip 이 이미 쓰는 이동 가능 범위를 그대로 쓴다.
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import { DDAY_TITLE_MAX_LENGTH } from '@/domain/dday/dday.rules';

import { MAX_DATE_KEY, MIN_DATE_KEY } from '@/features/date-strip';

import { Kbd } from '@/components/ui/Kbd';

import { isImeKey } from '@/lib/ime';

type DdayAddFormProps = {
  onSubmit: (input: { title: string; date: string }) => Promise<boolean>;
  onCancel: () => void;
  /** 제출 실패 시 보여줄 인라인 문구. 스토어의 `error` 를 그대로 받는다. */
  error: string | null;
};

/** 인라인 D-day 추가 폼 (calendar §2 "[+ D-day 추가]"). 제목 입력에 초기 포커스, Enter 저장, Esc 취소. */
export function DdayAddForm({ onSubmit, onCancel, error }: DdayAddFormProps) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const submit = async (): Promise<void> => {
    if (submitting.current) return;
    submitting.current = true;
    try {
      const ok = await onSubmit({ title, date });
      if (ok) {
        setTitle('');
        setDate('');
        onCancel();
      }
    } finally {
      submitting.current = false;
    }
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLElement>): void => {
    if (isImeKey(e.nativeEvent)) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      <div className="flex items-center gap-[var(--space-2)]">
        <input
          ref={titleRef}
          type="text"
          value={title}
          maxLength={DDAY_TITLE_MAX_LENGTH}
          placeholder="제목"
          aria-label="D-day 제목"
          aria-invalid={error !== null}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-[var(--control-height)] min-w-0 flex-1 rounded-[var(--radius-md)] border border-border bg-surface px-[var(--space-2)] text-base text-text outline-none placeholder:text-faint"
        />
        <input
          type="date"
          value={date}
          min={MIN_DATE_KEY}
          max={MAX_DATE_KEY}
          aria-label="D-day 날짜"
          onChange={(e) => setDate(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-[var(--control-height)] shrink-0 rounded-[var(--radius-md)] border border-border bg-surface px-[var(--space-2)] text-base text-text"
        />
        <span className="flex shrink-0 items-center gap-[var(--space-1)] text-xs text-muted">
          <Kbd>Esc</Kbd> 취소
        </span>
      </div>
      {error !== null && (
        <p
          role="alert"
          style={{ color: 'color-mix(in srgb, var(--color-danger) 70%, var(--color-text))' }}
          className="px-[var(--space-2)] text-xs"
        >
          {error}
        </p>
      )}
    </div>
  );
}
