'use client';

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
 * 통계 화면(stats.md §2). 커맨드 팔레트 "통계 보기"가 `useReportsStore.openReports()` 로 켠다.
 *
 * **화면을 실제로 마운트하는 지점은 이 티켓의 owns 밖이다.** `AppShell.tsx`(셸)가 `open` 을 보고
 * 이 컴포넌트를 `ShellMain` 자리에 넣어야 "커맨드 팔레트로 화면 진입"이 완성되는데, 셸 파일은
 * T-85 owns 에 없다 — 이 컴포넌트는 그 배선을 기다리는 완제품이다(핸드오프 참고).
 */
export function ReportsScreen() {
  const closeReports = useReportsStore((state) => state.closeReports);
  const today = useDateStripStore((state) => state.today);
  const state = useReportsData();

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-[var(--space-4)] overflow-y-auto px-[var(--space-4)] py-[var(--space-3)]">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-[var(--font-weight-semibold)] text-text">통계</h1>
        <IconButton label="통계 닫기" onClick={closeReports}>
          ✕
        </IconButton>
      </div>

      <PeriodToggle today={today} />

      {state.status === 'loading' ? <ReportsSkeleton /> : null}

      {state.status === 'error' ? (
        <ReportsCard title="통계">
          <p className="text-sm text-muted">불러오지 못했어요</p>
          <Button variant="outline" size="sm" onClick={closeReports}>
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
        <StreakCard streak={data.streak} />
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
