'use client';

// 인사이트 패널의 "D-day" 섹션 (calendar.md §2·§3·§5). 패널 안 섹션 순서(집중 → 달성률 → 카테고리별 →
// D-day → 단축키)는 앱 셸이 정한다(app-shell R6, ShellInsights.tsx) — 여기서는 이 섹션 하나만 그린다.
//
// 항목 클릭 시 날짜 이동은 **date-strip 이 이미 가진 선택 메커니즘을 그대로 부른다**(calendar R6) —
// `useDateStripStore` 의 `select` 액션. 새 이동 로직을 만들지 않는다.
import { useEffect, useId, useRef, useState } from 'react';

import type { DateKey } from '@/domain/date/date-key';
import type { Dday } from '@/domain/dday/dday';
import { ddayOffset, formatDday, sortDdays } from '@/domain/dday/dday.rules';

import { DdayAddForm } from '@/features/calendar/components/DdayAddForm';
import {
  focusAfterRowRemoval,
  rowAnchorOf,
  type RowAnchor,
} from '@/features/calendar/lib/removal-focus';
import { useDdayStore } from '@/features/calendar/store/dday-store';
// 삭제 되돌리기 문구는 카테고리 삭제와 같은 조사 규칙을 쓴다(category §2-C) — 직접 이어붙이면
// 받침 유무에 따라 "'생일'를 삭제했어요" 같은 문장이 남는다(리뷰 라운드 1 Minor-8). `category` 는
// `calendar` 를 조립하지 않으므로 배럴 경유 import 가 순환을 만들지 않는다(위 `removal-focus.ts`
// 머리주석과 달리 이 하나는 실제로 배럴을 연다).
import { removalToastMessage } from '@/features/category';
import { useDateStripStore } from '@/features/date-strip';

import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { OVERLAY_ALWAYS_LIVE_ATTR } from '@/components/ui/overlay-rules';
import { pushToast, useToasts } from '@/components/ui/Toast';

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

/**
 * 오늘이 D-day 인 항목만 강조 — 그 밖엔 `formatDday` 와 같은 자리를 쓰는 다른 행과 동일하다(`text-muted`).
 *
 * **라운드 2 Major 회귀 수정.** 처음엔 `text-accent`(강조색 글자)를 썼는데 `--color-accent` on
 * `--color-surface` 가 **라이트 1.85:1** 로 WCAG AA 본문 기준(4.5:1)에 크게 못 미쳤다(다크는 7.09:1
 * 로 통과 — 라이트에서만 깨졌다). `theme.md` R9 는 3.59:1 인 `--color-danger` 조차 글자색 금지고
 * "카테고리 색(=accent 프리셋)은 배경·점·막대에만, 글자색으로 쓰지 않는다" 를 명시한다 — 정확히
 * 이 규칙을 어긴 것이었다.
 *
 * → **알약(배경+on-accent 글자)으로 바꾼다** — `TodoItem.tsx` 의 포커스 칩(`rounded-full bg-surface-2
 * px-space-2`)과 같은 모양, 색만 강조색이다. `date-strip` 의 선택된 날짜 셀도 같은 `bg-accent
 * text-on-accent` 조합을 이미 쓰고 있어(`DateCell.tsx`) "이 날이 특별하다" 는 시각 언어가 이미
 * 있었다 — 새 언어를 만들지 않는다. 실측 대비(WCAG 공식, `#767676`/흰 배경 = 4.54:1 로 계산식 검증
 * 완료): **라이트 8.87:1, 다크 6.84:1** — 이웃 행의 `text-muted`(라이트 4.96:1, 다크 6.54:1)보다도
 * 둘 다 높다. 새 토큰은 쓰지 않는다(`--color-accent`·`--color-on-accent`, theme.md R1).
 */
