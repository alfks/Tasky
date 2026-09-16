'use client';

// 앱 셸 — 이 앱에서 화면이 **조립되는 유일한 곳** (app-shell.md 전체).
//
// 여기서 처음으로 feature 들이 서로를 본다. 그래서 feature 사이의 배선(토스트 뷰포트 하나, 단축키
// 레이어 하나, 삭제 제어기 한 벌, 타이머 슬롯 둘, 문서 제목)은 전부 이 파일과 형제 파일에 모인다 —
// feature 안에 흩으면 같은 배선이 두 번 생기고, 그것이 토스트 두 개가 겹친 이유였다.
import { useEffect, useState } from 'react';

import { useBackupStore } from '@/features/backup';
import {
  useCategories,
  useCategoryActions,
  useCategoryLoadState,
  useCategoryRemoval,
} from '@/features/category';
import { useDateStripStore } from '@/features/date-strip';
import { MemoryModeBanner } from '@/features/shell/components/MemoryModeBanner';
import { ShellErrorBoundary } from '@/features/shell/components/ShellErrorBoundary';
import { ShellGlobals } from '@/features/shell/components/ShellGlobals';
import { ShellHeader } from '@/features/shell/components/ShellHeader';
import { ShellInsights } from '@/features/shell/components/ShellInsights';
import { ShellMain } from '@/features/shell/components/ShellMain';
import { ShellOverlays } from '@/features/shell/components/ShellOverlays';
import { ShellSidebar } from '@/features/shell/components/ShellSidebar';
import { SkipLink } from '@/features/shell/components/SkipLink';
import { StorageFailureCard } from '@/features/shell/components/StorageFailureCard';
import { useCategoryFocus } from '@/features/shell/hooks/useCategoryFocus';
import { useShellDocumentTitle } from '@/features/shell/hooks/useShellDocumentTitle';
import { useShellLayout } from '@/features/shell/hooks/useShellLayout';
import { useShellShortcuts } from '@/features/shell/hooks/useShellShortcuts';
import { useToastStack } from '@/features/shell/hooks/useToastStack';
import { useTodoDropToDate } from '@/features/shell/hooks/useTodoDropToDate';
import { useTopNoticeOffset } from '@/features/shell/hooks/useTopNoticeOffset';
import {
  hasBottomAddButton,
  hasInsightColumn,
  hasSidebarColumn,
} from '@/features/shell/lib/layout';
import { APP_NAME } from '@/features/shell/lib/title';
import { useShellStorageStore } from '@/features/shell/store/shell-storage-store';
import { useShellToastStore } from '@/features/shell/store/shell-toast-store';
import { useShellUiStore } from '@/features/shell/store/shell-ui-store';
import { useCompletion } from '@/features/stats';
import { useThemeSync } from '@/features/theme';
import { useTodoStore } from '@/features/todo';

function ShellBody() {
  const layout = useShellLayout();
  const sidebarCollapsed = useShellUiStore((s) => s.sidebarCollapsed);
  const insightCollapsed = useShellUiStore((s) => s.insightCollapsed);
  const drawerOpen = useShellUiStore((s) => s.drawerOpen);
  const insightOverlayOpen = useShellUiStore((s) => s.insightOverlayOpen);
  const toggleSidebar = useShellUiStore((s) => s.toggleSidebar);
  const toggleInsight = useShellUiStore((s) => s.toggleInsight);
  const setDrawerOpen = useShellUiStore((s) => s.setDrawerOpen);
  const setInsightOverlayOpen = useShellUiStore((s) => s.setInsightOverlayOpen);

  // 테마 적재·OS 추종은 화면에 한 번만 건다(theme R6~R8).
  const theme = useThemeSync();
  useToastStack();
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
  const handleDropTodo = useTodoDropToDate(date);
  const focusCategory = useCategoryFocus(categories);

  const sidebarIsColumn = hasSidebarColumn(layout) && !sidebarCollapsed;
  const insightIsColumn = hasInsightColumn(layout) && !insightCollapsed;

  useShellShortcuts({
    toggleSidebar: () => (hasSidebarColumn(layout) ? toggleSidebar() : setDrawerOpen(!drawerOpen)),
  });

  // 저장소를 **열지** 못한 것과 조회 하나가 실패한 것은 다르다. 첫 조회 둘(카테고리·테마)이 함께
  // 실패했을 때만 열기 실패로 본다 — 둘은 같은 DB 를 서로 다른 경로로 처음 건드리는 읽기다.
  useEffect(() => {
    if (categoryLoad.status === 'error' && theme.status === 'error') reportFailure();
  }, [categoryLoad.status, theme.status, reportFailure]);

  // 넓어지면 드로어·오버레이는 의미가 없다 — 컬럼이 그 내용을 이미 보여 준다(§2-B).
  useEffect(() => {
    if (hasSidebarColumn(layout)) setDrawerOpen(false);
    if (hasInsightColumn(layout)) setInsightOverlayOpen(false);
  }, [layout, setDrawerOpen, setInsightOverlayOpen]);

  const failed = storageStatus === 'failed';
  const loading =
    !failed &&
    (categoryLoad.status === 'idle' ||
      categoryLoad.status === 'loading' ||
      todoStatus === 'loading');

  return (
    <div className="flex h-dvh min-w-[400px] flex-col bg-bg text-text">
      <SkipLink />
      {storageStatus === 'memory' ? <MemoryModeBanner /> : null}
      <div aria-hidden="true" style={{ height: noticeOffset }} className="shrink-0" />
      {/* 문서의 `h1` 은 언제나 하나다. 사이드바가 컬럼일 때는 그쪽이 보이는 제목을 갖고,
          아닐 때(드로어 포함)는 여기 숨은 제목이 그 자리를 맡는다. */}
      {sidebarIsColumn ? null : <h1 className="sr-only">{APP_NAME}</h1>}

      <div className="flex min-h-0 flex-1 gap-[var(--space-6)] px-[var(--space-4)] py-[var(--space-3)]">
        {sidebarIsColumn ? (
          <div className="w-[240px] shrink-0">
            <ShellSidebar
              showTitle
              onSelectCategory={focusCategory}
              onRemoveCategory={removal.requestRemove}
            />
          </div>
        ) : null}

        <ShellMain
          date={date}
          categories={categories}
          loading={loading}
          todosEmpty={summary.total === 0}
          showBottomAdd={hasBottomAddButton(layout)}
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
              onOpenDrawer={() => setDrawerOpen(true)}
              onOpenInsight={() => setInsightOverlayOpen(true)}
              onSummaryError={(message) => pushToast({ message, variant: 'error' })}
              onDropTodo={handleDropTodo}
            />
          }
        />

        {insightIsColumn ? (
          <aside aria-label="오늘 요약" className="w-[280px] shrink-0">
            <ShellInsights categories={categories} onCollapse={toggleInsight} />
          </aside>
        ) : null}
      </div>

      <ShellOverlays
        categories={categories}
        drawerOpen={drawerOpen}
        onDrawerClose={() => setDrawerOpen(false)}
        insightOverlayOpen={insightOverlayOpen}
        onInsightOverlayClose={() => setInsightOverlayOpen(false)}
        categoryFormOpen={categoryFormOpen}
        onCategoryFormClose={() => setCategoryFormOpen(false)}
        removal={removal}
        onSelectCategory={focusCategory}
      />

      <ShellGlobals onBackup={openBackupDialog} />
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
