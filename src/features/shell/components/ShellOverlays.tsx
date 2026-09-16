'use client';

// 셸이 띄우는 오버레이 넷 (app-shell.md R7·R14).
//
// - ☰ 드로어(좁은 화면의 사이드바)
// - `◯ 60%` 인사이트 오버레이
// - 카테고리 만들기(빈 상태 CTA 에서)
// - 카테고리 삭제 대화상자 — `useCategoryRemoval()` 제어기를 사이드바의 `onRemove` 와 **같은 것**으로
//   받는다. 이 배선이 없으면 카테고리 메뉴에 "삭제" 항목 자체가 생기지 않는다(T-12b 핸드오프).
import type { Category } from '@/domain/category/category';
import type { CategoryId } from '@/domain/ids';

import {
  CategoryFormDialog,
  CategoryRemoveDialog,
  type CategoryRemovalController,
} from '@/features/category';
import { INSIGHT_OVERLAY_ID } from '@/features/shell/components/ShellHeader';
import { ShellInsights } from '@/features/shell/components/ShellInsights';
import { ShellSidebar } from '@/features/shell/components/ShellSidebar';
import { APP_NAME } from '@/features/shell/lib/title';

import { Dialog } from '@/components/ui/Dialog';

type ShellOverlaysProps = {
  categories: readonly Category[];
  drawerOpen: boolean;
  onDrawerClose: () => void;
  insightOverlayOpen: boolean;
  onInsightOverlayClose: () => void;
  categoryFormOpen: boolean;
  onCategoryFormClose: () => void;
  removal: CategoryRemovalController;
  onSelectCategory: (id: CategoryId) => void;
};

export function ShellOverlays({
  categories,
  drawerOpen,
  onDrawerClose,
  insightOverlayOpen,
  onInsightOverlayClose,
  categoryFormOpen,
  onCategoryFormClose,
  removal,
  onSelectCategory,
}: ShellOverlaysProps) {
  return (
    <>
      {/* 드로어는 `Dialog` 위에 짓는다 — Esc·바깥 클릭·✕·포커스 트랩·포커스 복귀가 전부 거기 있다(R7). */}
      <Dialog
        open={drawerOpen}
        onClose={onDrawerClose}
        title={APP_NAME}
        closeLabel="카테고리 닫기"
        className="mr-auto h-full max-w-[300px] self-stretch"
      >
        <ShellSidebar
          showTitle={false}
          onSelectCategory={(id) => {
            onDrawerClose();
            onSelectCategory(id);
          }}
          onRemoveCategory={removal.requestRemove}
        />
      </Dialog>

      <Dialog
        open={insightOverlayOpen}
        onClose={onInsightOverlayClose}
        title="오늘 요약"
        closeLabel="오늘 요약 닫기"
        className="ml-auto h-full max-w-[340px] self-stretch"
      >
        <aside id={INSIGHT_OVERLAY_ID} aria-label="오늘 요약" className="h-full">
          <ShellInsights categories={categories} />
        </aside>
      </Dialog>

      {categoryFormOpen ? (
        <CategoryFormDialog open mode={{ kind: 'create' }} onClose={onCategoryFormClose} />
      ) : null}

      <CategoryRemoveDialog controller={removal} />
    </>
  );
}
