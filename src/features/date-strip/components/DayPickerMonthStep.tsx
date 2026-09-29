'use client';

import type { DateKey } from '@/domain/date/date-key';

import { Chevron } from '@/features/date-strip/components/Chevron';

import { IconButton } from '@/components/ui/IconButton';

import { cn } from '@/lib/cn';

type DayPickerMonthStepProps = {
  direction: -1 | 1;
  /** 이동할 달의 날짜. 범위(R6) 끝이면 `undefined` — 버튼은 비활성 표시만 하고 포커스는 유지한다. */
  target: DateKey | undefined;
  onStep: (date: DateKey) => void;
};

/**
 * 일 피커 머리의 `‹ 이전 달` / `다음 달 ›` (calendar-layout.md §3-A R16-a). 범위 끝에서는 네이티브
 * `disabled` 대신 `aria-disabled` + no-op — 방금 누른 버튼이 접근 트리에서 사라져 포커스가 body 로
 * 떨어지는 것을 막는다(YearMonthPicker 의 년 스테퍼와 같은 결정). 포커스는 옮기지 않는다 — 연타할
 * 수 있어야 한다.
 */
export function DayPickerMonthStep({ direction, target, onStep }: DayPickerMonthStepProps) {
  const disabled = target === undefined;
  return (
    <IconButton
      label={direction === -1 ? '이전 달' : '다음 달'}
      aria-disabled={disabled}
      className={cn(disabled && 'pointer-events-none cursor-not-allowed opacity-50')}
      onClick={() => target !== undefined && onStep(target)}
    >
      <Chevron direction={direction === -1 ? 'left' : 'right'} />
    </IconButton>
  );
}