function offsetClassName(offset: number): string {
  return cn(
    'shrink-0 rounded-[var(--radius-full)] text-sm font-semibold tabular-nums',
    offset === 0 ? 'bg-accent px-[var(--space-2)] text-on-accent' : 'text-muted',
  );
}

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
        <span aria-hidden="true" className={offsetClassName(offset)}>
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
  const status = useDdayStore((s) => s.status);
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
  // R14·R8(리뷰 라운드 1 Major-1): ✕ 삭제 직전 행 자리표를 뜨고, 행이 사라진 뒤 되돌리기 토스트로
  // 포커스를 옮긴다. R14 순서(`rowAnchorOf`·`focusAfterRowRemoval`)는 카테고리 삭제가 쓰는 것과
  // 몸통이 같다 — **다만 `region`(목록이 통째로 사라졌을 때의 `<nav>` 폴백) 은 없다**, 정확히 무엇이
  // 왜 빠졌는지는 이식 사유와 함께 `@/features/calendar/lib/removal-focus.ts` 머리주석에 적혀 있다.
  const removalAnchor = useRef<RowAnchor | null>(null);
  // 되돌리기 토스트가 **실제로 DOM 에 뜬 뒤에만** 그 버튼으로 넘긴다 — `CategoryRemoveDialog.tsx`
  // 의 `useRemovalToastBridge` 와 같은 이유다: `pushToast` 는 별도 전역 토스트 스토어를 건드리므로
  // 그 커밋은 행 삭제 커밋과 **같은 틱에 묶이지 않는다**(실측: 묶인다고 가정하고 곧바로 토스트
  // 버튼을 찾으면 아직 없는 버튼을 찾다 실패하고, 그사이 행이 실제로 사라지며 포커스가 `<body>`
  // 로 떨어진다). 그래서 R14 순서로 **먼저** 보내 body 착지를 막고(`handoffFrom` 에 그 자리를
  // 적어 둔다), 토스트 목록이 실제로 그 토스트를 담은 다음 렌더에서(아래 effect, `useToasts()`
  // 의존성 — 패시브 이펙트라 그 커밋 뒤에만 돈다) 아직 아무도 포커스를 옮기지 않았을 때만
  // (`document.activeElement` 가 그 발판이거나 `<body>` 일 때만) `[되돌리기]` 로 다시 옮긴다.
  const toasts = useToasts();
  const pendingUndoToastId = useRef<string | null>(null);
  const handoffFrom = useRef<HTMLElement | null>(null);
  // "+ D-day 추가" 를 여는 버튼. 폼을 Esc·저장 어느 쪽으로 닫아도 여기로 돌아온다(리뷰 라운드 1
  // Major-2) — `TodoAddRow.tsx` 의 `openerRef`+`returning` 패턴과 같다. 다만 그 컴포넌트는 열림 상태에
  // 따라 버튼 자신과 폼을 **한 파일**이 갈아 끼우는 데 반해, 여기는 `DdayPanelSection` 이 그 갈아
  // 끼우기를 하므로(§136 부근 삼항) 같은 ref·플래그를 여기서 든다.
  const addOpenerRef = useRef<HTMLButtonElement>(null);
  const returningToAdder = useRef(false);

  useEffect(() => {
    void load();
    // 마운트 시 한 번만 — date-strip 의 날짜별 재조회와 달리 D-day 는 전량 조회 하나뿐이다(calendar §4).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (adding) return;
    // 닫는 순간에는 "+ D-day 추가" 가 아직 렌더되지 않았다 — TodoAddRow.tsx 의 같은 주석과 같은 이유로
    // 다시 그려진 뒤(`adding` 이 false 로 커밋된 뒤)에 옮긴다.
    if (returningToAdder.current) {
      returningToAdder.current = false;
      addOpenerRef.current?.focus();
    }
  }, [adding]);

  useEffect(() => {
    const id = pendingUndoToastId.current;
    if (id === null) return;
    if (!toasts.some((toast) => toast.id === id)) return; // 아직 안 떴다(또는 이미 닫혔다).
    pendingUndoToastId.current = null;
    const from = handoffFrom.current;
    handoffFrom.current = null;
    const active = document.activeElement;
    // 그사이 사용자가 직접 다른 곳으로 포커스를 옮겼으면 손대지 않는다.
    if (from !== null && active !== from && active !== document.body) return;
    document.querySelector<HTMLButtonElement>(`[${OVERLAY_ALWAYS_LIVE_ATTR}] button`)?.focus();
  }, [toasts]);

  const { upcoming, past } = sortDdays(ddays, today);

  const closeAdd = (): void => {
    returningToAdder.current = true;
    setAdding(false);
  };

  const handleRemove = (dday: Dday): void => {
    removalAnchor.current = rowAnchorOf(document.activeElement);
    void remove(dday.id).then((ok) => {
      if (!ok) return;
      // 토스트가 뜨기 **전에** 먼저 R14 순서로 보낸다 — <body> 로 떨어지는 일이 없게 한다. 이미 뜬
      // 토스트(연달아 지울 때)가 있으면 그 버튼이 먼저다 — 없으면(보통은 없다, 아래 effect 가 채운다)
      // R14 순서로 떨어진다.
      const existingToastButton = document.querySelector<HTMLButtonElement>(
        `[${OVERLAY_ALWAYS_LIVE_ATTR}] button`,
      );
      const fallback = existingToastButton ?? focusAfterRowRemoval(removalAnchor.current);
      fallback?.focus();
      handoffFrom.current = fallback;
      pendingUndoToastId.current = pushToast({
        message: removalToastMessage(dday.title),
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

      {status === 'error' ? (
        <p role="alert" className="text-sm text-muted">
          {error}
        </p>
      ) : upcoming.length === 0 && !adding ? (
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
        <DdayAddForm onSubmit={handleAdd} onCancel={closeAdd} error={error} />
      ) : (
        <Button
          ref={addOpenerRef}
          variant="ghost"
          size="sm"
          onClick={() => setAdding(true)}
          className="self-start"
        >
          + D-day 추가
        </Button>
      )}

      {past.length > 0 && (
        <div className="flex flex-col gap-[var(--space-1)]">
          <h3>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={pastOpen}
              onClick={() => setPastOpen((open) => !open)}
              className="self-start"
            >
              <span aria-hidden="true">{pastOpen ? '▾' : '▸'}</span> 지난 날 ({past.length})
            </Button>
          </h3>
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
