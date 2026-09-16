import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Category } from '@/domain/category/category';
import type { DateKey } from '@/domain/date/date-key';
import type { Todo } from '@/domain/todo/todo';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { DateStrip } from '@/features/date-strip/components/DateStrip';
import { SUMMARY_ERROR_MESSAGE } from '@/features/date-strip/hooks/useWeekSummaries';
import { useDateStripStore } from '@/features/date-strip/store/date-strip-store';
import { makeCategory } from '@/test/fixtures/category';
import { makeTodo, makeTodos } from '@/test/fixtures/todo';

const TODAY = '2026-09-17';
/** 2026-09-14(월)~09-20(일). 100건 픽스처를 한 주에 고르게 뿌리는 데 쓴다. */
const WEEK: DateKey[] = [
  '2026-09-14',
  '2026-09-15',
  '2026-09-16',
  '2026-09-17',
  '2026-09-18',
  '2026-09-19',
  '2026-09-20',
];
const CATEGORY = makeCategory();

/** 조회 호출을 세는 저장소 스텁. `fail` 이면 두 조회 모두 거부한다. */
function stub(options: { todos?: Todo[]; categories?: Category[]; fail?: boolean } = {}) {
  const todos = options.todos ?? [];
  const ranges: string[] = [];
  const base = createMemoryRepositories();
  setRepositories({
    ...base,
    todos: {
      ...base.todos,
      listByDateRange: (from, to) => {
        ranges.push(`${from}~${to}`);
        if (options.fail === true) return Promise.reject(new Error('조회 실패'));
        return Promise.resolve(todos.filter((todo) => todo.date >= from && todo.date <= to));
      },
    },
    categories: {
      ...base.categories,
      list: () =>
        options.fail === true
          ? Promise.reject(new Error('조회 실패'))
          : Promise.resolve(options.categories ?? [CATEGORY]),
    },
  });
  return ranges;
}

const dotCount = (container: HTMLElement) =>
  container.querySelectorAll('[style*="--cat-color"]').length;

afterEach(() => {
  vi.useRealTimers();
});

describe('§2-C. 셀·숫자는 즉시 그리고 요약(점·✓)만 늦게 붙는다', () => {
  it('요약이 도착하기 전에도 7칸과 날짜 숫자가 이미 있다', async () => {
    stub({ todos: makeTodos(2, () => ({ date: TODAY, categoryId: CATEGORY.id })) });
    useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });

    const { container } = render(<DateStrip />);
    expect(screen.getAllByRole('radio')).toHaveLength(7);
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(dotCount(container)).toBe(0);

    await waitFor(() => expect(dotCount(container)).toBe(1));
  });

  it('보이는 주가 바뀌면 그 주 7일 범위로 다시 조회한다', async () => {
    const ranges = stub();
    useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });
    render(<DateStrip />);
    await waitFor(() => expect(ranges).toEqual(['2026-09-14~2026-09-20']));

    await act(async () => {
      useDateStripStore.getState().shiftSelected(7);
    });
    await waitFor(() => expect(ranges).toEqual(['2026-09-14~2026-09-20', '2026-09-21~2026-09-27']));
  });

  it('같은 주 안에서 날짜만 바꾸면 다시 조회하지 않는다', async () => {
    const ranges = stub();
    useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });
    render(<DateStrip />);
    await waitFor(() => expect(ranges).toHaveLength(1));

    await act(async () => {
      useDateStripStore.getState().shiftSelected(1);
    });
    expect(ranges).toHaveLength(1);
  });
});

describe('§2-C. 요약 조회가 실패하면 점을 숨기고 앱 셸에 알린다', () => {
  it('실패 문구를 onSummaryError 로 넘기고 점은 그리지 않는다', async () => {
    stub({ fail: true });
    useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });
    const onSummaryError = vi.fn();

    const { container } = render(<DateStrip onSummaryError={onSummaryError} />);
    await waitFor(() => expect(onSummaryError).toHaveBeenCalledWith(SUMMARY_ERROR_MESSAGE));
    expect(dotCount(container)).toBe(0);
    // 실패해도 셀은 남는다 — 스트립 자체가 사라지면 날짜를 바꿀 수 없다.
    expect(screen.getAllByRole('radio')).toHaveLength(7);
  });
});

