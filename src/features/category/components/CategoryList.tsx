'use client';

import { useEffect, useRef, useState } from 'react';

import type { Category } from '@/domain/category/category';
import type { CategoryId } from '@/domain/ids';

import { CategoryClosedSection } from '@/features/category/components/CategoryClosedSection';
import { CategoryFormDialog } from '@/features/category/components/CategoryFormDialog';
import { CategoryListItem } from '@/features/category/components/CategoryListItem';
import {
  useActiveCategories,
  useCategoryLoadState,
  useClosedCategories,
} from '@/features/category/hooks/useCategories';
import { useCategoryActions } from '@/features/category/hooks/useCategoryActions';
import type { CategoryFormMode } from '@/features/category/hooks/useCategoryForm';

import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

type CategoryListProps = {
  /** 행을 눌렀을 때. 본문 그룹으로 스크롤·하이라이트(§2-A)는 셸(T-20)이 넘긴다. */
  onSelect?: (id: CategoryId) => void;
  /**
   * `⋯ → 삭제` 를 눌렀을 때 (category R10~R16 = T-12b). 주지 않으면 메뉴에 삭제 항목이 없다 —
   * 대화상자가 아직 없는 동안 "눌러도 아무 일 없는 삭제" 를 보여 주지 않는다.
   */
  onRemove?: (category: Category) => void;
};

/** 다이얼로그를 열 때마다 새 `key` 를 준다 — 폼이 새로 마운트돼 초기값이 다시 잡힌다(useEffect 동기화 금지). */
type FormRequest = { mode: CategoryFormMode; key: number };

/**
 * 사이드바 카테고리 목록 (category §2-A·§2-D, R5·R8·R9·R19·R20).
 *
 * 적재는 이 컴포넌트가 시작한다 — 카테고리를 화면에 처음 올리는 곳이 여기고, `status === 'idle'`
 * 일 때 한 번만 부른다. (상태 동기화 effect 가 아니라 **데이터 적재** 다. 셸이 먼저 부르면
 * 상태가 이미 `loading`/`ready` 라 여기서는 아무 일도 하지 않는다.)
 */
export function CategoryList({ onSelect, onRemove }: CategoryListProps) {
  const active = useActiveCategories();
  const closed = useClosedCategories();
  const { status, error } = useCategoryLoadState();
  const { load } = useCategoryActions();
  const addRef = useRef<HTMLButtonElement>(null);
  const [form, setForm] = useState<FormRequest | null>(null);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (status === 'idle') {
      void load();
    }
  }, [status, load]);

  const openCreate = (): void => {
    setForm((previous) => ({ mode: { kind: 'create' }, key: (previous?.key ?? 0) + 1 }));
  };
  const openEdit = (category: Category): void => {
    setForm((previous) => ({ mode: { kind: 'edit', category }, key: (previous?.key ?? 0) + 1 }));
  };

  const empty = status === 'ready' && active.length === 0 && closed.length === 0;

  return (
    <section aria-labelledby="category-list-heading" className="flex flex-col">
      <h2 id="category-list-heading" className="px-[var(--space-2)] text-sm text-muted">
        카테고리
      </h2>

      {status === 'loading' ? (
        <div aria-busy="true" className="mt-[var(--space-2)] flex flex-col gap-[var(--space-2)]">
          <Skeleton className="h-[var(--control-height)]" />
          <Skeleton className="h-[var(--control-height)]" />
          <Skeleton className="h-[var(--control-height)]" />
        </div>
      ) : (
        <ul className="mt-[var(--space-1)] flex flex-col gap-[var(--space-1)]">
          {active.map((category) => (
            <CategoryListItem
              key={category.id}
              category={category}
              onSelect={onSelect}
              onEdit={openEdit}
              onRemove={onRemove}
              onAnnounce={setAnnouncement}
            />
          ))}
        </ul>
      )}

      {empty ? (
        <div className="flex flex-col items-start gap-[var(--space-2)] px-[var(--space-2)] py-[var(--space-3)]">
          <p className="text-base text-muted">아직 카테고리가 없어요</p>
          <Button ref={addRef} size="sm" onClick={openCreate}>
            첫 카테고리 만들기
          </Button>
        </div>
      ) : (
        <Button
          ref={addRef}
          variant="ghost"
          size="sm"
          onClick={openCreate}
          className="mt-[var(--space-1)] justify-start"
        >
          + 카테고리 추가
        </Button>
      )}

      <CategoryClosedSection
        categories={closed}
        onSelect={onSelect}
        onEdit={openEdit}
        onRemove={onRemove}
        onAnnounce={setAnnouncement}
      />

      {error === null ? null : (
        <p
          role="alert"
          // 위험 색 글자는 본문 대비 4.5:1 에 못 미치므로 --color-text 를 섞는다(theme.md R9·R2 방식).
          style={{ color: 'color-mix(in srgb, var(--color-danger) 70%, var(--color-text))' }}
          className="mt-[var(--space-2)] flex items-center gap-[var(--space-2)] px-[var(--space-2)] text-sm"
        >
          {error}
          <Button variant="outline" size="sm" onClick={() => void load()}>
            다시 시도
          </Button>
        </p>
      )}

      {/* 순서 변경 결과 낭독 (R5 드래그 대안). 화면에는 보이지 않는다. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {form === null ? null : (
        <CategoryFormDialog
          key={form.key}
          open
          mode={form.mode}
          onClose={() => setForm(null)}
          returnFocus={() => addRef.current}
        />
      )}
    </section>
  );
}
