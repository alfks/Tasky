'use client';

// 사이드바 (app-shell.md §2-A · R1 `nav` · R12 하단 고정 영역 · R16~R18 면과 밀도).
//
// 상단에는 **앱 이름만** 둔다(R12). 도구 줄은 테마 토글 · 설정 · 백업/복원 · **루틴**(routine.md §2,
// T-83) 넷이다 — R12 원문("하단 셋")은 이 티켓으로 넷째 진입점이 붙어 갱신이 필요하다(문서 갱신은
// 별도 `docs` 티켓 몫이라 여기서는 코드만 앞서 고친다).
import { useRef } from 'react';

import type { Category } from '@/domain/category/category';
import type { CategoryId } from '@/domain/ids';

import { BackupLauncher } from '@/features/backup';
import { CategoryList } from '@/features/category';
import { DRAWER_OPENER_ATTR } from '@/features/shell/components/ShellHeader';
import { useRemovalReturnFocus } from '@/features/shell/hooks/useRemovalReturnFocus';
import { APP_NAME } from '@/features/shell/lib/title';
import { useShellUiStore } from '@/features/shell/store/shell-ui-store';
import { AccountBlockLauncher } from '@/features/sync';
import { ThemeModeToggle, ThemeSettingsPopover } from '@/features/theme';
import { RoutineManager } from '@/features/todo';

import { Button } from '@/components/ui/Button';

import { cn } from '@/lib/cn';
import { handoffFocus } from '@/lib/focus-fallback';

/** `[고정]`/`[고정 해제]` 버튼의 표식 — 컬럼(이 파일)과 드로어 제목줄(`ShellOverlays`)에 각각 하나씩
 * 서지만 서로 다른 순간에만 존재하므로(고정이 켜지면 드로어 쪽이 닫히고 컬럼 쪽이 선다) 같은 표식을
 * 공유해도 안전하다. `ShellOverlays` 가 고정을 켠 뒤 사라지는 드로어 대신 포커스를 넘길 곳을
 * 찾을 때 이 표식으로 새로 선 컬럼의 버튼을 집는다(위 두 오프너 표식과 같은 이유). */
export const SIDEBAR_PIN_TOGGLE_ATTR = 'data-shell-sidebar-pin-toggle';

/**
 * 상시 카드 한 장 (app-shell.md §2-A "면과 고도" — 값의 단일 소스는 그 절이다).
 * 인사이트 패널(`ShellInsights` 의 `CARD_CLASS`)·투두 그룹 카드와 **같은 값**이다. 셋이 갈리면
 * 한 화면 안에서 면의 문법이 여러 벌이 된다 — 이 티켓 전의 화면이 정확히 그랬다(사이드바는 맨
 * 텍스트, 인사이트만 카드).
 */
const CARD_CLASS =
  'rounded-[var(--radius-xl)] border border-border bg-surface p-[var(--space-3)] shadow-sm';

type ShellSidebarProps = {
  /** 드로어 안에서는 `false` — 제목은 드로어가 갖는다(문서에 `h1` 은 하나여야 한다). */
  showTitle: boolean;
  /**
   * 내용을 **카드에 담을지**. 컬럼으로 섰을 때만 `true` 다(R17).
   *
   * 기본값이 `false` 인 이유: 감싸지 **않는** 쪽이 오버레이 안에서 옳다. 드로어는 대화상자가
   * 이미 자기 면(보더 + `--elev-md`)을 갖고 있어, 거기서 또 카드를 그리면 같은 색 면이 두 겹으로
   * 겹치고 보더만 한 줄 더 생긴다(면을 두 번 겹치지 않는다 — R18).
   */
  framed?: boolean;
  /** 루틴 관리 화면(RoutineManager)이 필요로 한다 — 출처·순환 회피 이유는 그 컴포넌트 주석. */
  categories: readonly Category[];
  onSelectCategory: (id: CategoryId) => void;
  onRemoveCategory: (category: Category) => void;
  /**
   * 계정 블록(로그아웃·계정 삭제)이 쓰는 내보내기. `AppShell` 이 `useBackupStore` 에서 만들어
   * prop 으로 내린다 — **리뷰 Major 3**: 이 컴포넌트는 사이드바가 컬럼일 때(또는 드로어를 연
   * 동안)만 마운트되므로, 여기서 직접 만들면 좁은 뷰포트에서 드로어를 한 번도 연 적 없는 세션엔
   * `exportBackup` 을 등록할 통로 자체가 없다(그 통로는 이제 `ShellOverlays` 의 항상-마운트
   * 오버레이가 갖는다 — `AppShell` 이 같은 함수를 이 prop 으로 여기에도, 그쪽에도 함께 내린다).
   */
  exportBackup: () => Promise<boolean>;
};

