'use client';

// 사이드바 "루틴" 진입점 (routine.md §2 관리 화면). 본문(`RoutineManagerDialog` — 목록·`⋯` 메뉴·
// 드래그 순서 변경·낭독)은 파일만 갈랐고 **정적 import 다** — `BackupLauncher` 식 `lazy()` 를 일부러
// 쓰지 않는다. 실측(2026-09-29, `pnpm build`): 본문을 lazy 로 떼면 rolldown 이 본문과 진입이 나눠 쓰는
// 모듈(Dialog·Popover·Menu·DragHandle·`date-strip` 배럴·RoutineDialog·투두 스토어…) 52 kB 를 진입에서
// 떼어 공유 청크로 만들고 `routine.rules`·`category.rules` 도 갈라, gzip 문맥 손실로 진입 폐포
// 164,725 B(예산 164,000 초과)·네트워크 합 215,557 B(예산 210,000 초과)가 됐다. 정적으로 두면
// 162,259 / 209,763 B 로 둘 다 예산 안이다. 네트워크 합은 **모든** 청크의 합이라(`check-dist.mjs`)
// 지연 로드가 그 값을 줄이는 길은 애초에 없다 — 청크 경계 하나가 곧 추가 바이트다.
import { useState } from 'react';

import type { Category } from '@/domain/category/category';

import { RoutineManagerDialog } from '@/features/todo/components/RoutineManagerDialog';

type RoutineManagerProps = {
  /**
   * `TodoItem` 이 받는 것과 같은 목록(활성 + 종료, 삭제된 것 제외) — `todo` feature 가 `category`
   * feature 를 직접 import 하면 두 배럴이 서로를 참조해 순환이 생기므로(category → todo 는 이미
   * `useTodoGroup` 으로 존재한다) props 로 받는다. `AppShell` → `ShellSidebar` → 여기, 두 단계
   * prop-drilling — 감당할 만한 규모라 그대로 둔다(리뷰 #104 Nit, 백로그 T-89).
   */
  categories: readonly Category[];
  /** `⋯ → 삭제` 를 누른 순간, 아직 살아 있는 행에서 자리표를 뜬다(app-shell R14). */
  captureRemovalFocus?: () => void;
  /** 그 행이 사라진 뒤 대체 포커스 대상(`⋯` 가 이미 사라졌을 때만 쓰인다). */
  removalReturnFocus?: () => HTMLElement | null;
};

export function RoutineManager({
  categories,
  captureRemovalFocus,
  removalReturnFocus,
}: RoutineManagerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // 포커스 링·꼴은 같은 도구 줄의 `BackupLauncher` 그대로(theme.md §5 — 링을 두 종류로 만들지 않는다).
        className="flex w-full items-center gap-[var(--space-2)] rounded-[var(--radius-md)] px-[var(--space-3)] py-[var(--space-2)] text-left text-sm text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <span aria-hidden="true">🔁</span>
        <span>루틴</span>
      </button>

      {open ? (
        <RoutineManagerDialog
          categories={categories}
          onClose={() => setOpen(false)}
          captureRemovalFocus={captureRemovalFocus}
          removalReturnFocus={removalReturnFocus}
        />
      ) : null}
    </>
  );
}
