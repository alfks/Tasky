'use client';

// 사이드바 (app-shell.md §2-A · R1 `nav` · R12 하단 고정 영역 · R16~R18 면과 밀도).
// 순서(위→아래): 앱 이름(R12) → 카테고리 → 오늘의 기록(R6-b)
// → 도구 줄(R12) → 계정 블록(R12-a).
import type { Category } from '@/domain/category/category';
import type { CategoryId } from '@/domain/ids';

import { BackupLauncher } from '@/features/backup';
import { CategoryList } from '@/features/category';
import { useDateStripStore } from '@/features/date-strip';
import { DiaryCard } from '@/features/diary';
import { useRemovalReturnFocus } from '@/features/shell/hooks/useRemovalReturnFocus';
import { APP_NAME, titleDateLabel } from '@/features/shell/lib/title';
import { AccountBlockLauncher } from '@/features/sync';
import { ThemeModeToggle, ThemeSettingsPopover } from '@/features/theme';
import { RoutineManager } from '@/features/todo';

import { Button } from '@/components/ui/Button';
import { CARD_CLASS } from '@/components/ui/card-class';

import { cn } from '@/lib/cn';

/** `[고정]`/`[고정 해제]` 버튼의 표식 — 컬럼(`showTitle`)과 드로어 본문 첫 줄(`showPinToggle`)에
 * 하나씩 서지만 서로 다른 순간에만 존재하므로(고정이 켜지면 드로어가 닫히고 컬럼이 선다) 같은
 * 표식을 공유해도 안전하다. `ShellOverlays` 가 고정을 켠 뒤 사라지는 드로어 대신 포커스를 넘길
 * 곳(`Dialog` 의 `returnFocus`)을 이 표식으로 집는다. */
export const SIDEBAR_PIN_TOGGLE_ATTR = 'data-shell-sidebar-pin-toggle';

type ShellSidebarProps = {
  /** 드로어 안에서는 `false` — 제목은 드로어가 갖는다(문서에 `h1` 은 하나여야 한다). */
  showTitle: boolean;
  /**
   * 드로어 본문 **첫 줄**에 `[고정]` 토글을 낼지 — `showTitle` 이 거짓일 때만 뜻이 있다(리뷰
   * Major 2). `showTitle` 이 참이면(컬럼) 이미 그 줄에서 제목과 함께 항상 낸다. 대화상자의
   * `title`(`<h2>`, `aria-labelledby`) 안에 이 버튼을 넣던 예전 방식은 드로어의 접근 이름이
   * 토글마다 "Tasky 사이드바 고정" ↔ "Tasky 사이드바 고정 해제" 로 바뀌게 했다 — 제목은 대화상자
   * 하나를 가리키는 고정된 이름이어야 한다. `ShellOverlays` 가 `canPinSidebar(layout)` 일 때만
   * 참을 넘긴다.
   */
  showPinToggle?: boolean;
  /** 지금 고정돼 있는가. `showTitle`·`showPinToggle` 어느 쪽이든 이 값을 함께 받는다. */
  sidebarPinned: boolean;
  /** `[고정]`/`[고정 해제]` 를 눌렀을 때. 포커스 인계(컬럼 → 드로어 오프너)는 `useShellPanels
   * .toggleSidebarPinned` 가 이미 갖고 있다 — 여기서 다시 구현하지 않는다(리뷰 Major 4, 두 벌이던
   * `handoffFocus` 호출을 하나로 모은다). */
  onTogglePinned: () => void;
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
  onOpenSocial?: () => void;
};