export function ShellSidebar({
  showTitle,
  framed = false,
  categories,
  onSelectCategory,
  onRemoveCategory,
  exportBackup,
}: ShellSidebarProps) {
  // 루틴 삭제로 그 행이 사라진 뒤 포커스가 `<body>` 로 떨어지지 않게(app-shell R14) — 카테고리
  // 삭제가 쓰는 것과 같은 헬퍼, 인스턴스만 이 사이드바 전용으로 새로 둔다.
  // `preferToast: false` — 루틴 삭제는 자기 되돌리기 토스트를 띄우지 않는다(routine.md R10). 기본
  // 값(true)을 그대로 쓰면 이 삭제와 무관하게 화면에 떠 있는 **다른** 토스트(예: 방금 만든 루틴의
  // 등록 성공 `[되돌리기]`)의 버튼으로 포커스가 튀어, 거기서 Enter 를 누르면 루틴 삭제가 아니라
  // 그 등록을 되돌린다(리뷰 #104 Major 실측 — 파괴적이라 반드시 꺼야 한다).
  const routineRemovalFocus = useRemovalReturnFocus({ preferToast: false });
  // `[고정 해제]` 자리(calendar-layout.md §5 "WU-3 의 [고정] 토글 자리" — 고정 컬럼일 때는 앱 이름
  // 옆). 이 컴포넌트가 `showTitle` 로 렌더될 때는 항상 `sidebarIsColumn`(= wide && 고정)이 참인
  // 상태라 여기서 다시 폭을 재지 않는다 — 드로어 쪽(≥1280 에서만 보이는 `[고정]`)은 `ShellOverlays`
  // 가 대화상자 제목줄에서 맡는다(그 자리는 이 컴포넌트가 그리지 않는, Dialog 소유의 영역이다).
  const sidebarPinned = useShellUiStore((s) => s.sidebarPinned);
  const toggleSidebarPinned = useShellUiStore((s) => s.toggleSidebarPinned);
  const navRef = useRef<HTMLElement>(null);

  /** 고정을 풀면 이 `nav` 전체가 사라지고 헤더에 `☰ 카테고리 열기` 가 대신 선다 — 포커스가 그
   * 컨트롤 안에 있었을 때만 후임(`DRAWER_OPENER_ATTR`)으로 넘긴다(app-shell R14, 접기 토글과 같은
   * 패턴 — `useShellPanels.collapseInsight` 참고). */
  function handleTogglePinned(): void {
    handoffFocus(navRef.current, `[${DRAWER_OPENER_ATTR}]`);
    toggleSidebarPinned();
  }

  return (
    <nav
      ref={navRef}
      aria-label="카테고리"
      className="flex h-full min-h-0 flex-col gap-[var(--space-3)] overflow-hidden"
    >
      {showTitle ? (
        <div className="flex shrink-0 items-center justify-between gap-[var(--space-2)] px-[var(--space-2)]">
          <h1 className="text-lg font-bold text-text">{APP_NAME}</h1>
          <Button
            {...{ [SIDEBAR_PIN_TOGGLE_ATTR]: '' }}
            variant="ghost"
            size="sm"
            aria-pressed={sidebarPinned}
            onClick={handleTogglePinned}
          >
            사이드바 {sidebarPinned ? '고정 해제' : '고정'}
          </Button>
        </div>
      ) : null}

      {/*
        목록 카드는 **내용 높이만큼만** 차지한다(R16). 컬럼을 채우려고 늘리면 카테고리 서너 개
        아래로 빈 흰 기둥이 서서, 고치려던 "비어 보임" 이 더 크게 돌아온다. 넘칠 때만 안에서
        스크롤한다(`min-h-0` + `overflow-y-auto`).
      */}
      <div
        data-shell-sidebar-card=""
        className={cn('min-h-0 shrink overflow-y-auto', framed ? CARD_CLASS : null)}
      >
        <CategoryList onSelect={onSelectCategory} onRemove={onRemoveCategory} />
      </div>

      {/*
        도구 줄 (R12: 테마 토글 · 설정 · 백업/복원). 스크롤 영역 밖이라 목록이 길어져도 밀려나지
        않는다(`shrink-0`).

        **컬럼일 때는 목록 카드 바로 아래에 붙인다 — 바닥으로 내려보내지 않는다(R12).**
        `mt-auto` 로 바닥에 붙이면 카드 두 장 **사이**에 빈 띠가 갇힌다: 투두 3~5건이 보통인
        이 앱에서 실측 538px(1440), 사이드바 높이의 3분의 2였다(FEEL_REPORT §9-2 A). 위아래가
        전부 카드로 막힌 공백은 "여백" 이 아니라 **레이아웃이 끝나지 않은 자리**로 읽힌다 —
        메인의 꼬리 공백(§2-A-2 가 "채우지 않는다" 고 정한 그것)과 다른 물건이다. 정보를 새로
        지어 채우는 대신 **띠를 꼬리로 옮긴다**: 카드는 위에서부터 쌓이고 남는 공간은 아래에
        모인다 — 메인 컬럼과 같은 문법이다.

        드로어(`framed === false`)는 그대로 `mt-auto` 다. 거기서는 도구 줄이 카드가 아니라
        대화상자의 발(캔버스 + 1px 구분선, R17)이라 공백을 가두지 않고, 오버레이의 바닥에
        붙어 있는 편이 손가락에 가깝다.
      */}
      <div
        className={cn(
          'flex shrink-0 flex-col gap-[var(--space-1)]',
          framed ? CARD_CLASS : 'mt-auto border-t border-border pt-[var(--space-2)]',
        )}
      >
        <div className="flex items-center gap-[var(--space-1)] px-[var(--space-1)]">
          <ThemeModeToggle />
          <ThemeSettingsPopover />
        </div>
        <BackupLauncher />
        <RoutineManager
          categories={categories}
          captureRemovalFocus={routineRemovalFocus.capture}
          removalReturnFocus={routineRemovalFocus.returnFocus}
        />
      </div>

      {/* 계정 블록은 세션에 종속된 상태라 나머지 진입점(도구 줄)과 분리해 사이드바 맨 끝에 둔다
          (sync.md §2, app-shell.md R12-a). */}
      <AccountBlockLauncher exportBackup={exportBackup} />
    </nav>
  );
}
