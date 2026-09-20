'use client';

import { useEffect, useRef } from 'react';

import type { Category } from '@/domain/category/category';
import type { DateKey } from '@/domain/date/date-key';

import { useDateStripStore } from '@/features/date-strip';
import { CategoryRatioCard } from '@/features/reports/components/CategoryRatioCard';
import { FocusTimeCard } from '@/features/reports/components/FocusTimeCard';
import { HeatmapCard } from '@/features/reports/components/HeatmapCard';
import { PeriodToggle } from '@/features/reports/components/PeriodToggle';
import { ReportsCard } from '@/features/reports/components/ReportsCard';
import { StreakCard } from '@/features/reports/components/StreakCard';
import { TrendChart } from '@/features/reports/components/TrendChart';
import { useReportsData } from '@/features/reports/hooks/useReportsData';
import type { ReportsPeriodData } from '@/features/reports/lib/period-summary';
import { useReportsStore } from '@/features/reports/store/reports-store';

import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';

import { isImeKey } from '@/lib/ime';

/** 카드 5장의 뼈대(로딩 §2). */
function ReportsSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-[var(--space-3)]">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-[96px]" />
      ))}
    </div>
  );
}

/**
 * `AppShell.tsx` 의 `ShellMain.SHELL_MAIN_ID` 와 **반드시 같은 문자열**이어야 한다(`SkipLink` 의
 * `#shell-main` 대상, "main 랜드마크는 하나" 불변식). `reports` 는 `shell` 을 import 할 수 없어
 * (shell → reports 는 이미 있으므로 반대 방향을 더하면 순환이다) 값만 복제한다 — 두 값이 갈리면
 * `AppShell.test.tsx` 의 랜드마크 테스트가 죽는다.
 */
const SHELL_MAIN_ID = 'shell-main';

/**
 * 통계 화면(stats.md §2). 커맨드 팔레트 "통계 보기"가 `useReportsStore.openReports()` 로 켠다.
 * 실제 마운트(메인 컬럼 전체 대체)는 `AppShell.tsx` 가 `open` 을 보고 이 컴포넌트로 `ShellMain` 을
 * 갈아 끼우는 방식으로 한다.
 *
 * 문서의 `h1` 은 앱 전체(`Tasky`) 하나뿐이라(`AppShell.tsx`) 여기 제목은 `h2` 다.
 */
export function ReportsScreen() {
  const closeReports = useReportsStore((state) => state.closeReports);
  const today = useDateStripStore((state) => state.today);
  const state = useReportsData();
  const mainRef = useRef<HTMLElement>(null);

  // 화면에 들어오면 포커스를 받는다 — `ShellMain`이 사라진 자리를 대신하는 랜드마크라, 열었을 때
  // 포커스가 그대로 `<body>`에 남거나 사라진 요소를 가리키지 않게 한다(§5, `ShellMain`의
  // `tabIndex=-1` 랜드마크·`asideRef`가 `revealAndFocus`로 받는 포커스와 같은 규약).
  useEffect(() => {
    mainRef.current?.focus();
  }, []);

  // Esc 로 닫는다(review m11) — 앱의 다른 모든 겹침(Dialog·팔레트·팝오버)이 Esc 로 닫히는 것과
  // 일관되게. `document` 리스너로 붙인다(`Dialog.tsx` 와 같은 방식) — `<main>` 은 비인터랙티브
  // 랜드마크라 JSX `onKeyDown` 을 달면 `jsx-a11y/no-noninteractive-element-interactions` 에 걸린다.
  // 화면 교체(오버레이가 아니다)라 레이어 스택은 없어, IME 조합 중만 걸러 낸다.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isImeKey(e)) return;
      closeReports();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeReports]);

  return (
    <main
      ref={mainRef}
      id={SHELL_MAIN_ID}
      tabIndex={-1}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-[var(--space-4)] overflow-y-auto px-[var(--space-4)] py-[var(--space-3)] outline-none"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-[var(--font-weight-semibold)] text-text">통계</h2>
        <IconButton label="통계 닫기" onClick={closeReports}>
          ✕
        </IconButton>
      </div>

      <PeriodToggle today={today} />

      {state.status === 'loading' ? <ReportsSkeleton /> : null}

      {state.status === 'error' ? (
        <ReportsCard title="통계">
          <p className="text-sm text-muted">불러오지 못했어요</p>
          <Button variant="outline" size="sm" onClick={state.reload}>
            다시 시도
          </Button>
        </ReportsCard>
      ) : null}

      {state.status === 'ready' ? (
        <ReportsCards data={state.data} categories={state.categories} today={today} />
      ) : null}
    </main>
  );
}

type ReportsCardsProps = {
  data: ReportsPeriodData;
  categories: readonly Category[];
  today: DateKey;
};

/** 카드 5장(§2 레이아웃). 데이터는 이미 한 번의 조회로 다 왔다(R7) — 여기서는 그리기만 한다. */
function ReportsCards({ data, categories, today }: ReportsCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-[var(--space-3)] sm:grid-cols-2">
      <ReportsCard title="달성률 추이">
        <TrendChart points={data.trend} />
      </ReportsCard>
      <ReportsCard title="카테고리 비율">
        <CategoryRatioCard counts={data.categoryBars} categories={categories} />
      </ReportsCard>
      <ReportsCard title="연속 달성">
        <StreakCard
          streak={data.streak}
          todayTotal={data.todayTotal}
          todayIsAllDone={data.todayIsAllDone}
        />
      </ReportsCard>
      <ReportsCard title="집중 시간">
        <FocusTimeCard
          totalSeconds={data.focusTotalSeconds}
          byTodo={data.focusByTodo}
          todoTitles={data.todoTitles}
        />
      </ReportsCard>
      <ReportsCard title="활동 히트맵" className="sm:col-span-2">
        <HeatmapCard weeks={data.heatmap} today={today} />
      </ReportsCard>
    </div>
  );
}
