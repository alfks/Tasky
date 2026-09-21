'use client';

import type { DateKey } from '@/domain/date/date-key';

import { isDateKey } from '@/lib/date';

/** 메뉴 "날짜 바꾸기…" 가 펼치는 **네이티브** 날짜 입력 (R10-b). 달력 UI 를 직접 만들지 않는다. */
export function DatePickRow({
  date,
  onPick,
  onDismiss,
}: {
  date: DateKey;
  onPick: (next: DateKey) => void;
  onDismiss: () => void;
}) {
  return (
    <label className="flex items-center gap-[var(--space-2)] pl-[var(--space-8)] text-sm text-muted">
      날짜 바꾸기
      <input
        type="date"
        autoFocus
        defaultValue={date}
        onChange={(e) => {
          if (isDateKey(e.target.value)) onPick(e.target.value);
        }}
        onBlur={onDismiss}
        className="h-[var(--control-height)] rounded-[var(--radius-md)] border border-border bg-surface px-[var(--space-2)] text-base text-text"
      />
    </label>
  );
}
