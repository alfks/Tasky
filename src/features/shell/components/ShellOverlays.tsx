'use client';

// 셸이 띄우는 오버레이 넷 (app-shell.md R7·R14).
//
// - ☰ 드로어(좁은 화면의 사이드바)
// - `◯ 60%` 인사이트 오버레이
// - 카테고리 만들기(빈 상태 CTA 에서)
// - 카테고리 삭제 대화상자 — `useCategoryRemoval()` 제어기를 사이드바의 `onRemove` 와 **같은 것**으로
//   받는다. 이 배선이 없으면 카테고리 메뉴에 "삭제" 항목 자체가 생기지 않는다(T-12b 핸드오프).
// - 계정 동기화 오버레이(R7 업로드·계정 삭제 안내·계정 전환 안내) — **레이아웃과 무관하게 항상
//   마운트된다**(리뷰 Major 3). 드로어 안의 `ShellSidebar` 와 달리 `Dialog` 밖(이 컴포넌트의
//   최상위 프래그먼트)에 있다 — 그래야 드로어를 한 번도 연 적 없는 좁은 뷰포트 세션에서도 R7·
//   계정 삭제·계정 전환 안내가 뜨고 `exportBackup` 등록이 이뤄진다.
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
import { AccountSyncOverlays } from '@/features/sync';

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
  /** `⋯ → 삭제`. 셸이 자리표를 뜬 뒤 제어기에 넘긴다. */
  onRemoveCategory: (category: Category) => void;
  /** 삭제로 사라진 행 대신 포커스를 받을 요소 (R14). 주지 않으면 포커스가 `<body>` 로 떨어진다. */
  removalReturnFocus: () => HTMLElement | null;
  onSelectCategory: (id: CategoryId) => void;
  /** 계정 블록(로그아웃·계정 삭제·계정 전환)이 쓰는 내보내기 — `AppShell` 이 만들어 이 컴포넌트와
   * `ShellSidebar` 양쪽에 같은 함수를 내린다. */
  exportBackup: () => Promise<boolean>;
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
  onRemoveCategory,
  removalReturnFocus,
  onSelectCategory,
  exportBackup,
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
          categories={categories}
          onSelectCategory={(id) => {
            onDrawerClose();
            onSelectCategory(id);
          }}
          onRemoveCategory={onRemoveCategory}
          exportBackup={exportBackup}
        />
      </Dialog>

      {/* 리뷰 Major 3 — `Dialog` 밖, 레이아웃 분기 밖. 드로어가 닫혀 있어도 항상 마운트된다. */}
      <AccountSyncOverlays exportBackup={exportBackup} />

      <Dialog
        open={insightOverlayOpen}
        onClose={onInsightOverlayClose}
        title="오늘 요약"
        closeLabel="오늘 요약 닫기"
        className="ml-auto h-full max-w-[340px] self-stretch"
      >
        {/*
          오버레이 안에서도 패널은 **같은 모습**이어야 한다. 대화상자 본문은 높이가 내용만큼이라
          그냥 두면 `[단축키 ?]` 를 아래로 미는 `mt-auto` 가 먹지 않아 `카테고리별` 바로 밑에
          붙는다(리뷰 Minor). 최소 높이를 줘서 컬럼과 같은 배치가 되게 한다.
        */}
        <aside
          id={INSIGHT_OVERLAY_ID}
          aria-label="오늘 요약"
          className="flex h-full min-h-[60vh] flex-col"
        >
          <ShellInsights categories={categories} />
        </aside>
      </Dialog>

      {categoryFormOpen ? (
        <CategoryFormDialog open mode={{ kind: 'create' }} onClose={onCategoryFormClose} />
      ) : null}

      <CategoryRemoveDialog controller={removal} returnFocus={removalReturnFocus} />
    </>
  );
}
