'use client';

// 앱 셸 — 이 앱에서 화면이 **조립되는 유일한 곳** (app-shell.md 전체).
//
// 여기서 처음으로 feature 들이 서로를 본다. 그래서 feature 사이의 배선(토스트 뷰포트 하나, 단축키
// 레이어 하나, 삭제 제어기 한 벌, 타이머 슬롯 둘, 문서 제목)은 전부 이 파일과 형제 파일에 모인다 —
// feature 안에 흩으면 같은 배선이 두 번 생기고, 그것이 토스트 두 개가 겹친 이유였다.
import { useEffect, useRef, useState } from 'react';

import { useBackupStore } from '@/features/backup';
import {
  useCategories,
  useCategoryActions,
  useCategoryLoadState,
  useCategoryRemoval,
  useCategoryStore,
} from '@/features/category';
import { useDateStripStore } from '@/features/date-strip';
import { MemoryModeBanner } from '@/features/shell/components/MemoryModeBanner';
import { ShellErrorBoundary } from '@/features/shell/components/ShellErrorBoundary';
import { ShellGlobals } from '@/features/shell/components/ShellGlobals';
import { ShellHeader } from '@/features/shell/components/ShellHeader';
import { INSIGHT_PANEL_ID, ShellInsights } from '@/features/shell/components/ShellInsights';
import { ShellMain } from '@/features/shell/components/ShellMain';
import { ShellOverlays } from '@/features/shell/components/ShellOverlays';
import { ShellSidebar } from '@/features/shell/components/ShellSidebar';
import { SkipLink } from '@/features/shell/components/SkipLink';
import { StorageFailureCard } from '@/features/shell/components/StorageFailureCard';
import { useCategoryFocus } from '@/features/shell/hooks/useCategoryFocus';
import { useFocusStartReset } from '@/features/shell/hooks/useFocusStartReset';
import { useRemovalReturnFocus } from '@/features/shell/hooks/useRemovalReturnFocus';
import { useShellDocumentTitle } from '@/features/shell/hooks/useShellDocumentTitle';
import { useShellPanels } from '@/features/shell/hooks/useShellPanels';
import { useShellShortcuts } from '@/features/shell/hooks/useShellShortcuts';
import { useToastStack } from '@/features/shell/hooks/useToastStack';
import { useTodoDropToDate } from '@/features/shell/hooks/useTodoDropToDate';
import { useTopNoticeOffset } from '@/features/shell/hooks/useTopNoticeOffset';
import { hasBottomAddButton } from '@/features/shell/lib/layout';
import { APP_NAME } from '@/features/shell/lib/title';
import { useShellStorageStore } from '@/features/shell/store/shell-storage-store';
import { useShellToastStore } from '@/features/shell/store/shell-toast-store';
import { useCompletion } from '@/features/stats';
import { useThemeSync } from '@/features/theme';
import { useTodoStore } from '@/features/todo';

