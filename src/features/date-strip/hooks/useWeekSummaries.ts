'use client';

// 보이는 주 7일의 요약(점·✓) 조회 (date-strip.md §2-C·§4·R7·R8).
//
// 셀·숫자는 즉시 그리고 요약만 늦게 붙는다 — 그래서 로딩 상태를 따로 내보내지 않고 `undefined`
// 하나로 "아직 없음"을 표현한다(스켈레톤 없음, §2-C). 조회 실패도 같은 `undefined` 라 점이 사라진다.
import { useEffect, useRef, useState } from 'react';

import type { DateKey } from '@/domain/date/date-key';

import { getRepositories } from '@/repositories/container';

import { summarizeWeek, type DaySummary } from '@/features/date-strip/lib/summary';
import { weekDays } from '@/features/date-strip/lib/week';

/** 요약 조회 실패 시 앱 셸 토스트에 띄울 문구 (§2-C). 토스트 자체는 앱 셸 소관이다. */
export const SUMMARY_ERROR_MESSAGE = '날짜별 요약을 불러오지 못했어요. 다시 시도해 주세요.';

/**
 * `weekStart` 가 속한 주 7일의 요약. 아직 못 읽었거나 실패하면 `undefined`.
 * `onError` 는 실패할 때 한 번 불린다(렌더 중이 아니라 비동기 경로에서).
 */
export function useWeekSummaries(
  weekStart: DateKey,
  onError?: (message: string) => void,
): Map<DateKey, DaySummary> | undefined {
  const [summaries, setSummaries] = useState<Map<DateKey, DaySummary> | undefined>(undefined);
  // 콜백 정체성이 바뀌어도 재조회하지 않게 ref 로 받는다 — 호출부가 useCallback 을 쓰도록 강요하지 않는다.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    const days = weekDays(weekStart);
    setSummaries(undefined);

    const { todos, categories } = getRepositories();
    Promise.all([
      todos.listByDateRange(days[0], days[days.length - 1]),
      // 종료된 카테고리의 투두도 점으로 세야 한다 (R7).
      categories.list({ includeClosed: true }),
    ])
      .then(([todoList, categoryList]) => {
        if (cancelled) return;
        setSummaries(summarizeWeek(days, todoList, categoryList));
      })
      .catch(() => {
        if (cancelled) return;
        setSummaries(undefined);
        onErrorRef.current?.(SUMMARY_ERROR_MESSAGE);
      });

    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  return summaries;
}
