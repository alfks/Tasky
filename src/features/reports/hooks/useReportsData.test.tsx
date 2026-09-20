// R7 회귀 고정: 저장소 조회가 기간 ∪ 히트맵 ∪ 스트릭 고정 창(review 라운드2 m19) 범위를 한 번씩만
// 읽는지(또는 review M2 처럼 멀리 떨어져 있으면 나눠 읽는지) 호출 횟수·인자로 단언한다(T-85
// 코디네이터 정정 2 — "각 1회씩"은 호출 횟수를 세는 프록시 테스트로 고정한다).
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';
import { adopt } from '@/domain/meta';

import type { Repositories } from '@/repositories/container';
import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { useDateStripStore } from '@/features/date-strip';
import { useReportsData } from '@/features/reports/hooks/useReportsData';
import { useReportsStore } from '@/features/reports/store/reports-store';
import { makeCategory } from '@/test/fixtures/category';
import { makeFocusSession } from '@/test/fixtures/focus-session';
import { makeTodo } from '@/test/fixtures/todo';

/** 메서드별 호출 횟수·인자를 세는 얇은 프록시. 값은 실제 memory 구현이 낸다 — 계산은 그대로 검증된다. */
function countingRepositories(base: Repositories): {
  repo: Repositories;
  counts: Map<string, number>;
  todoCalls: unknown[][];
  focusCalls: unknown[][];
} {
  const counts = new Map<string, number>();
  const todoCalls: unknown[][] = [];
  const focusCalls: unknown[][] = [];
  const wrap = <T extends object>(target: T, calls: unknown[][] | null): T =>
    new Proxy(target, {
      get(t, prop: string) {
        const value = Reflect.get(t, prop);
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          counts.set(prop, (counts.get(prop) ?? 0) + 1);
          if (calls !== null && prop === 'listByDateRange') calls.push(args);
          return (value as (...a: unknown[]) => unknown).apply(t, args);
        };
      },
    });
  return {
    repo: {
      ...base,
      todos: wrap(base.todos, todoCalls),
      focusSessions: wrap(base.focusSessions, focusCalls),
    },
    counts,
    todoCalls,
    focusCalls,
  };
}

const TODAY: DateKey = '2026-09-20';
const INITIAL_REPORTS_STATE = useReportsStore.getState();

beforeEach(() => {
  useReportsStore.setState(INITIAL_REPORTS_STATE, true);
  useDateStripStore.setState({ today: TODAY, selectedDate: TODAY });
});

