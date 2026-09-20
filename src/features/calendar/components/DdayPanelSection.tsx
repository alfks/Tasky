'use client';

// 인사이트 패널의 "D-day" 섹션 (calendar.md §2·§3·§5). 패널 안 섹션 순서(집중 → 달성률 → 카테고리별 →
// D-day → 단축키)는 앱 셸이 정한다(app-shell R6, ShellInsights.tsx) — 여기서는 이 섹션 하나만 그린다.
//
// 항목 클릭 시 날짜 이동은 **date-strip 이 이미 가진 선택 메커니즘을 그대로 부른다**(calendar R6) —
// `useDateStripStore` 의 `select` 액션. 새 이동 로직을 만들지 않는다.
import { useEffect, useId, useState } from 'react';

import type { DateKey } from '@/domain/date/date-key';
import type { Dday } from '@/domain/dday/dday';
import { ddayOffset, formatDday, sortDdays } from '@/domain/dday/dday.rules';

import { DdayAddForm } from '@/features/calendar/components/DdayAddForm';
import { useDdayStore } from '@/features/calendar/store/dday-store';
import { useDateStripStore } from '@/features/date-strip';

import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { pushToast } from '@/components/ui/Toast';

import { cn } from '@/lib/cn';

type DdayPanelSectionProps = { className?: string };

/** "생일까지 12일" / "생일, 오늘" / "생일, 지나고 3일" — 행의 접근 이름 (calendar §5). */
function rowAnnouncement(title: string, offset: number): string {
  if (offset === 0) return `${title}, 오늘`;
  return offset > 0 ? `${title}까지 ${offset}일` : `${title}, 지나고 ${-offset}일`;
}

type DdayRowProps = {
  dday: Dday;
  today: DateKey;
  onSelect: (date: DateKey) => void;
  onRemove: (dday: Dday) => void;
};

/** 한 D-day 행. `✕` 는 hover·포커스 시 보인다(포커스 시엔 항상 — calendar §5). */
function DdayRow({ dday, today, onSelect, onRemove }: DdayRowProps) {
  const offset = ddayOffset(dday.date, today);

  return (
    <li className="group/row flex items-center gap-[var(--space-1)]">
      <button
        type="button"
        onClick={() => onSelect(dday.date)}
        aria-label={rowAnnouncement(dday.title, offset)}
        className="flex h-[var(--control-height)] min-w-0 flex-1 items-center justify-between gap-[var(--space-2)] rounded-[var(--radius-md)] px-[var(--space-2)] text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <span aria-hidden="true" className="min-w-0 flex-1 truncate text-base text-text">
          {dday.title}
        </span>
        <span aria-hidden="true" className="shrink-0 text-sm font-semibold text-muted tabular-nums">
          {formatDday(offset)}
        </span>
      </button>
      <IconButton
        label={`${dday.title} 삭제`}
        onClick={() => onRemove(dday)}
        className="opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 focus-visible:opacity-100"
      >
        ✕
      </IconButton>
    </li>
  );
}

/** 인사이트 패널의 D-day 카드. */
export function DdayPanelSection({ className }: DdayPanelSectionProps) {
  const headingId = useId();
  const ddays = useDdayStore((s) => s.ddays);
  const error = useDdayStore((s) => s.error);
  const load = useDdayStore((s) => s.load);
  const add = useDdayStore((s) => s.add);
  const remove = useDdayStore((s) => s.remove);
  const undoRemove = useDdayStore((s) => s.undoRemove);
  const clearPendingRemoval = useDdayStore((s) => s.clearPendingRemoval);
  const clearError = useDdayStore((s) => s.clearError);
  const today = useDateStripStore((s) => s.today);
  const select = useDateStripStore((s) => s.select);

  const [adding, setAdding] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);

  useEffect(() => {
    void load();
    // 마운트 시 한 번만 — date-strip 의 날짜별 재조회와 달리 D-day 는 전량 조회 하나뿐이다(calendar §4).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { upcoming, past } = sortDdays(ddays, today);

  const handleRemove = (dday: Dday): void => {
    void remove(dday.id).then((ok) => {
      if (!ok) return;
      pushToast({
        message: `${dday.title} 삭제했어요`,
        action: { label: '되돌리기', onAction: () => void undoRemove() },
        onDismiss: clearPendingRemoval,
      });
    });
  };

  const handleAdd = (input: { title: string; date: string }): Promise<boolean> => {
    clearError();
    return add(input);
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn('flex flex-col gap-[var(--space-3)]', className)}
    >
      <h2 id={headingId} className="text-md font-semibold text-text">
        D-day
      </h2>

      {upcoming.length === 0 && !adding ? (
        <p className="text-sm text-muted">다가오는 날을 기록해 보세요</p>
      ) : (
        <ul className="flex flex-col gap-[var(--space-1)]">
          {upcoming.map((dday) => (
            <DdayRow
              key={dday.id}
              dday={dday}
              today={today}
              onSelect={select}
              onRemove={handleRemove}
            />
          ))}
        </ul>
      )}

      {adding ? (
        <DdayAddForm onSubmit={handleAdd} onCancel={() => setAdding(false)} error={error} />
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setAdding(true)} className="self-start">
          + D-day 추가
        </Button>
      )}

      {past.length > 0 && (
        <div className="flex flex-col gap-[var(--space-1)]">
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={pastOpen}
            onClick={() => setPastOpen((open) => !open)}
            className="self-start"
          >
            {pastOpen ? '▾' : '▸'} 지난 날 ({past.length})
          </Button>
          {pastOpen && (
            <ul className="flex flex-col gap-[var(--space-1)]">
              {past.map((dday) => (
                <DdayRow
                  key={dday.id}
                  dday={dday}
                  today={today}
                  onSelect={select}
                  onRemove={handleRemove}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