function ShellBody() {
  // 두 패널의 "지금 컬럼인가 / 어떻게 열고 접는가" 와 접을 때의 포커스 인계는 한 훅에 모여 있다.
  const panels = useShellPanels();
  const { sidebarIsColumn, insightIsColumn, drawerOpen, insightOverlayOpen } = panels;

  // 테마 적재·OS 추종은 화면에 한 번만 건다(theme R6~R8).
  const theme = useThemeSync();
  useToastStack();
  // 첫 Tab 이 건너뛰기 링크로 가게 시작점을 되돌린다(R10 — 훅 주석에 인과가 있다).
  useFocusStartReset();
  // 상단 고정 알림(PWA 저장 공간 배너)이 헤더를 덮지 않게 그만큼 자리를 비운다.
  const noticeOffset = useTopNoticeOffset();

  const date = useDateStripStore((s) => s.selectedDate);
  const categories = useCategories();
  const categoryLoad = useCategoryLoadState();
  const { load: loadCategories } = useCategoryActions();
  const todoStatus = useTodoStore((s) => s.status);
  const summary = useCompletion();
  const removal = useCategoryRemoval();
  const pushToast = useShellToastStore((s) => s.pushToast);
  const storageStatus = useShellStorageStore((s) => s.status);
  const reportFailure = useShellStorageStore((s) => s.reportFailure);
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const openBackupDialog = useBackupStore((s) => s.openDialog);

  useShellDocumentTitle(date, summary);
  useShellShortcuts({ toggleSidebar: panels.toggleSidebar });
  const handleDropTodo = useTodoDropToDate(date);
  const focusCategory = useCategoryFocus(categories);
  const removalFocus = useRemovalReturnFocus();
  /** 삭제를 청하기 **전에** 자리표를 뜬다 — 그 행은 곧 사라진다. */
  const requestRemove = (category: Parameters<typeof removal.requestRemove>[0]): void => {
    removalFocus.capture();
    removal.requestRemove(category);
  };

  /*
   * **카테고리 적재는 셸이 건다.** 전에는 `CategoryList` 의 effect 가 유일한 시작점이었는데, 그
   * 컴포넌트는 사이드바가 **컬럼일 때만** 마운트된다. 그래서 폭 <1024 이거나 사이드바를 접어 둔
   * 채(그 상태는 localStorage 에 남는다 — R5) 앱을 열면 아무도 `load()` 를 부르지 않아 상태가
   * 영원히 `idle` 이고, 메인에 투두도 빈 상태 문구도 뜨지 않았다. 드로어를 한 번 열어야 풀렸다.
   *
   * 화면 어디에 무엇이 마운트되든 적재는 한 번 걸려야 하므로, 레이아웃을 모르는 이 자리가 맞다.
   *
   * **렌더 스냅샷이 아니라 스토어의 지금 값을 본다.** `CategoryList` 도 같은 effect 를 갖고 있는데
   * 자식 effect 가 먼저 돌고 `load()` 는 동기적으로 상태를 `loading` 으로 바꾸므로, 여기서 다시
   * 읽으면 이미 `idle` 이 아니라 한 번으로 끝난다. 스냅샷을 쓰면 둘 다 `idle` 을 보고 두 번 건다.
   */
  useEffect(() => {
    if (useCategoryStore.getState().status === 'idle') void loadCategories();
  }, [loadCategories]);

  // 저장소를 **열지** 못한 것과 조회 하나가 실패한 것은 다르다. 첫 조회 둘(카테고리·테마)이 함께
  // 실패했을 때만 열기 실패로 본다 — 둘은 같은 DB 를 서로 다른 경로로 처음 건드리는 읽기다.
  useEffect(() => {
    if (categoryLoad.status === 'error' && theme.status === 'error') reportFailure();
  }, [categoryLoad.status, theme.status, reportFailure]);

  const failed = storageStatus === 'failed';
  const categoriesPending =
    !failed && (categoryLoad.status === 'idle' || categoryLoad.status === 'loading');
  // "이 세션에서 투두를 한 번이라도 읽어 봤는가". 날짜를 옮길 때마다 스켈레톤이 번쩍이지 않게
  // 첫 적재로만 좁힌다(§2-C "로딩" 은 앱을 여는 순간을 말한다).
  const everReady = useRef(false);
  if (todoStatus === 'ready') everReady.current = true;
  const todosFirstLoading = !failed && !everReady.current && todoStatus !== 'error';

  return (
    <div className="flex h-dvh min-w-[400px] flex-col bg-bg text-text">
      <SkipLink />
      {storageStatus === 'memory' ? <MemoryModeBanner /> : null}
      <div
        aria-hidden="true"
        data-shell-notice-spacer=""
        style={{ height: noticeOffset }}
        className="shrink-0"
      />
      {/* 문서의 `h1` 은 언제나 하나다. 사이드바가 컬럼일 때는 그쪽이 보이는 제목을 갖고,
          아닐 때(드로어 포함)는 여기 숨은 제목이 그 자리를 맡는다. */}
      {sidebarIsColumn ? null : <h1 className="sr-only">{APP_NAME}</h1>}

      <div className="flex min-h-0 flex-1 gap-[var(--space-6)] px-[var(--space-4)] py-[var(--space-3)]">
        {sidebarIsColumn ? (
          <div ref={panels.sidebarRef} className="w-[240px] shrink-0">
            <ShellSidebar
              showTitle
              onSelectCategory={focusCategory}
              onRemoveCategory={requestRemove}
            />
          </div>
        ) : null}

        <ShellMain
          date={date}
          categories={categories}
          categoriesPending={categoriesPending}
          todosFirstLoading={todosFirstLoading}
          todosEmpty={summary.total === 0}
          showBottomAdd={hasBottomAddButton(panels.layout)}
          failureCard={
            failed ? <StorageFailureCard onContinue={() => void loadCategories()} /> : null
          }
          onCreateCategory={() => setCategoryFormOpen(true)}
          header={
            <ShellHeader
              summary={summary}
              sidebarIsColumn={sidebarIsColumn}
              insightIsColumn={insightIsColumn}
              insightOverlayOpen={insightOverlayOpen}
              onOpenDrawer={panels.openDrawer}
              onOpenInsight={panels.openInsight}
              onSummaryError={(message) => pushToast({ message, variant: 'error' })}
              onDropTodo={handleDropTodo}
            />
          }
        />

        {insightIsColumn ? (
          <aside
            ref={panels.asideRef}
            id={INSIGHT_PANEL_ID}
            tabIndex={-1}
            aria-label="오늘 요약"
            className="w-[280px] shrink-0 outline-none"
          >
            <ShellInsights
              categories={categories}
              panelId={INSIGHT_PANEL_ID}
              onCollapse={panels.collapseInsight}
            />
          </aside>
        ) : null}
      </div>

      <ShellGlobals onBackup={openBackupDialog} />

      <ShellOverlays
        categories={categories}
        drawerOpen={drawerOpen}
        onDrawerClose={panels.closeDrawer}
        insightOverlayOpen={insightOverlayOpen}
        onInsightOverlayClose={panels.closeInsightOverlay}
        categoryFormOpen={categoryFormOpen}
        onCategoryFormClose={() => setCategoryFormOpen(false)}
        removal={removal}
        onRemoveCategory={requestRemove}
        removalReturnFocus={removalFocus.returnFocus}
        onSelectCategory={focusCategory}
      />
    </div>
  );
}

/**
 * 셸의 바깥 껍질 — **에러 바운더리**다 (T-17 핸드오프가 넘긴 필수 항목).
 *
 * 바운더리는 잡을 대상보다 위에 있어야 한다. 안쪽 레이아웃만 감싸면 `ShellBody` 자신의 훅에서 난
 * 예외(날짜 파싱·스토어 선택자)는 그대로 빠져나가 `#root` 를 비운다 — 실제로 그 자리를 회귀
 * 테스트로 고정해 두었다.
 */
export function AppShell() {
  return (
    <ShellErrorBoundary>
      <ShellBody />
    </ShellErrorBoundary>
  );
}
