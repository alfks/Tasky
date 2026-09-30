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
//
// `layout`·`sidebarPinned`·`onToggleSidebarPinned` 는 **`AppShell` 이 `useShellPanels()` 에서 만든
// 값을 prop 으로 내린다** — 이 컴포넌트가 직접 `useShellLayout()`/`useShellUiStore` 를 구독하지
// 않는다(리뷰 Minor). `useShellLayout` 머리주석이 "화면에 한 번만 마운트하고 prop 으로 내린다" 고
// 못 박아 둔 것을 그대로 지킨다 — 두 번째 구독은 리사이즈 한 번에 리스너를 두 배로 돌린다.
import { lazy, Suspense, useEffect, useRef } from 'react';

import type { Category } from '@/domain/category/category';
import type { CategoryId } from '@/domain/ids';

import {
  loadCategoryFormDialog,
  CategoryRemoveDialog,
  type CategoryRemovalController,
} from '@/features/category';
import { INSIGHT_OVERLAY_ID } from '@/features/shell/components/ShellHeader';
import { ShellInsights } from '@/features/shell/components/ShellInsights';
import { SIDEBAR_PIN_TOGGLE_ATTR, ShellSidebar } from '@/features/shell/components/ShellSidebar';
import { canPinSidebar, type ShellLayout } from '@/features/shell/lib/layout';
import { APP_NAME } from '@/features/shell/lib/title';
import { AccountSyncOverlays } from '@/features/sync';

import { Dialog } from '@/components/ui/Dialog';

const CategoryFormDialog = lazy(() =>
  loadCategoryFormDialog().then((module) => ({
    default: module.CategoryFormDialog,
  })),
);

type ShellOverlaysProps = {
  categories: readonly Category[];
  /** 드로어 본문에 `[고정]` 을 낼지 정하는 데만 쓴다(`canPinSidebar`) — `AppShell` 의
   * `panels.layout` 그대로다. */
  layout: ShellLayout;
  sidebarPinned: boolean;
  onToggleSidebarPinned: () => void;
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
  onOpenSocial?: () => void;
};

export function ShellOverlays({
  categories,
  layout,
  sidebarPinned,
  onToggleSidebarPinned,
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
  onOpenSocial,
}: ShellOverlaysProps) {
  // 방금 선택한 카테고리로의 포커스 인계를 다음 프레임으로 미루는 예약 — 언마운트되면 취소한다
  // (아래 onSelectCategory 콜백, 리뷰 Minor: 취소하지 않으면 이미 사라진 트리에 대고 실행된다).
  const selectHandoffRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (selectHandoffRef.current !== null) cancelAnimationFrame(selectHandoffRef.current);
    };
  }, []);

  return (
    <>
      {/*
        드로어는 `Dialog` 위에 짓는다 — Esc·바깥 클릭·✕·포커스 트랩·포커스 복귀가 전부 거기
        있다(R7). **제목은 항상 앱 이름 하나다(리뷰 Major 2)** — `[고정]` 버튼을 `title` 안에 넣던
        예전 방식은 `Dialog` 가 `title` 을 `<h2 id>` 로 그리고 `aria-labelledby` 로 가리키므로,
        버튼이 그 안에 있으면 드로어의 접근 이름이 토글마다 "Tasky 사이드바 고정" ↔ "Tasky 사이드바
        고정 해제" 로 바뀌었다 — 대화상자 하나의 이름은 고정돼야 한다. 버튼은 이제 본문 첫 줄(아래
        `ShellSidebar` 의 `showPinToggle`)로 내려갔다.
      */}
      <Dialog
        open={drawerOpen}
        onClose={onDrawerClose}
        title={APP_NAME}
        closeLabel="사이드바 닫기"
        className="mr-auto h-full max-w-[300px] self-stretch"
        /*
         * `[고정]` 을 눌러 고정을 켜면 이 드로어는 (열었던 `사이드바 열기` 버튼이 사라지는 것과
         * 함께) 스스로 닫힌다(`useShellPanels` 의 "컬럼이 서면 드로어를 닫는다" 효과) — 즉 이
         * onClose 호출 없이 `open` 이 바뀌는 경로다. 그때 `Dialog` 기본 복귀 대상(열었던 요소)은
         * 이미 DOM 에서 사라져 있으므로, 방금 선 컬럼의 같은 표식(`SIDEBAR_PIN_TOGGLE_ATTR`)을
         * 대체 대상으로 준다 — 없으면 포커스가 `<body>` 로 떨어진다(app-shell R14).
         */
        returnFocus={() => document.querySelector<HTMLElement>(`[${SIDEBAR_PIN_TOGGLE_ATTR}]`)}
      >
        <ShellSidebar
          showTitle={false}
          showPinToggle={canPinSidebar(layout)}
          sidebarPinned={sidebarPinned}
          onTogglePinned={onToggleSidebarPinned}
          categories={categories}
          onSelectCategory={(id) => {
            onDrawerClose();
            /*
             * `Dialog` 는 닫힐 때 **열었던 요소(사이드바 열기)로 무조건 되돌린다** — `returnFocus`
             * 는 그 요소가 사라졌을 때만 묻는 대체 대상이라(app-shell R14 규약, `Dialog.tsx`
             * `restoreFocus`), 열었던 요소가 아직 있으면 이 컴포넌트가 지금 여기서 목록으로 옮긴
             * 포커스를 **그 복귀 효과가 나중에 덮어쓴다**(실측: 되돌림 효과가 `useEffect` 로,
             * `onSelectCategory` 보다 한 프레임 늦게 돈다). 그래서 인계를 그 효과 **다음
             * 프레임**으로 미룬다 — `useShellPanels` 의 `handoffFocus` 와 같은 타이밍 규약이다
             * (`src/lib/focus-fallback.ts` 머리주석 "다음 프레임에야 DOM 에 있다"). id 는 위
             * `selectHandoffRef` 에 담아 둔다 — 이 콜백이 실행되기 전에 이 컴포넌트가 언마운트되면
             * (리뷰 Minor) 정리에서 취소한다.
             */
            if (typeof requestAnimationFrame === 'function') {
              selectHandoffRef.current = requestAnimationFrame(() => {
                selectHandoffRef.current = null;
                onSelectCategory(id);
              });
            } else {
              onSelectCategory(id);
            }
          }}
          onRemoveCategory={onRemoveCategory}
          exportBackup={exportBackup}
          onOpenSocial={() => {
            onDrawerClose();
            onOpenSocial?.();
          }}
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
          그냥 두면 `[단축키 ?]` 를 아래로 미는 `mt-auto` 가 먹지 않아 `오늘 달성률` 바로 밑에
          붙는다(리뷰 Minor). 최소 높이를 줘서 컬럼과 같은 배치가 되게 한다.
        */}
        <aside
          id={INSIGHT_OVERLAY_ID}
          aria-label="오늘 요약"
          className="flex h-full min-h-[60vh] flex-col"
        >
          <ShellInsights />
        </aside>
      </Dialog>

      {categoryFormOpen ? (
        <Suspense fallback={null}>
          <CategoryFormDialog open mode={{ kind: 'create' }} onClose={onCategoryFormClose} />
        </Suspense>
      ) : null}

      <CategoryRemoveDialog controller={removal} returnFocus={removalReturnFocus} />
    </>
  );
}
