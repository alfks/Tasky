'use client';

// 앱 셸 — 이 앱에서 화면이 **조립되는 유일한 곳** (app-shell.md 전체).
//
// 여기서 처음으로 feature 들이 서로를 본다. 그래서 feature 사이의 배선(토스트 뷰포트 하나, 단축키
// 레이어 하나, 삭제 제어기 한 벌, 타이머 슬롯 둘, 문서 제목)은 전부 이 파일과 형제 파일에 모인다 —
// feature 안에 흩으면 같은 배선이 두 번 생기고, 그것이 토스트 두 개가 겹친 이유였다.
import { useCallback, useEffect, useRef, useState } from 'react';

import { useBackupStore } from '@/features/backup';
import {
  useCategories,
  useCategoryActions,
  useCategoryLoadState,
  useCategoryRemoval,
  useCategoryStore,
} from '@/features/category';
import { useDateStripStore } from '@/features/date-strip';
import { ReportsScreen, useReportsStore } from '@/features/reports';
import { MemoryModeBanner } from '@/features/shell/components/MemoryModeBanner';
import { ShellDayPanel } from '@/features/shell/components/ShellDayPanel';
import { ShellErrorBoundary } from '@/features/shell/components/ShellErrorBoundary';
import { ShellGlobals } from '@/features/shell/components/ShellGlobals';
import { ShellHeader } from '@/features/shell/components/ShellHeader';
import { INSIGHT_PANEL_ID, ShellInsights } from '@/features/shell/components/ShellInsights';
import { ShellMain } from '@/features/shell/components/ShellMain';
import { ShellOverlays } from '@/features/shell/components/ShellOverlays';
import { ShellSidebar } from '@/features/shell/components/ShellSidebar';
import { SkipLink } from '@/features/shell/components/SkipLink';
import { StorageFailureCard } from '@/features/shell/components/StorageFailureCard';
import { useCategoriesWithHistory } from '@/features/shell/hooks/useCategoriesWithHistory';
import { useCategoryFocus } from '@/features/shell/hooks/useCategoryFocus';
import { useFocusStartReset } from '@/features/shell/hooks/useFocusStartReset';
import { useRemovalReturnFocus } from '@/features/shell/hooks/useRemovalReturnFocus';
import { useShellDocumentTitle } from '@/features/shell/hooks/useShellDocumentTitle';
import { useShellPanels } from '@/features/shell/hooks/useShellPanels';
import { useShellShortcuts } from '@/features/shell/hooks/useShellShortcuts';
import { useStartTimerForTodo } from '@/features/shell/hooks/useStartTimerForTodo';
import { useToastStack } from '@/features/shell/hooks/useToastStack';
import { useTodoDropToDate } from '@/features/shell/hooks/useTodoDropToDate';
import { useTopNoticeOffset } from '@/features/shell/hooks/useTopNoticeOffset';
import { hasBottomAddButton, hasDayPanelColumn } from '@/features/shell/lib/layout';
import { SHELL_MAIN_ID } from '@/features/shell/lib/main-id';
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
  // 2영역(달력 컬럼 + 선택 날짜 패널, ≥680) 대 1열(`ShellMain`, <680)의 갈림은 지금은 인사이트
  // 컬럼과 같은 문턱이지만 **뜻이 다른 판정**이라 전용 함수를 쓴다(`hasDayPanelColumn` — 리뷰
  // Minor). 예전에는 `hasInsightColumn` 을 그대로 재사용했는데, 인사이트 정책만 바뀌어도(예:
  // 인사이트를 `wide` 전용으로 좁히면) 2영역 레이아웃이 `mid` 에서 조용히 1열로 무너지는 결합이었다.
  const threeRegion = hasDayPanelColumn(panels.layout);

  // 테마 적재·OS 추종은 화면에 한 번만 건다(theme R6~R8).
  const theme = useThemeSync();
  useToastStack();
  // 첫 Tab 이 건너뛰기 링크로 가게 시작점을 되돌린다(R10 — 훅 주석에 인과가 있다).
  useFocusStartReset();
  // 상단 고정 알림(PWA 저장 공간 배너)이 헤더를 덮지 않게 그만큼 자리를 비운다.
  const noticeOffset = useTopNoticeOffset();

  const date = useDateStripStore((s) => s.selectedDate);
  const categories = useCategories();
  // 본문 목록·인사이트 패널 전용(category R17·R22) — 사이드바·선택지·팔레트는 여전히 `categories`
  // 그대로 쓴다(아래 `focusCategory`·`ShellSidebar`). 자세한 이유는 훅 주석.
  const categoriesWithHistory = useCategoriesWithHistory(categories);
  const categoryLoad = useCategoryLoadState();
  const { load: loadCategories } = useCategoryActions();
  const todoStatus = useTodoStore((s) => s.status);
  const summary = useCompletion();
  // 투두 항목 메뉴 "타이머 시작" (timer.md §2) — `todo` 는 `timer` 를 import 할 수 없어 이 다리가
  // 필요하다(`useStartTimerForTodo` 머리 주석).
  const startTimerForTodo = useStartTimerForTodo();
  const removal = useCategoryRemoval();
  const pushToast = useShellToastStore((s) => s.pushToast);
  const storageStatus = useShellStorageStore((s) => s.status);
  const reportFailure = useShellStorageStore((s) => s.reportFailure);
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const openBackupDialog = useBackupStore((s) => s.openDialog);

  // 계정 블록(sync.md §2, R12-a)이 필요로 한다 — `sync` 는 `backup` 을 import 할 수 없어
  // 셸이 꺼내 prop 으로 내린다(backup/index.ts 머리주석의 선례). 여기서 만들어 `ShellSidebar`
  // (컬럼·드로어 두 인스턴스)와 `ShellOverlays`(리뷰 Major 3 — 레이아웃과 무관하게 항상 마운트되는
  // 계정 다이얼로그들, 같은 함수)에 **같은 인스턴스**로 내린다.
  //
  // **`refresh()` 를 먼저 부르는 이유**: `exportBackup()` 은 `canExport(state)` 를 보고, 그 판정은
  // `state.current`(엔티티 개수)가 있어야 참이 된다 — `current` 는 백업 다이얼로그를 **연 적이
  // 있어야만**(`openDialog` → `refresh`) 채워진다. 로그아웃·계정 삭제·계정 삭제/전환 안내는
  // 다이얼로그를 연 적 없이도 눌릴 수 있는 버튼이라, `refresh()` 없이 그대로 넘기면
  // `current === null` 이라 `canExport` 가 거짓이 되어 내보내기가 **매번 조용히 실패한다**(실측:
  // e2e 로 처음 드러났다 — 계정 삭제가 아무 일도 없이 끝났다). `refresh` 는 멱등이고 비용도 엔티티
  // 6종 조회 한 번뿐이다. `allowEmpty: true` 는 리뷰 Major 1 — 로컬이 비어 있어도 인증 경로(로그
  // 아웃·계정 삭제·계정 전환)는 통과해야 사용자가 갇히지 않는다.
  const exportBackupOnly = useBackupStore((state) => state.exportBackup);
  const refreshBackupCounts = useBackupStore((state) => state.refresh);
  const exportBackup = useCallback(async () => {
    await refreshBackupCounts();
    return exportBackupOnly({ allowEmpty: true });
  }, [refreshBackupCounts, exportBackupOnly]);

  // 통계 화면(T-85, stats.md "메인 컬럼 전체 대체"). 커맨드 팔레트 "통계 보기"가 `open` 을 켠다.
  const reportsOpen = useReportsStore((s) => s.open);
  const reportsOpener = useReportsStore((s) => s.opener);
  const wasReportsOpen = useRef(false);
  // `closeReports` 가 `opener` 를 스토어에서 함께 비운다(review m8, 스토어 누수 감사) — 그래서
  // "방금 닫혔다" 순간엔 `reportsOpener` 를 store 에서 다시 읽어도 이미 null 이다(같은 `set()` 로
  // 한 번에 바뀌었으므로). 닫히기 **직전** 값을 여기 로컬 ref 에 스냅샷해 둔다 — 셸 컴포넌트 하나가
  // 앱 생애주기 내내 사는 지역 변수라 스토어처럼 전역에 남거나 `getState()` 로 다시 노출되지 않는다.
  const reportsOpenerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (reportsOpen) reportsOpenerRef.current = reportsOpener;
  }, [reportsOpen, reportsOpener]);
  useEffect(() => {
    // 방금 닫혔다 — 열었던 요소로, 사라졌으면 본문 랜드마크로(`Dialog` 의 `restoreFocus` 와 같은
    // 규약: 열 때 잡아 둔 요소가 살아 있으면 그리로, 없으면 대체 랜드마크로. `ShellMain` 은 통째로
    // 새로 마운트되므로 그 안의 옛 opener 는 거의 항상 끊겨 있고, 그때는 `#shell-main` 으로 간다).
    if (wasReportsOpen.current && !reportsOpen) {
      const opener = reportsOpenerRef.current;
      if (opener !== null && opener.isConnected) opener.focus();
      else document.getElementById(SHELL_MAIN_ID)?.focus();
    }
    wasReportsOpen.current = reportsOpen;
  }, [reportsOpen]);

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
   * 컴포넌트는 사이드바가 **컬럼일 때만** 마운트된다. 그래서 고정이 불가능한 폭이거나 사이드바를 접어 둔
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

  const failureCard = failed ? (
    <StorageFailureCard onContinue={() => void loadCategories()} />
  ) : null;
  const handleCreateCategory = () => setCategoryFormOpen(true);
  const header = (
    <ShellHeader
      summary={summary}
      sidebarIsColumn={sidebarIsColumn}
      insightIsColumn={insightIsColumn}
      dayPanelVisible={threeRegion}
      insightOverlayOpen={insightOverlayOpen}
      onOpenDrawer={panels.openDrawer}
      onOpenInsight={panels.openInsight}
      onSummaryError={(message) => pushToast({ message, variant: 'error' })}
      onDropTodo={handleDropTodo}
    />
  );

  return (
    // `min-w` 는 §3 R11 의 최소 폭이다. 400px 이던 시절에는 **실기기 대부분에서 가로 스크롤이
    // 생겼다** — 휴대폰의 CSS 폭은 360(안드로이드 다수)·375(iPhone SE·mini)·390(iPhone 12~16)
    // 이라 셋 다 400 아래다. 값을 낮출 때 실제로 검증해야 하는 것은 이 줄이 아니라 헤더 한 줄이다
    // (ShellHeader 의 `min-w-0` 주석 참고). 360px 실측은 tests/e2e/narrow-viewport.spec.ts 가 지킨다.
    <div className="flex h-dvh min-w-[360px] flex-col bg-bg text-text">
      <SkipLink />
      {storageStatus === 'memory' ? <MemoryModeBanner /> : null}
      <div
        aria-hidden="true"
        data-shell-notice-spacer=""
        style={{ height: noticeOffset }}
        className="shrink-0"
      />
      {/*
        문서의 `h1` 은 언제나 하나다. 사이드바가 컬럼이면 `ShellSidebar` 가, 아니면 `ShellHeader`
        가 이미 갖고 있다(calendar-layout.md R6, ☰ 오른쪽) — 단 `ShellHeader` 는 다음 두 갈래에서
        통째로 숨는다: 저장소 열기 실패(`failureCard`, §2-C 에러, `header` 변수 참고)와 통계 화면
        (`reportsOpen` — `ReportsScreen` 하나만 렌더되고 그 제목은 h2 다, stats.md). 그 두 갈래에서만
        여기서 대신 낸다(sr-only — 두 화면 모두 보이는 제목을 더할 자리가 없다). 이 조건을
        `reportsOpen` 을 빼고 좁히면(리뷰 Major) 통계를 연 순간 문서에 `h1` 이 0개가 된다 —
        `AppShell.test.tsx` 가 그 상태를 고정한다.
      */}
      {sidebarIsColumn || (failureCard === null && !reportsOpen) ? null : (
        <h1 className="sr-only">{APP_NAME}</h1>
      )}

      <div className="flex min-h-0 flex-1 gap-[var(--space-6)] px-[var(--space-4)] py-[var(--space-3)]">
        {sidebarIsColumn ? (
          <div ref={panels.sidebarRef} className="w-[240px] shrink-0">
            <ShellSidebar
              showTitle
              framed
              sidebarPinned={panels.sidebarPinned}
              onTogglePinned={panels.toggleSidebarPinned}
              categories={categories}
              onSelectCategory={focusCategory}
              onRemoveCategory={requestRemove}
              exportBackup={exportBackup}
            />
          </div>
        ) : null}

        {reportsOpen ? (
          <ReportsScreen />
        ) : threeRegion ? (
          // calendar-layout.md §1-B R1(b)·R2·R4: 달력 컬럼(셸 상단 줄 + 날짜 스트립 + 그 아래
          // 인사이트, 인사이트만 스크롤) + 선택 날짜 패널(`main`, R1(c)) 둘로 나뉜다. `h1` 은 여기서
          // 그리지 않는다 — `sidebarIsColumn` 이면 `ShellSidebar` 가, 아니면 `ShellHeader` 가 이미
          // ☰ 옆에 갖고 있다(calendar-layout.md R6).
          //
          // **두 컬럼이 같은 문법으로 폭을 나눠 갖는다(R2).** 둘 다 `flex-1` 이라 남는 폭을 똑같이
          // 나누고, 각자의 상한(달력 440 · 패널 400)에서 멈추면 이 래퍼의 `justify-center` 가 **쌍을**
          // 가운데로 민다 — 1440 이면 양쪽 288 씩. 달력 컬럼의 상한이 440 인 이유: 격자(7×48+6×6 =
          // 372)에 34px 만 남겨 "달력 잉크가 컬럼 안에서 따로 가운데" 로 보이던 인상(사용자 피드백
          // 6, FEEL_REPORT §14)을 없앤다 — 컬럼 폭 ≈ 잉크 폭이면 컬럼의 가운데가 곧 잉크의 가운데다.
          // 하한은 `--shell-calendar-col-min`(격자 + 좌우 16, ≥768 에서 404 / <768 에서 336 —
          // tokens.css 가 달력 밀도 토큰으로부터 계산한다) 와 패널 280. 그래서 680 에서도 두
          // 컬럼이 나란히 선다(336 + 24 + 288 = 648 = 680 − 거터 32). `min-w-0` 은 이 래퍼가
          // `justify-center` 로 줄어들 때도 자식의 `min-w` 가 실제로 지켜지게 한다(안 주면 flex 기본
          // `min-width:auto` 가 이 래퍼 자체를 늘려 버린다).
          <div className="flex min-h-0 min-w-0 flex-1 justify-center gap-[var(--space-6)]">
            <div className="flex min-h-0 max-w-[440px] min-w-[var(--shell-calendar-col-min)] flex-1 flex-col gap-[var(--space-3)]">
              <div className="shrink-0">{failureCard === null ? header : null}</div>
              {insightIsColumn ? (
                <aside
                  ref={panels.asideRef}
                  id={INSIGHT_PANEL_ID}
                  tabIndex={-1}
                  aria-label="오늘 요약"
                  className="min-h-0 flex-1 outline-none"
                >
                  <ShellInsights panelId={INSIGHT_PANEL_ID} onCollapse={panels.collapseInsight} />
                </aside>
              ) : null}
            </div>

            <ShellDayPanel
              date={date}
              summary={summary}
              categories={categoriesWithHistory}
              categoriesPending={categoriesPending}
              todosFirstLoading={todosFirstLoading}
              todosEmpty={summary.total === 0}
              failureCard={failureCard}
              onCreateCategory={handleCreateCategory}
              onStartTimer={startTimerForTodo}
            />
          </div>
        ) : (
          // calendar-layout.md R8: <680(compact) 는 1열 — 헤더가 `ShellMain` 안, `main` 하나뿐.
          <ShellMain
            date={date}
            categories={categoriesWithHistory}
            categoriesPending={categoriesPending}
            todosFirstLoading={todosFirstLoading}
            todosEmpty={summary.total === 0}
            showBottomAdd={hasBottomAddButton(panels.layout)}
            failureCard={failureCard}
            onCreateCategory={handleCreateCategory}
            onStartTimer={startTimerForTodo}
            header={header}
          />
        )}
      </div>

      <ShellGlobals onBackup={openBackupDialog} />

      <ShellOverlays
        categories={categoriesWithHistory}
        layout={panels.layout}
        sidebarPinned={panels.sidebarPinned}
        onToggleSidebarPinned={panels.toggleSidebarPinned}
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
        exportBackup={exportBackup}
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