describe('R10. 날짜를 바꾸면 100개 투두가 있어도 스트립이 즉시 다시 그려진다', () => {
  it('선택 변경 → 리렌더가 100ms 안에 끝난다(같은 주, 100건 픽스처)', async () => {
    const todos = makeTodos(100, (index) => ({
      date: WEEK[index % WEEK.length],
      categoryId: CATEGORY.id,
      done: index % 2 === 0,
    }));
    stub({ todos });
    useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });
    const { container } = render(<DateStrip />);
    await waitFor(() => expect(dotCount(container)).toBeGreaterThan(0));

    const started = performance.now();
    act(() => {
      useDateStripStore.getState().shiftSelected(1);
    });
    const elapsed = performance.now() - started;

    expect(screen.getByRole('radio', { name: /^9월 18일 금요일/ })).toBeChecked();
    // 실측값은 PR 본문에 적는다. 상한은 R10 의 100ms 그대로 두되 CI 편차를 고려해 이 단언만으로
    // 성능을 보장한다고 주장하지 않는다 — jsdom 은 실제 페인트를 하지 않는다.
    expect(elapsed).toBeLessThan(100);
  });
});

describe('R7. 종료된 카테고리의 투두도 점을 받는다', () => {
  /** 활성만/종료 포함을 실제로 구분하는 저장소 스텁. 호출 인자도 함께 기록한다. */
  function stubWithClosed() {
    const active = makeCategory({ seq: 1 });
    const closed = makeCategory({
      seq: 2,
      status: 'completed',
      closedAt: '2026-09-01T00:00:00.000Z',
    });
    const calls: ({ includeClosed?: boolean } | undefined)[] = [];
    const base = createMemoryRepositories();
    setRepositories({
      ...base,
      todos: {
        ...base.todos,
        listByDateRange: () =>
          Promise.resolve([
            makeTodo({ seq: 1, date: TODAY, categoryId: active.id }),
            makeTodo({ seq: 2, date: TODAY, categoryId: closed.id }),
          ]),
      },
      categories: {
        ...base.categories,
        list: (options) => {
          calls.push(options);
          return Promise.resolve(options?.includeClosed === true ? [active, closed] : [active]);
        },
      },
    });
    return { calls, active, closed };
  }

  it('종료 포함으로 조회해 활성 1 + 종료 1 이 점 2개가 된다', async () => {
    const { calls } = stubWithClosed();
    useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });

    const { container } = render(<DateStrip />);
    await waitFor(() => expect(dotCount(container)).toBe(2));
    expect(calls).toEqual([{ includeClosed: true }]);
  });
});

describe('§2-C. 조회에 실패하면 앞 주의 점이 새어 나오지 않는다', () => {
  it('성공한 주에서 실패한 주로 옮기면 점이 남김없이 사라진다', async () => {
    const todos = makeTodos(2, () => ({ date: TODAY, categoryId: CATEGORY.id }));
    let shouldFail = false;
    const base = createMemoryRepositories();
    setRepositories({
      ...base,
      todos: {
        ...base.todos,
        listByDateRange: (from, to) =>
          shouldFail
            ? Promise.reject(new Error('조회 실패'))
            : Promise.resolve(todos.filter((todo) => todo.date >= from && todo.date <= to)),
      },
      categories: {
        ...base.categories,
        list: () =>
          shouldFail ? Promise.reject(new Error('조회 실패')) : Promise.resolve([CATEGORY]),
      },
    });
    useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });
    const onSummaryError = vi.fn();

    const { container } = render(<DateStrip onSummaryError={onSummaryError} />);
    await waitFor(() => expect(dotCount(container)).toBe(1));

    shouldFail = true;
    await act(async () => {
      useDateStripStore.getState().shiftSelected(7);
    });

    await waitFor(() => expect(onSummaryError).toHaveBeenCalledWith(SUMMARY_ERROR_MESSAGE));
    expect(dotCount(container)).toBe(0);
  });
});
