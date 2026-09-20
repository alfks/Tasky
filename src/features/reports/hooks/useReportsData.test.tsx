// R7 회귀 고정: 저장소 조회가 기간 ∪ 히트맵 범위를 한 번씩만 읽는지 호출 횟수로 단언한다
// (T-85 코디네이터 정정 2 — "각 1회씩"은 호출 횟수를 세는 프록시 테스트로 고정한다).
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

/** 메서드별 호출 횟수를 세는 얇은 프록시. 값은 실제 memory 구현이 낸다 — 계산은 그대로 검증된다. */
function countingRepositories(base: Repositories): {
  repo: Repositories;
  counts: Map<string, number>;
} {
  const counts = new Map<string, number>();
  const wrap = <T extends object>(target: T): T =>
    new Proxy(target, {
      get(t, prop: string) {
        const value = Reflect.get(t, prop);
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          counts.set(prop, (counts.get(prop) ?? 0) + 1);
          return (value as (...a: unknown[]) => unknown).apply(t, args);
        };
      },
    });
  return {
    repo: { ...base, todos: wrap(base.todos), focusSessions: wrap(base.focusSessions) },
    counts,
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
    await waitFor(() => expect(counts.get('listByDateRange')).toBe(2));
  });
});

function dayOffset(dateKey: DateKey, days: number): DateKey {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` as DateKey;
}
