'use client';

import type { Category } from '@/domain/category/category';
import type { Todo } from '@/domain/todo/todo';
import { TODO_MEMO_MAX_LENGTH, TODO_TITLE_MAX_LENGTH } from '@/domain/todo/todo.rules';

import { MAX_DATE_KEY, MIN_DATE_KEY } from '@/features/date-strip';
import { useRoutineForm } from '@/features/todo/hooks/useRoutineForm';
import { useTodoActions } from '@/features/todo/hooks/useTodoActions';
import { TODO_MESSAGES as M } from '@/features/todo/messages';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { pushToast } from '@/components/ui/Toast';

const FIELD_CLASS =
  'w-full rounded-[var(--radius-md)] border border-border bg-surface px-[var(--space-3)] text-base text-text placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

type RoutineDialogProps = {
  todo: Todo;
  /** 카테고리 선택지 — 활성 카테고리만 (R12 와 같은 이유). */
  categories: readonly Category[];
  onClose: () => void;
  /** 연 요소가 사라졌을 때의 대체 포커스 대상 (app-shell R14). */
  returnFocus?: () => HTMLElement | null;
};

/**
 * 루틴 등록 다이얼로그 (todo R21). 시작일·종료일과 반복 패턴(매주 n요일 / 매달 n일)을 받아
 * 그 범위 안의 날짜마다 같은 카테고리·제목·메모의 투두를 만든다. "루틴" 자체는 저장하지 않는다 —
 * 만들어진 각 투두는 그 뒤로 독립된 투두라 하나씩 편집·삭제할 수 있다.
 *
 * 성공 알림은 `sr-only` 낭독이 아니라 **토스트**로 띄운다(R10·R20과 같은 언어) — 만들어진 날짜가
 * 지금 보는 날짜 밖이면(매달 반복 등) 화면이 전혀 바뀌지 않으므로, 눈에 보이는 확인이 없으면
 * 등록됐는지 알 방법이 없다. 최대 366개까지 한 번에 만들 수 있어 되돌리기도 함께 준다.
 */
export function RoutineDialog({ todo, categories, onClose, returnFocus }: RoutineDialogProps) {
  const form = useRoutineForm(todo);
  const { removeTodo } = useTodoActions();

  const undoAll = async (ids: readonly string[]): Promise<void> => {
    for (const id of ids) {
      await removeTodo(id);
    }
  };

  const save = async (): Promise<void> => {
    const result = await form.submit();
    if (result === null) {
      // 검증 실패는 위 인라인 alert 가 알린다. 저장(store) 실패는 전역 토스트가 알린다
      // (useRoutineForm 머리 주석) — 여기서 다시 알리지 않는다.
      return;
    }
    const { count, ids } = result;
    pushToast({
      message: M.routineCreated(count),
      action: ids.length === 0 ? undefined : { label: M.undo, onAction: () => void undoAll(ids) },
    });
    onClose();
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
            시작일
            <input
              type="date"
              value={form.startDate}
              min={MIN_DATE_KEY}
              max={MAX_DATE_KEY}
              onChange={(e) => form.setStartDate(e.target.value)}
              className={`${FIELD_CLASS} h-[var(--control-height)]`}
            />
          </label>
          <label className="flex flex-col gap-[var(--space-1)] text-sm text-muted">
            종료일
            <input
              type="date"
              value={form.endDate}
              min={form.startDate}
              max={MAX_DATE_KEY}
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
            <option value="weekly">매주</option>
            <option value="monthly">매달</option>
          </select>
        </label>

        {form.recurrenceType === 'weekly' ? (
          <div className="flex flex-col gap-[var(--space-2)]">
            <span className="text-sm text-muted">반복 요일</span>
            <div role="group" aria-label="반복 요일" className="flex gap-[var(--space-1)]">
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
            반복 일(1~31, 쉼표로 구분)
            <input
              type="text"
              inputMode="numeric"
              value={form.monthDaysText}
              placeholder="예: 1, 15"
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
