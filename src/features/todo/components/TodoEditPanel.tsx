'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import type { Category } from '@/domain/category/category';
import type { DateKey } from '@/domain/date/date-key';
import type { CategoryId } from '@/domain/ids';
import type { Todo } from '@/domain/todo/todo';
import { TODO_MEMO_MAX_LENGTH, TODO_TITLE_MAX_LENGTH } from '@/domain/todo/todo.rules';

import { DayPickerPopover, useDateStripStore } from '@/features/date-strip';
import { useTodoActions } from '@/features/todo/hooks/useTodoActions';

import { Button } from '@/components/ui/Button';

import { fromDateKey } from '@/lib/date';
import { isImeKey } from '@/lib/ime';

const FIELD_CLASS =
  'w-full rounded-[var(--radius-md)] border border-border bg-surface px-[var(--space-3)] text-base text-text placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 날짜 필드 버튼의 글자 '9월 17일 (목)' (§2-A). 스트립의 표기(R11, 0 채움 없음)와 같은 결로 쓴다. */
function dateFieldLabel(date: DateKey): string {
  const at = fromDateKey(date);
  return `${at.getMonth() + 1}월 ${at.getDate()}일 (${DAY_NAMES[at.getDay()]})`;
}

type TodoEditPanelProps = {
  todo: Todo;
  /** 카테고리 선택지 — 활성 카테고리만 (R12). */
  categories: readonly Category[];
  /** 메뉴 "메모 추가" 로 열렸으면 메모로 바로 들어간다. */
  autoFocusField?: 'title' | 'memo';
  onClose: () => void;
  /** `[삭제]` — 확인 대화상자를 여는 쪽은 호출부다 (R13). */
  onDelete: () => void;
};

/**
 * 항목 자리에서 펼쳐지는 편집 패널 (todo.md §2-A·R14, 접근성 §5의 `role="group"`).
 *
 * 저장은 **한 번에 하나씩 순서대로** 한다: 제목·메모 → 카테고리 → 날짜. 앞이 실패하면 멈추고
 * 패널을 열어 둔다 — 세 쓰기를 한꺼번에 쏘면 스토어의 쓰기 큐에서 뒤엣것이 앞엣것의 결과를
 * 모르는 채 저장돼(핸드오프 T-13 risks) 실패한 편집이 성공한 날짜 이동에 묻힌다.
 */
export function TodoEditPanel({
  todo,
  categories,
  autoFocusField = 'title',
  onClose,
  onDelete,
}: TodoEditPanelProps) {
  const { editTodo, changeCategory, moveToDate } = useTodoActions();
  const dateLabelId = useId();
  const dateValueId = useId();
  const [title, setTitle] = useState(todo.title);
  const [memo, setMemo] = useState(todo.memo ?? '');
  const [categoryId, setCategoryId] = useState<CategoryId>(todo.categoryId);
  const [date, setDate] = useState<DateKey>(todo.date);
  const [saving, setSaving] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const memoRef = useRef<HTMLTextAreaElement>(null);
  const dateAnchorRef = useRef<HTMLButtonElement>(null);
  const today = useDateStripStore((state) => state.today);

  useEffect(() => {
    const field = autoFocusField === 'memo' ? memoRef.current : titleRef.current;
    field?.focus();
    field?.setSelectionRange(field.value.length, field.value.length);
  }, [autoFocusField]);

  const save = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    try {
      const textChanged = title !== todo.title || memo !== (todo.memo ?? '');
      if (textChanged && !(await editTodo(todo.id, { title, memo: memo === '' ? null : memo }))) {
        return;
      }
      if (categoryId !== todo.categoryId && !(await changeCategory(todo.id, categoryId))) {
        return;
      }
      if (date !== todo.date && !(await moveToDate(todo.id, date))) {
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLElement>): void => {
    if (isImeKey(e.nativeEvent)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Enter') return;
    // 메모는 줄바꿈이 본문이라 맨 Enter 로 저장하면 안 된다 (R2·R14). 핸들러가 컨테이너에 걸려 있어
    // `currentTarget` 은 언제나 그 컨테이너다 — 어느 필드에서 왔는지는 `target` 으로만 알 수 있다.
    if (e.target instanceof HTMLTextAreaElement && !(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    void save();
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Esc 취소·Enter 저장이 패널 어느 필드에서나 들어야 한다(R14). 필드마다 핸들러를 복제하면 어긋난다. 컨테이너는 스펙이 정한 role="group" 이고 실제 조작은 전부 안쪽 input/textarea/select/button 이 받는다.
    <div
      role="group"
      aria-label={`${todo.title} 편집`}
      onKeyDown={handleKeyDown}
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-lg)] bg-surface-2 p-[var(--space-3)]"
    >
      <label className="flex flex-col gap-[var(--space-1)] text-sm text-muted">
        제목
        <input
          ref={titleRef}
          type="text"
          value={title}
          maxLength={TODO_TITLE_MAX_LENGTH}
          onChange={(e) => setTitle(e.target.value)}
          className={`${FIELD_CLASS} h-[var(--control-height)]`}
        />
      </label>

      <label className="flex flex-col gap-[var(--space-1)] text-sm text-muted">
        메모
        <textarea
          ref={memoRef}
          value={memo}
          rows={3}
          maxLength={TODO_MEMO_MAX_LENGTH}
          onChange={(e) => setMemo(e.target.value)}
          className={`${FIELD_CLASS} resize-y py-[var(--space-2)] leading-normal`}
        />
      </label>

      <div className="flex flex-wrap gap-[var(--space-3)]">
        <label className="flex flex-col gap-[var(--space-1)] text-sm text-muted">
          카테고리
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={`${FIELD_CLASS} h-[var(--control-height)]`}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {`${category.emoji ?? ''} ${category.name}`.trim()}
              </option>
            ))}
          </select>
        </label>
        {/* 날짜는 네이티브 입력 대신 일 피커(R10-c, calendar-layout §3-A). 버튼 글자가 곧 값이고
            저장은 지금처럼 [저장] 에서만 — 피커에서 고르면 여기 상태만 바뀐다. */}
        <div className="flex flex-col gap-[var(--space-1)] text-sm text-muted">
          <span id={dateLabelId}>날짜</span>
          <Button
            ref={dateAnchorRef}
            variant="outline"
            aria-labelledby={`${dateLabelId} ${dateValueId}`}
            onClick={() => setPickingDate((open) => !open)}
            className="min-w-[160px] justify-between font-normal"
          >
            <span id={dateValueId}>{dateFieldLabel(date)}</span>
            <span aria-hidden="true">▾</span>
          </Button>
          {/* 항상 마운트하고 open 만 토글한다 — 닫혀 있을 때도 버튼에 aria-haspopup 이 붙어야 한다. */}
          <DayPickerPopover
            open={pickingDate}
            onClose={() => setPickingDate(false)}
            anchorRef={dateAnchorRef}
            value={date}
            today={today}
            onPick={(next) => {
              setDate(next);
              setPickingDate(false);
            }}
          />
        </div>
      </div>

      <div className="flex justify-end gap-[var(--space-2)]">
        <Button variant="danger" size="sm" onClick={onDelete}>
          삭제
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          취소
        </Button>
        <Button variant="primary" size="sm" loading={saving} onClick={() => void save()}>
          저장
        </Button>
      </div>
    </div>
  );
}
