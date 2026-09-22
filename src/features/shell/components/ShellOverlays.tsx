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
import { SIDEBAR_PIN_TOGGLE_ATTR, ShellSidebar } from '@/features/shell/components/ShellSidebar';
import { useShellLayout } from '@/features/shell/hooks/useShellLayout';
import { APP_NAME } from '@/features/shell/lib/title';
import { useShellUiStore } from '@/features/shell/store/shell-ui-store';
import { AccountSyncOverlays } from '@/features/sync';

import { Button } from '@/components/ui/Button';
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
  // 사이드바가 이제 모든 폭의 기본 경로다(calendar-layout.md §1-A) — 이 드로어는 `wide` 를 포함해
  // 늘 열릴 수 있다. `[고정]` 은 그 중 `wide`(≥1280)에서만 뜻이 있다(고정 컬럼은 `wide` 전용,
  // R24) — 그래서 폭을 직접 재서 그 경계에서만 제목줄에 버튼을 더한다.
  const layout = useShellLayout();
  const sidebarPinned = useShellUiStore((s) => s.sidebarPinned);
  const toggleSidebarPinned = useShellUiStore((s) => s.toggleSidebarPinned);

  const drawerTitle =
    layout === 'wide' ? (
      <span className="flex items-center gap-[var(--space-2)]">
        {APP_NAME}
        <Button
          {...{ [SIDEBAR_PIN_TOGGLE_ATTR]: '' }}
          variant="ghost"
          size="sm"
          aria-pressed={sidebarPinned}
          onClick={toggleSidebarPinned}
        >
          사이드바 {sidebarPinned ? '고정 해제' : '고정'}
        </Button>
      </span>
    ) : (
      APP_NAME
    );

  return (
    <>
      {/* 드로어는 `Dialog` 위에 짓는다 — Esc·바깥 클릭·✕·포커스 트랩·포커스 복귀가 전부 거기 있다(R7). */}
      <Dialog
        open={drawerOpen}
        onClose={onDrawerClose}
        title={drawerTitle}
        closeLabel="카테고리 닫기"
        className="mr-auto h-full max-w-[300px] self-stretch"
        /*
         * `[고정]` 을 눌러 고정을 켜면 이 드로어는 (열었던 `카테고리 열기` 버튼이 사라지는 것과
         * 함께) 스스로 닫힌다(`useShellPanels` 의 "컬럼이 서면 드로어를 닫는다" 효과) — 즉 이
         * onClose 호출 없이 `open` 이 바뀌는 경로다. 그때 `Dialog` 기본 복귀 대상(열었던 요소)은
         * 이미 DOM 에서 사라져 있으므로, 방금 선 컬럼의 같은 표식(`SIDEBAR_PIN_TOGGLE_ATTR`)을
         * 대체 대상으로 준다 — 없으면 포커스가 `<body>` 로 떨어진다(app-shell R14).
         */
        returnFocus={() => document.querySelector<HTMLElement>(`[${SIDEBAR_PIN_TOGGLE_ATTR}]`)}
      >
        <ShellSidebar
          showTitle={false}
          categories={categories}
          onSelectCategory={(id) => {
            onDrawerClose();
            /*
             * `Dialog` 는 닫힐 때 **열었던 요소(카테고리 열기)로 무조건 되돌린다** — `returnFocus`
             * 는 그 요소가 사라졌을 때만 묻는 대체 대상이라(app-shell R14 규약, `Dialog.tsx`
             * `restoreFocus`), 열었던 요소가 아직 있으면 이 컴포넌트가 지금 여기서 목록으로 옮긴
             * 포커스를 **그 복귀 효과가 나중에 덮어쓴다**(실측: 되돌림 효과가 `useEffect` 로,
             * `onSelectCategory` 보다 한 프레임 늦게 돈다). 그래서 인계를 그 효과 **다음
             * 프레임**으로 미룬다 — `useShellPanels` 의 `handoffFocus` 와 같은 타이밍 규약이다
             * (`src/lib/focus-fallback.ts` 머리주석 "다음 프레임에야 DOM 에 있다").
             */
            if (typeof requestAnimationFrame === 'function') {
              requestAnimationFrame(() => onSelectCategory(id));
            } else {
              onSelectCategory(id);
            }
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
