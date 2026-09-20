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
/** 입력을 지우기만 한 상태(review m14) — 범위 규칙 위반과 원인이 달라 문구도 다르다. */
const CUSTOM_RANGE_EMPTY_MESSAGE = '시작일과 종료일을 모두 입력해주세요';

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
      <div role="radiogroup" aria-label="통계 기간" className="flex flex-wrap gap-[var(--space-1)]">
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
        // 선택 = 파스텔/강조 채움 + 중립 잉크 링(theme.md R17, DateCell.tsx 와 같은 처방). 채움만
        // 쓰면 라이트 12 프리셋 전부 배경과 1.14~2.16:1 뿐이라 WCAG 1.4.11(3:1)에 못 미친다 — 3:1
        // 을 지는 건 `--color-selected-ring` 링이다. 강제 색 모드(Windows 고대비)는 UA 가
        // `box-shadow`(ring)를 통째로 지우므로 그때만 같은 굵기의 테두리로 갈아 단다(색은
        // 지정하지 않는다 — 시스템 색이 알아서 입는다).
        checked
          ? 'bg-accent text-on-accent ring-[length:var(--control-selected-ring)] ring-selected-ring ring-inset forced-colors:[border-width:var(--control-selected-ring)] forced-colors:[border-style:solid]'
          : 'bg-surface-2 text-text hover:opacity-90',
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="sr-only" />
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
  // review m14 — 366일 초과와는 다른 원인. `input[type=date]`는 비우면 런타임에 빈 문자열을 주지만
  // `DateKey`는 템플릿 리터럴 타입이라 빈 문자열과 겹치지 않는다(TS2367) — `string`으로 비교한다.
  const isEmpty = (draft.from as string) === '' || (draft.to as string) === '';
  const invalid = isEmpty || !isValidCustomRange(draft.from, draft.to);
  const message = isEmpty ? CUSTOM_RANGE_EMPTY_MESSAGE : CUSTOM_RANGE_INVALID_MESSAGE;
  const messageId = useId();

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
            aria-invalid={invalid}
            aria-describedby={invalid ? messageId : undefined}
            className="rounded-[var(--radius-sm)] border border-border bg-surface px-[var(--space-2)] py-[var(--space-1)] text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
        </label>
        <label className="flex items-center gap-[var(--space-1)] text-sm text-text">
          종료일
          <input
            type="date"
            value={draft.to}
            onChange={(e) => commit({ ...draft, to: e.target.value as DateKey })}
            aria-invalid={invalid}
            aria-describedby={invalid ? messageId : undefined}
            className="rounded-[var(--radius-sm)] border border-border bg-surface px-[var(--space-2)] py-[var(--space-1)] text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
        </label>
      </div>
      {invalid ? (
        <p id={messageId} role="alert" className="text-xs text-danger">
          {message}
        </p>
      ) : null}
    </div>
  );
}