export function ShellSidebar({
  showTitle,
  showPinToggle = false,
  sidebarPinned,
  onTogglePinned,
  framed = false,
  categories,
  onSelectCategory,
  onRemoveCategory,
  exportBackup,
  onOpenSocial,
}: ShellSidebarProps) {
  // 루틴 삭제로 그 행이 사라진 뒤 포커스가 `<body>` 로 떨어지지 않게(app-shell R14) — 카테고리
  // 삭제가 쓰는 것과 같은 헬퍼, 인스턴스만 이 사이드바 전용으로 새로 둔다.
  // `preferToast: false` — 루틴 삭제는 자기 되돌리기 토스트를 띄우지 않는다(routine.md R10). 기본
  // 값(true)을 그대로 쓰면 이 삭제와 무관하게 화면에 떠 있는 **다른** 토스트(예: 방금 만든 루틴의
  // 등록 성공 `[되돌리기]`)의 버튼으로 포커스가 튀어, 거기서 Enter 를 누르면 루틴 삭제가 아니라
  // 그 등록을 되돌린다(리뷰 #104 Major 실측 — 파괴적이라 반드시 꺼야 한다).
  const routineRemovalFocus = useRemovalReturnFocus({ preferToast: false });
  // 오늘의 기록은 **선택 날짜**의 기록이다(diary.md §2) — 소유자는 스트립 스토어(calendar-layout R21),
  // 오늘 판정도 같은 스토어의 `today`(자정 갱신 R12)라 여기서 시계를 다시 읽지 않는다.
  const selectedDate = useDateStripStore((state) => state.selectedDate);
  const today = useDateStripStore((state) => state.today);
  // 프로필 카드의 이름 폴백(profile.md R10) — 계정 블록과 같은 출처(`SyncState.userEmail`). `profile`
  // 은 `sync` 를 import 할 수 없어(lazy-boundary §D-10) 조립하는 여기서 읽어 내린다.
  const showPinRow = showTitle || showPinToggle;
  /*
   * `aria-pressed` 를 **일부러 쓰지 않는다.** 글자 자체가 "사이드바 고정" ↔ "사이드바 고정 해제"
   * 로 지금 상태와 누르면 바뀔 상태를 함께 말한다 — `aria-pressed` 를 더하면 "고정 해제, 눌림" 처럼
   * 같은 상태를 두 번 낭독한다(리뷰 Major). 선례: `date-strip/components/DateStripHeader.tsx` 의 주/월 토글.
   */
  const pinToggleLabel = `사이드바 ${sidebarPinned ? '고정 해제' : '고정'}`;

  return (
    <nav
      aria-label="사이드바"
      className="flex h-full min-h-0 flex-col gap-[var(--space-3)] overflow-hidden"
    >
      {showPinRow ? (
        <div
          className={cn(
            'flex shrink-0 items-center gap-[var(--space-2)] px-[var(--space-2)]',
            showTitle ? 'justify-between' : 'justify-end',
          )}
        >
          {showTitle ? <h1 className="text-lg font-bold text-text">{APP_NAME}</h1> : null}
          <Button
            {...{ [SIDEBAR_PIN_TOGGLE_ATTR]: '' }}
            variant="ghost"
            size="sm"
            onClick={onTogglePinned}
          >
            {pinToggleLabel}
          </Button>
        </div>
      ) : null}

      {/*
        카테고리와 오늘의 기록은 **한 스크롤 영역** 안에 자연 높이(R16)
        로 쌓인다. 카드마다 안쪽 스크롤을 두면 컬럼이 짧을 때(1280×720·600) 셋이 동시에 60~100px
        "구멍" 이 되어 `[+ 기록하기]` 가 스크롤바 표식도 없는 상자 안으로 숨었다(리뷰 Major 2). 영역
        자체는 `shrink` 라 내용이 맞으면 자연 높이(도구 줄이 바로 아래 붙는다, R20), 넘칠 때만 통째로
        스크롤한다 — 드로어(`Dialog`)와 같은 문법. 드로어에서는 껍질이 없어 맨 왼쪽에 붙은 버튼의
        포커스 링(2px + offset 2px)이 스크롤 상자에 잘리므로 `--space-1` 만큼 안쪽 여백을 준다.
        오늘의 기록 카드의 마운트 지점은 앱에서 여기 **하나**다(diary R7 — 컬럼 또는 드로어 하나만 선다).
      */}
      <div
        className={cn(
          'flex min-h-0 shrink flex-col gap-[var(--space-3)] overflow-y-auto',
          framed ? null : 'px-[var(--space-1)]',
        )}
      >
        <div data-shell-sidebar-card="" className={framed ? CARD_CLASS : undefined}>
          <CategoryList onSelect={onSelectCategory} onRemove={onRemoveCategory} />
        </div>
        <DiaryCard
          date={selectedDate}
          framed={framed}
          dateLabel={selectedDate === today ? undefined : titleDateLabel(selectedDate)}
        />
      </div>

      {/*
        도구 줄 (R12: 테마 토글 · 설정 · 백업/복원 · 루틴)과 아래 계정 블록은 스크롤 영역 밖(`shrink-0`)
        — 카드가 길어져도 밀려나지 않는다. **컬럼에서는 카드 바로 아래에 붙인다(R12·R20)**: `mt-auto`
        로 바닥에 붙이면 카드 사이에 빈 띠가 갇힌다(실측 538px, FEEL_REPORT §9-2 A). 드로어는 그대로
        `mt-auto` — 거기서는 도구 줄이 카드가 아니라 대화상자의 발(캔버스 + 구분선, R17)이라 바닥이
        손가락에 가깝다.
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
        {onOpenSocial === undefined ? null : (
          <Button variant="ghost" className="justify-start" onClick={onOpenSocial}>
            친구
          </Button>
        )}
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
