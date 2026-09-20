// 선택된 기간의 통계 데이터를 읽어 온다(stats.md R7). 저장소는 기간 ∪ 히트맵 범위를 **한 번씩만**
// 읽고, 나머지 계산(추이·스트릭·카테고리·히트맵)은 전부 그 결과에서 메모리로 만든다
// (`buildReportsPeriodData`) — 날짜마다 개별 조회하지 않는다(date-strip R17 과 같은 원칙).
import { useEffect, useState } from 'react';

import type { Category } from '@/domain/category/category';
import type { DateKey } from '@/domain/date/date-key';

import { getRepositories } from '@/repositories/container';

import { useDateStripStore } from '@/features/date-strip';
import {
  datesInRange,
  heatmapWeeks,
  presetRange,
  unionFetchRange,
  type PeriodPreset,
  type PeriodRange,
} from '@/features/reports/lib/period';
import {
  buildReportsPeriodData,
  type ReportsPeriodData,
} from '@/features/reports/lib/period-summary';
import { useReportsStore } from '@/features/reports/store/reports-store';


export type ReportsLoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: ReportsPeriodData; categories: Category[] };

/** 선택된 프리셋/커스텀 범위를 실제 `[from, to]` 로. 아직 고르지 않은 custom 은 last7 로 대체한다. */
function resolvePeriod(
  preset: PeriodPreset,
  customRange: PeriodRange | null,
  today: DateKey,
): PeriodRange {
  if (preset === 'custom') return customRange ?? presetRange('last7', today);
  return presetRange(preset, today);
}

/**
 * 카테고리는 `@/features/category` 대신 저장소에서 직접 읽는다 — `command → reports → category →
 * todo → command` 같은 순환을 만들지 않기 위해서다(`CommandPalette.tsx` 의 `useCategoryNames` 와
 * 같은 이유·같은 패턴). `reports` 는 다른 feature 를 import 하지 않는다(date-strip 제외 — 리프라
 * 순환이 없다).
 */
export function useReportsData(): ReportsLoadState {
  const preset = useReportsStore((state) => state.preset);
  const customRange = useReportsStore((state) => state.customRange);
  const today = useDateStripStore((state) => state.today);

  const period = resolvePeriod(preset, customRange, today);
  const periodDays = datesInRange(period.from, period.to);
  const heatmapDays = heatmapWeeks(today);
  const fetchRange = unionFetchRange(period, heatmapDays);

  const [state, setState] = useState<ReportsLoadState>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    const { todos, focusSessions, categories } = getRepositories();
    Promise.all([
      todos.listByDateRange(fetchRange.from, fetchRange.to), // Todo 1회(R7)
      focusSessions.listByDateRange(period.from, period.to), // FocusSession 1회(R7) — 히트맵은 세션을 안 쓴다
      categories.list({ includeClosed: true }),
    ])
      .then(([todoList, sessionList, categoryList]) => {
        if (!alive) return;
        setState({
          status: 'ready',
          categories: categoryList,
          data: buildReportsPeriodData({
            period,
            periodDays,
            heatmapDays,
            todos: todoList,
            categories: categoryList,
            focusSessions: sessionList,
          }),
        });
      })
      .catch(() => {
        if (alive) setState({ status: 'error' });
      });
    return () => {
      alive = false;
    };
    // periodDays·heatmapDays·fetchRange 는 today·preset·customRange 에서 파생되고 매 렌더 새 배열이라
    // 의존성에 넣으면 무한 루프다 — 그것들을 만든 원시값(범위의 양끝)만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchRange.from, fetchRange.to, period.from, period.to]);

  return state;
}
