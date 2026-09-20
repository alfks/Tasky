'use client';

import { FOCUS_SUMMARY_NONE_KEY } from '@/domain/todo/focus-summary';

import { formatFocusDuration } from '@/features/reports/lib/format';
import { FOCUS_OTHER_KEY, type FocusBucket } from '@/features/reports/lib/period-summary';

const NONE_TODO_LABEL = '할 일 없이 집중';
const OTHER_LABEL = '기타';
const UNKNOWN_TODO_LABEL = '삭제된 할 일';

function labelOf(bucket: FocusBucket, todoTitles: ReadonlyMap<string, string>): string {
  if (bucket.key === FOCUS_OTHER_KEY) return OTHER_LABEL;
  if (bucket.key === FOCUS_SUMMARY_NONE_KEY) return NONE_TODO_LABEL;
  return todoTitles.get(bucket.key) ?? UNKNOWN_TODO_LABEL;
}

type FocusTimeCardProps = {
  totalSeconds: number;
  byTodo: readonly FocusBucket[];
  todoTitles: ReadonlyMap<string, string>;
};

/** 집중 시간 카드(stats.md R5). `summarizeFocusSeconds` 결과를 그대로 보여준다. */
export function FocusTimeCard({ totalSeconds, byTodo, todoTitles }: FocusTimeCardProps) {
  if (totalSeconds === 0) {
    return <p className="text-sm text-muted">이 기간에 기록이 없어요</p>;
  }

  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      <p className="text-lg text-text">총 {formatFocusDuration(totalSeconds)}</p>
      <ul className="flex flex-col gap-[var(--space-1)]">
        {byTodo.map((bucket) => (
          <li key={bucket.key} className="flex items-center justify-between text-sm text-text">
            <span className="truncate">{labelOf(bucket, todoTitles)}</span>
            <span className="text-muted tabular-nums">{formatFocusDuration(bucket.seconds)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
