'use client';

// 사이드바 (app-shell.md §2-A · R1 `nav` · R12 하단 고정 영역 · R16~R18 면과 밀도).
//
// 상단에는 **앱 이름만** 둔다(R12). 진입점은 하단 셋(테마 토글 · 설정 · 백업/복원)이 전부이고
// 여기에 다른 버튼을 더하지 않는다 — 레퍼런스 앱의 헤더가 답답했던 이유가 그것이다.
import type { Category } from '@/domain/category/category';
import type { CategoryId } from '@/domain/ids';

import { BackupLauncher } from '@/features/backup';
import { CategoryList } from '@/features/category';
import { APP_NAME } from '@/features/shell/lib/title';
import { ThemeModeToggle, ThemeSettingsPopover } from '@/features/theme';

import { cn } from '@/lib/cn';

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
  onSelectCategory: (id: CategoryId) => void;
  onRemoveCategory: (category: Category) => void;
};

export function ShellSidebar({
  showTitle,
  framed = false,
  onSelectCategory,
  onRemoveCategory,
}: ShellSidebarProps) {
  return (
    <nav
      aria-label="카테고리"
      className="flex h-full min-h-0 flex-col gap-[var(--space-3)] overflow-hidden"
    >
      {showTitle ? (
        <h1 className="shrink-0 px-[var(--space-2)] text-lg font-bold text-text">{APP_NAME}</h1>
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
      </div>
    </nav>
  );
}
