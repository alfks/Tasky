// 선택된 기간의 통계 데이터를 읽어 온다(stats.md R7). 저장소는 기간 ∪ 히트맵 범위를 **한 번씩만**
// 읽고(또는 review M2 처럼 두 범위가 멀리 떨어져 있으면 각각 한 번씩 나눠), 나머지 계산(추이·스트릭·
// 카테고리·히트맵)은 전부 그 결과에서 메모리로 만든다(`buildReportsPeriodData`) — 날짜마다 개별
// 조회하지 않는다(date-strip R17 과 같은 원칙).
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Category } from '@/domain/category/category';
import type { DateKey } from '@/domain/date/date-key';
import type { FocusSession } from '@/domain/focus/focus-session';
import type { Todo } from '@/domain/todo/todo';

import { getRepositories } from '@/repositories/container';

import { useDateStripStore } from '@/features/date-strip';
import {
  datesInRange,
  heatmapDataRange,
  heatmapWeeks,
  presetRange,
  shouldSplitTodoFetch,
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
  | { status: 'error'; reload: () => void }
  | { status: 'ready'; data: ReportsPeriodData; categories: Category[]; reload: () => void };

/** 선택된 프리셋/커스텀 범위를 실제 `[from, to]` 로. 아직 고르지 않은 custom 은 last7 로 대체한다. */
function resolvePeriod(
  preset: PeriodPreset,
  customRange: PeriodRange | null,
  today: DateKey,
): PeriodRange {
  if (preset === 'custom') return customRange ?? presetRange('last7', today);
  return presetRange(preset, today);
}

/** todos·focusSessions 조회 결과. 기간별로 캐시해 재조회를 건너뛰는 단위다(review m1). */
type FetchedRows = { todos: Todo[]; focusSessions: FocusSession[] };

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
  const heatmapRange = heatmapDataRange(heatmapDays);
  // 겹치거나 맞닿아 있으면 union 1회, 멀리 떨어져 있으면(review M2) 두 범위를 따로 읽는다.
  const splitFetch = shouldSplitTodoFetch(period, heatmapRange);
  const fetchRange = splitFetch ? null : unionFetchRange(period, heatmapDays);

  const [state, setState] = useState<ReportsLoadState>({ status: 'loading' });
  // 프리셋 왕복 캐시(review m1) — 화면이 열려 있는 동안만 산다(언마운트되면 사라진다). 이 화면은
  // 메인 컬럼 전체를 대체해 열려 있는 동안 투두 편집 UI가 동시에 보이지 않으므로, 그 사이 캐시가
  // 낡을 위험은 이 화면을 다시 여는 정도로 제한된다.
  const cacheRef = useRef(new Map<string, FetchedRows>());
  const [reloadNonce, setReloadNonce] = useState(0);
  const reload = useCallback(() => setReloadNonce((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    const { todos, focusSessions, categories } = getRepositories();

    const cacheKey = splitFetch
      ? `split:${period.from}~${period.to}|${heatmapRange.from}~${heatmapRange.to}`
      : `union:${fetchRange?.from}~${fetchRange?.to}`;
    const cached = cacheRef.current.get(cacheKey);

    const rowsPromise: Promise<FetchedRows> = cached
      ? Promise.resolve(cached)
      : Promise.all([
          splitFetch
            ? Promise.all([
                todos.listByDateRange(period.from, period.to), // Todo 1/2(R7·M2) — 선택 기간
                todos.listByDateRange(heatmapRange.from, heatmapRange.to), // Todo 2/2 — 히트맵 창
              ]).then(([periodTodos, heatmapTodos]) => [...periodTodos, ...heatmapTodos])
            : todos.listByDateRange(fetchRange!.from, fetchRange!.to), // Todo 1회(R7) — 겹치므로 union
          focusSessions.listByDateRange(period.from, period.to), // FocusSession 1회(R7) — 히트맵은 세션을 안 쓴다
        ]).then(([todoList, sessionList]) => {
          const rows: FetchedRows = { todos: todoList, focusSessions: sessionList };
          cacheRef.current.set(cacheKey, rows);
          return rows;
        });

    Promise.all([rowsPromise, categories.list({ includeClosed: true })])
      .then(([rows, categoryList]) => {
        if (!alive) return;
        setState({
          status: 'ready',
          categories: categoryList,
          data: buildReportsPeriodData({
            period,
            periodDays,
            heatmapDays,
            today,
            todos: rows.todos,
            categories: categoryList,
            focusSessions: rows.focusSessions,
          }),
          reload,
        });
      })
      .catch(() => {
        if (alive) setState({ status: 'error', reload });
      });
    // 이전 상태를 그대로 둔다(review m17, stale-while-revalidate) — 준비된 카드나 에러 카드가
    // 이미 있으면 그걸 유지한 채 뒤에서 다시 읽고, 끝나면 통째로 갈아 끼운다. 그래야 프리셋 탭을
    // 누를 때마다 카드 5장이 전부 스켈레톤으로 깜빡이지 않고(탭 하나 눌렀을 뿐인데 화면이
    // 사라졌다 나타나는 느낌이 없고), M3 의 "다시 시도"도 클릭 즉시 에러 카드가 사라지지 않아
    // 포커스를 잃지 않는다. 최초 마운트만 `useState` 초기값인 `{status:'loading'}` 그대로 보인다.
    return () => {
      alive = false;
    };
    // periodDays·heatmapDays·fetchRange·heatmapRange 는 today·preset·customRange 에서 파생되고 매
    // 렌더 새 배열/객체라 의존성에 넣으면 무한 루프다 — 그것들을 만든 원시값(범위의 양끝·분리
    // 여부)만 본다. reloadNonce 는 값 자체를 쓰지 않고 재실행 트리거로만 쓴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    period.from,
    period.to,
    heatmapRange.from,
    heatmapRange.to,
    splitFetch,
    fetchRange?.from,
    fetchRange?.to,
    today,
    reloadNonce,
    reload,
  ]);

  return state;
}
