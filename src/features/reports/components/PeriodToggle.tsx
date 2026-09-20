'use client';

import { useId, useState } from 'react';

import type { DateKey } from '@/domain/date/date-key';

import { isValidCustomRange, type PeriodPreset } from '@/features/reports/lib/period';
import { useReportsStore } from '@/features/reports/store/reports-store';

import { cn } from '@/lib/cn';

const PRESET_OPTIONS: readonly { value: Exclude<PeriodPreset, 'custom'>; label: string }[] = [
  { value: 'last7', label: '지난 7일' },
  { value: 'last30', label: '지난 30일' },
  { value: 'thisYear', label: '올해' },
];

const CUSTOM_RANGE_INVALID_MESSAGE = '시작일이 종료일보다 늦거나 366일을 넘을 수 없어요';

type PeriodToggleProps = {
  /** "기간 지정"을 처음 고를 때 기본으로 채울 날짜(R1). 스토어를 읽지 않고 화면이 준다. */
  today: DateKey;
};

/** 탭형 기간 토글(R1). `radiogroup` 이라 방향키만으로 프리셋 사이를 옮겨 다닐 수 있다(§5). */
export function PeriodToggle({ today }: PeriodToggleProps) {
  const preset = useReportsStore((state) => state.preset);
  const customRange = useReportsStore((state) => state.customRange);
  const setPreset = useReportsStore((state) => state.setPreset);
  const setCustomRange = useReportsStore((state) => state.setCustomRange);
  const groupId = useId();

  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      <div
        role="radiogroup"
        aria-label="통계 기간"
        className="flex flex-wrap gap-[var(--space-1)]"
      >
        {PRESET_OPTIONS.map((option) => (
          <PeriodOption
            key={option.value}
            name={groupId}
            label={option.label}
            checked={preset === option.value}
            onSelect={() => setPreset(option.value)}
          />
        ))}
        <PeriodOption
          name={groupId}
          label="기간 지정"
          checked={preset === 'custom'}
          onSelect={() => setCustomRange(customRange?.from ?? today, customRange?.to ?? today)}
        />
      </div>
      {preset === 'custom' ? (
        <CustomRangeInputs
          from={customRange?.from ?? today}
          to={customRange?.to ?? today}
          onChange={setCustomRange}
        />
      ) : null}
    </div>
  );
}

type PeriodOptionProps = {
  name: string;
  label: string;
  checked: boolean;
  onSelect: () => void;
};

/** 탭처럼 보이는 라디오 한 칸. 시각은 `label`, 의미는 감춘 `input[type=radio]` 가 낸다. */
function PeriodOption({ name, label, checked, onSelect }: PeriodOptionProps) {
  return (
    <label
      className={cn(
        'cursor-pointer rounded-[var(--radius-full)] px-[var(--space-3)] py-[var(--space-1)] text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
        checked ? 'bg-accent text-on-accent' : 'bg-surface-2 text-text hover:opacity-90',
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      {label}
    </label>
  );
}

type CustomRangeInputsProps = {
  from: DateKey;
  to: DateKey;
  onChange: (from: DateKey, to: DateKey) => void;
};

/** 기간 지정의 날짜 입력 둘(R1, 최대 366일). 무효한 조합은 저장하지 않고 이유를 알린다. */
function CustomRangeInputs({ from, to, onChange }: CustomRangeInputsProps) {
  const [draft, setDraft] = useState({ from, to });
  const invalid = !isValidCustomRange(draft.from, draft.to);

  const commit = (next: { from: DateKey; to: DateKey }) => {
    setDraft(next);
    if (isValidCustomRange(next.from, next.to)) onChange(next.from, next.to);
  };

  return (
    <div className="flex flex-col gap-[var(--space-1)]">
      <div className="flex items-center gap-[var(--space-2)]">
        <label className="flex items-center gap-[var(--space-1)] text-sm text-text">
          시작일
          <input
            type="date"
            value={draft.from}
            onChange={(e) => commit({ ...draft, from: e.target.value as DateKey })}
            className="rounded-[var(--radius-sm)] border border-border bg-surface px-[var(--space-2)] py-[var(--space-1)] text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
        </label>
        <label className="flex items-center gap-[var(--space-1)] text-sm text-text">
          종료일
          <input
            type="date"
            value={draft.to}
            onChange={(e) => commit({ ...draft, to: e.target.value as DateKey })}
            className="rounded-[var(--radius-sm)] border border-border bg-surface px-[var(--space-2)] py-[var(--space-1)] text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
        </label>
      </div>
      {invalid ? (
        <p role="alert" className="text-xs text-danger">
          {CUSTOM_RANGE_INVALID_MESSAGE}
        </p>
      ) : null}
    </div>
  );
}
