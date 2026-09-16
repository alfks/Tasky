'use client';

// 사이드바 (app-shell.md §2-A · R1 `nav` · R12 하단 고정 영역).
//
// 상단에는 **앱 이름만** 둔다(R12). 진입점은 하단 셋(테마 토글 · 설정 · 백업/복원)이 전부이고
// 여기에 다른 버튼을 더하지 않는다 — 레퍼런스 앱의 헤더가 답답했던 이유가 그것이다.
import type { Category } from '@/domain/category/category';
import type { CategoryId } from '@/domain/ids';

import { BackupLauncher } from '@/features/backup';
import { CategoryList } from '@/features/category';
import { APP_NAME } from '@/features/shell/lib/title';
import { ThemeModeToggle, ThemeSettingsPopover } from '@/features/theme';

type ShellSidebarProps = {
  /** 드로어 안에서는 `false` — 제목은 드로어가 갖는다(문서에 `h1` 은 하나여야 한다). */
  showTitle: boolean;
  onSelectCategory: (id: CategoryId) => void;
  onRemoveCategory: (category: Category) => void;
};

export function ShellSidebar({ showTitle, onSelectCategory, onRemoveCategory }: ShellSidebarProps) {
  return (
    <nav
      aria-label="카테고리"
      className="flex h-full min-h-0 flex-col gap-[var(--space-3)] overflow-hidden"
    >
      {showTitle ? (
        <h1 className="px-[var(--space-2)] text-lg font-bold text-text">{APP_NAME}</h1>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <CategoryList onSelect={onSelectCategory} onRemove={onRemoveCategory} />
      </div>

      {/* 하단 고정 영역 (R12). 스크롤과 무관하게 항상 같은 자리에 있다. */}
      <div className="flex shrink-0 flex-col gap-[var(--space-1)] border-t border-border pt-[var(--space-2)]">
        <div className="flex items-center gap-[var(--space-1)] px-[var(--space-1)]">
          <ThemeModeToggle />
          <ThemeSettingsPopover />
        </div>
        <BackupLauncher />
      </div>
    </nav>
  );
}