describe('useReportsData — 저장소 조회 횟수 (stats.md R7)', () => {
  it('1년치 픽스처에서도 todos·focusSessions 는 각각 listByDateRange 1회, listByDate 는 0회다', async () => {
    const category = makeCategory();
    const base = createMemoryRepositories();
    for (const todo of Array.from({ length: 366 }, (_, i) =>
      makeTodo({ seq: i + 1, date: dayOffset(TODAY, -i), categoryId: category.id }),
    )) {
      await base.todos.upsert(adopt(todo));
    }
    for (const session of Array.from({ length: 200 }, (_, i) =>
      makeFocusSession({ seq: i + 1, date: dayOffset(TODAY, -(i % 30)), status: 'completed' }),
    )) {
      await base.focusSessions.upsert(adopt(session));
    }
    await base.categories.upsert(adopt(category));

    const { repo, counts } = countingRepositories(base);
    setRepositories(repo);

    const { result } = renderHook(() => useReportsData());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(counts.get('listByDateRange')).toBe(2); // todos 1 + focusSessions 1
    expect(counts.get('listByDate')).toBeUndefined();
    expect(counts.get('listAll')).toBeUndefined();
  });

  it('기간 프리셋을 바꾸면 그 시점에 다시 각 1회씩만 읽는다', async () => {
    setRepositories(createMemoryRepositories());
    const { repo, counts } = countingRepositories(getRepositories());
    setRepositories(repo);

    const { result } = renderHook(() => useReportsData());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(counts.get('listByDateRange')).toBe(2);

    counts.clear();
    act(() => useReportsStore.getState().setPreset('thisYear'));
    // review m2(minor 회귀): 카운트 자체를 waitFor 조건으로 쓰면 "2에 도달한 순간" 통과해 버려
    // 그 뒤 3·4번째 호출을 못 잡는다. 카운트와 무관한 신호(새 기간의 trend 길이)로 정착을 기다린
    // 뒤, 그 시점의 카운트를 따로 단언한다.
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
      expect(result.current.status === 'ready' && result.current.data.trend.length).toBe(
        daysInThisYearUpTo(TODAY),
      );
    });
    expect(counts.get('listByDateRange')).toBe(2);
  });

  it('이전에 읽은 기간으로 되돌아가면 저장소를 다시 읽지 않는다(review m1 캐시)', async () => {
    setRepositories(createMemoryRepositories());
    const { repo, counts } = countingRepositories(getRepositories());
    setRepositories(repo);

    const { result } = renderHook(() => useReportsData());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => useReportsStore.getState().setPreset('thisYear'));
    await waitFor(() => {
      expect(result.current.status === 'ready' && result.current.data.trend.length).toBe(
        daysInThisYearUpTo(TODAY),
      );
    });

    counts.clear();
    act(() => useReportsStore.getState().setPreset('last7'));
    await waitFor(() => {
      expect(result.current.status === 'ready' && result.current.data.trend.length).toBe(7);
    });

    expect(counts.get('listByDateRange')).toBeUndefined();
  });

  it('today 가 월요일이면 히트맵 격자만으로는 84일을 못 채워, 조회 범위가 스트릭 고정 창까지 넓어진다(review 라운드3 m19 회귀 — TODAY(일요일) 케이스는 두 범위가 우연히 같아 m19 유무를 못 가른다)', async () => {
    const monday: DateKey = '2026-09-21'; // TODAY 는 일요일이라 heatmapDataRange === streakWindowRange 인 유일한 요일이다
    useDateStripStore.setState({ today: monday, selectedDate: monday });
    setRepositories(createMemoryRepositories());
    const { repo, todoCalls } = countingRepositories(getRepositories());
    setRepositories(repo);

    const { result } = renderHook(() => useReportsData());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // 프리셋(last7) 경로라 union 1회. to 는 히트맵이 항상 그 주(월~일) 전체를 배열에 담아
    // (heatmapWeeks 주석 "오늘 이후 날짜도 배열엔 있다") 이번 주 일요일(2026-09-27)이고, from 은
    // 히트맵 격자만으로는(2026-07-06) 84일을 못 채워 스트릭 고정 창(2026-06-30)까지 넓어져 있어야
    // 한다. m19 를 지우면(= heatmapDataRange 만으로 조회 범위를 정하면) from 이 2026-07-06 으로
    // 좁아져 이 값과 어긋난다.
    expect(todoCalls).toEqual([['2026-06-30', '2026-09-27']]);
  });

  it('custom 범위가 히트맵 창(최근 12주)과 멀리 떨어져 있으면 todos 를 그 두 범위로만 나눠 읽는다(review M2 — 사이 빈 구간은 읽지 않는다)', async () => {
    setRepositories(createMemoryRepositories());
    const { repo, todoCalls } = countingRepositories(getRepositories());
    setRepositories(repo);

    act(() =>
      useReportsStore.setState({
        preset: 'custom',
        customRange: { from: '2015-01-01', to: '2015-12-31' },
      }),
    );
    const { result } = renderHook(() => useReportsData());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(todoCalls).toHaveLength(2);
    const ranges = todoCalls.map(([from, to]) => `${String(from)}~${String(to)}`).sort();
    // 실제 필요한 두 범위(2015년 전체, 최근 12주)로만 나뉜다 — 그 사이 2016~2026-06 은 읽지 않는다.
    expect(ranges).toEqual(['2015-01-01~2015-12-31', '2026-06-29~2026-09-20']);
  });
});

describe('useReportsData — isFetching (review 라운드2 n7, 회귀 고정)', () => {
  it('최초 로딩 중엔 true, ready 가 되면 false 다', async () => {
    setRepositories(createMemoryRepositories());
    const { result } = renderHook(() => useReportsData());

    expect(result.current.isFetching).toBe(true);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.isFetching).toBe(false);
  });

  it('프리셋을 바꾸면(SWR 로 status 는 안 바뀌어도) 다시 읽는 동안 true 였다가 끝나면 false 로 돌아온다', async () => {
    setRepositories(createMemoryRepositories());
    const { result } = renderHook(() => useReportsData());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.isFetching).toBe(false);

    act(() => useReportsStore.getState().setPreset('thisYear'));
    // m17(SWR) 때문에 status 는 여전히 'ready' 다 — isFetching 만 이 순간 true 로 바뀐다(effect
    // 시작부에서 동기적으로 켠다). 이게 review m17 이 status 를 못 잡는 정확한 지점이다.
    expect(result.current.status).toBe('ready');
    expect(result.current.isFetching).toBe(true);

    await waitFor(() => {
      expect(result.current.status === 'ready' && result.current.data.trend.length).toBe(
        daysInThisYearUpTo(TODAY),
      );
    });
    expect(result.current.isFetching).toBe(false);
  });
});

function dayOffset(dateKey: DateKey, days: number): DateKey {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` as DateKey;
}

/** "올해"(1/1~오늘) 일수 — thisYear 프리셋 전환이 실제로 반영됐는지 판별하는 신호로 쓴다. */
function daysInThisYearUpTo(dateKey: DateKey): number {
  const [year] = dateKey.split('-');
  const from = new Date(`${year}-01-01T00:00:00`);
  const to = new Date(`${dateKey}T00:00:00`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
}
