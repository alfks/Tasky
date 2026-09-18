'use client';

import type { Category } from '@/domain/category/category';
import type { Todo } from '@/domain/todo/todo';
import { TODO_MEMO_MAX_LENGTH, TODO_TITLE_MAX_LENGTH } from '@/domain/todo/todo.rules';

import { useRoutineForm } from '@/features/todo/hooks/useRoutineForm';
import { TODO_MESSAGES as M } from '@/features/todo/messages';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

const FIELD_CLASS =
  'w-full rounded-[var(--radius-md)] border border-border bg-surface px-[var(--space-3)] text-base text-text placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

type RoutineDialogProps = {
  todo: Todo;
  /** 카테고리 선택지 — 활성 카테고리만 (R12 와 같은 이유). */
  categories: readonly Category[];
  onClose: () => void;
  /** 등록 결과를 알린다(§5 aria-live). */
  onAnnounce: (message: string) => void;
  /** 연 요소가 사라졌을 때의 대체 포커스 대상 (app-shell R14). */
  returnFocus?: () => HTMLElement | null;
};

/**
 * 루틴 등록 다이얼로그 (todo R21). 시작일·종료일과 반복 패턴(매주 n요일 / 매달 n일)을 받아
 * 그 범위 안의 날짜마다 같은 카테고리·제목·메모의 투두를 만든다. "루틴" 자체는 저장하지 않는다 —
 * 만들어진 각 투두는 그 뒤로 독립된 투두라 하나씩 편집·삭제할 수 있다.
 */
export function RoutineDialog({
  todo,
  categories,
  onClose,
  onAnnounce,
  returnFocus,
}: RoutineDialogProps) {
  const form = useRoutineForm(todo);

  const save = async (): Promise<void> => {
    const count = await form.submit();
    if (count > 0) {
      onAnnounce(M.routineCreated(count));
      onClose();
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={M.routineDialogTitle}
      returnFocus={returnFocus}
      className="max-w-[440px]"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => void save()} loading={form.saving}>
            {M.routineSubmit}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-[var(--space-4)]">
        <label className="flex flex-col gap-[var(--space-1)] text-sm text-muted">
          제목
          <input
            type="text"
            value={form.title}
            maxLength={TODO_TITLE_MAX_LENGTH}
            onChange={(e) => form.setTitle(e.target.value)}
            className={`${FIELD_CLASS} h-[var(--control-height)]`}
          />
        </label>

        <label className="flex flex-col gap-[var(--space-1)] text-sm text-muted">
          메모
          <textarea
            value={form.memo}
            rows={2}
            maxLength={TODO_MEMO_MAX_LENGTH}
            onChange={(e) => form.setMemo(e.target.value)}
            className={`${FIELD_CLASS} resize-y py-[var(--space-2)] leading-normal`}
          />
        </label>

        <label className="flex flex-col gap-[var(--space-1)] text-sm text-muted">
          카테고리
          <select
            value={form.categoryId}
            onChange={(e) => form.setCategoryId(e.target.value)}
            className={`${FIELD_CLASS} h-[var(--control-height)]`}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {`${category.emoji ?? ''} ${category.name}`.trim()}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-[var(--space-3)]">
          <label className="flex flex-col gap-[var(--space-1)] text-sm text-muted">
            {M.routineStartDate}
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => form.setStartDate(e.target.value)}
              className={`${FIELD_CLASS} h-[var(--control-height)]`}
            />
          </label>
          <label className="flex flex-col gap-[var(--space-1)] text-sm text-muted">
            {M.routineEndDate}
            <input
              type="date"
              value={form.endDate}
              min={form.startDate}
              onChange={(e) => form.setEndDate(e.target.value)}
              className={`${FIELD_CLASS} h-[var(--control-height)]`}
            />
          </label>
        </div>

        <label className="flex flex-col gap-[var(--space-1)] text-sm text-muted">
          반복 주기
          <select
            value={form.recurrenceType}
            onChange={(e) => form.setRecurrenceType(e.target.value as typeof form.recurrenceType)}
            className={`${FIELD_CLASS} h-[var(--control-height)]`}
          >
            <option value="weekly">{M.routineWeekly}</option>
            <option value="monthly">{M.routineMonthly}</option>
          </select>
        </label>

        {form.recurrenceType === 'weekly' ? (
          <div className="flex flex-col gap-[var(--space-2)]">
            <span className="text-sm text-muted">{M.routineWeekdaysLabel}</span>
            <div
              role="group"
              aria-label={M.routineWeekdaysLabel}
              className="flex gap-[var(--space-1)]"
            >
              {WEEKDAY_LABELS.map((label, day) => {
                const pressed = form.weekdays.includes(day);
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => form.toggleWeekday(day)}
                    className={`flex size-[var(--control-hit-min)] items-center justify-center rounded-[var(--radius-md)] border text-sm transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                      pressed
                        ? 'border-accent bg-accent text-on-accent'
                        : 'border-border bg-surface text-text hover:bg-surface-2'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <label className="flex flex-col gap-[var(--space-1)] text-sm text-muted">
            {M.routineMonthDaysLabel}
            <input
              type="text"
              inputMode="numeric"
              value={form.monthDaysText}
              placeholder={M.routineMonthDaysPlaceholder}
              onChange={(e) => form.setMonthDaysText(e.target.value)}
              className={`${FIELD_CLASS} h-[var(--control-height)]`}
            />
          </label>
        )}

        {form.error === null ? null : (
          <p
            role="alert"
            style={{ color: 'color-mix(in srgb, var(--color-danger) 70%, var(--color-text))' }}
            className="text-sm"
          >
            {form.error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
