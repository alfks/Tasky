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

    const { container } = render(<DateStrip summaryRevision={0} />);
    expect(screen.getAllByRole('radio')).toHaveLength(7);
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(dotCount(container)).toBe(0);

    await waitFor(() => expect(dotCount(container)).toBe(1));
  });

  it('보이는 주가 바뀌면 그 주 7일 범위로 다시 조회한다', async () => {
    const ranges = stub();
    useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });
    render(<DateStrip summaryRevision={0} />);
    await waitFor(() => expect(ranges).toEqual(['2026-09-14~2026-09-20']));

    await act(async () => {
      useDateStripStore.getState().shiftSelected(7);
    });
    await waitFor(() => expect(ranges).toEqual(['2026-09-14~2026-09-20', '2026-09-21~2026-09-27']));
  });

  it('같은 주 안에서 날짜만 바꾸면 다시 조회하지 않는다', async () => {
    const ranges = stub();
    useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });
    render(<DateStrip summaryRevision={0} />);
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

    const { container } = render(<DateStrip summaryRevision={0} onSummaryError={onSummaryError} />);
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
    const { container } = render(<DateStrip summaryRevision={0} />);
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

    const { container } = render(<DateStrip summaryRevision={0} />);
    await waitFor(() => expect(dotCount(container)).toBe(2));
    expect(calls).toEqual([{ includeClosed: true }]);
  });
});

describe('R7. 삭제된 카테고리의 투두도 원래 색 점을 받는다', () => {
  const ACTIVE = makeCategory({ seq: 1 });
  const REMOVED = makeCategory({
    seq: 2,
    color: '#FFB38A',
    deletedAt: '2026-09-02T00:00:00.000Z',
  });

  /** 살아 있는 조회는 툼스톤을 감추고, 툼스톤은 `listDeletedByIds` 로만 나오는 저장소 스텁. */
  function stubWithDeleted() {
    const askedFor: string[][] = [];
    const base = createMemoryRepositories();
    setRepositories({
      ...base,
      todos: {
        ...base.todos,
        listByDateRange: () =>
          Promise.resolve([
            makeTodo({ seq: 1, date: TODAY, categoryId: ACTIVE.id }),
            makeTodo({ seq: 2, date: TODAY, categoryId: REMOVED.id }),
          ]),
      },
      categories: {
        ...base.categories,
        // ADR-0007 결정 4 그대로 — 살아 있는 조회에는 툼스톤이 없다.
        list: () => Promise.resolve([ACTIVE]),
        listDeletedByIds: (ids) => {
          askedFor.push([...ids]);
          return Promise.resolve([REMOVED].filter((c) => ids.includes(c.id)));
        },
      },
    });
    return askedFor;
  }

  const colorsOf = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLElement>('[style*="--cat-color"]')].map((el) =>
      el.style.getPropertyValue('--cat-color'),
    );

  it('활성 1 + 삭제됨 1 이 점 2개가 되고 삭제된 쪽도 제 색을 유지한다', async () => {
    stubWithDeleted();
    useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });

    const { container } = render(<DateStrip summaryRevision={0} />);

    // 음성 대조: 저장소가 툼스톤을 감추던 시절에는 점이 1개뿐이었다.
    await waitFor(() => expect(dotCount(container)).toBe(2));
    // 순서는 활성 → 삭제됨 (R7). 중립색이 아니라 원래 색이어야 한다.
    expect(colorsOf(container)).toEqual([ACTIVE.color, '#FFB38A']);
  });

  it('툼스톤 조회에는 살아 있는 목록에서 못 찾은 id 만 실린다', async () => {
    const askedFor = stubWithDeleted();
    useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });

    const { container } = render(<DateStrip summaryRevision={0} />);
    await waitFor(() => expect(dotCount(container)).toBe(2));

    expect(askedFor).toEqual([[REMOVED.id]]);
  });

  it('지워진 카테고리를 참조하는 투두가 없으면 툼스톤 조회 자체가 나가지 않는다', async () => {
    const askedFor: string[][] = [];
    const base = createMemoryRepositories();
    setRepositories({
      ...base,
      todos: {
        ...base.todos,
        listByDateRange: () =>
          Promise.resolve([makeTodo({ seq: 1, date: TODAY, categoryId: ACTIVE.id })]),
      },
      categories: {
        ...base.categories,
        list: () => Promise.resolve([ACTIVE]),
        listDeletedByIds: (ids) => {
          askedFor.push([...ids]);
          return Promise.resolve([]);
        },
      },
    });
    useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });

    const { container } = render(<DateStrip summaryRevision={0} />);
    await waitFor(() => expect(dotCount(container)).toBe(1));

    expect(askedFor).toEqual([]);
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

    const { container } = render(<DateStrip summaryRevision={0} onSummaryError={onSummaryError} />);
    await waitFor(() => expect(dotCount(container)).toBe(1));

    shouldFail = true;
    await act(async () => {
      useDateStripStore.getState().shiftSelected(7);
    });

    await waitFor(() => expect(onSummaryError).toHaveBeenCalledWith(SUMMARY_ERROR_MESSAGE));
    expect(dotCount(container)).toBe(0);
  });
});

describe('R8. 저장소가 바뀌면 같은 주를 다시 읽는다 (T-56)', () => {
  it('보이는 주가 그대로여도 revision 이 바뀌면 같은 범위로 다시 조회한다', async () => {
    const ranges = stub();
    useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });
    const { rerender } = render(<DateStrip summaryRevision={0} />);
    await waitFor(() => expect(ranges).toEqual(['2026-09-14~2026-09-20']));

    await act(async () => {
      rerender(<DateStrip summaryRevision={1} />);
    });

    await waitFor(() => expect(ranges).toEqual(['2026-09-14~2026-09-20', '2026-09-14~2026-09-20']));
  });

  it('revision 이 그대로면 다시 렌더해도 조회하지 않는다', async () => {
    const ranges = stub();
    useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });
    const { rerender } = render(<DateStrip summaryRevision={3} />);
    await waitFor(() => expect(ranges).toHaveLength(1));

    await act(async () => {
      rerender(<DateStrip summaryRevision={3} />);
    });

    expect(ranges).toHaveLength(1);
  });
});

describe('§2-C. 다시 읽는 동안에도 이전 점이 그대로 있다 (T-56)', () => {
  /**
   * 두 번째 조회부터 붙잡아 두는 스텁. **붙잡혀 있는 동안 화면이 무엇을 보여주는가**가 이 절의 전부다.
   * 투두는 getter 로 읽어 재조회가 실제로 **다른 결과**를 가져오게 한다(안 그러면 전후를 못 가른다).
   */
  function stubGated(read: () => Todo[], categories: () => Category[]) {
    let calls = 0;
    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const base = createMemoryRepositories();
    setRepositories({
      ...base,
      todos: {
        ...base.todos,
        listByDateRange: async (from, to) => {
          calls += 1;
          if (calls > 1) await gate;
          return read().filter((todo) => todo.date >= from && todo.date <= to);
        },
      },
      categories: { ...base.categories, list: () => Promise.resolve(categories()) },
    });
    return { open: () => open() };
  }

  it('revision 이 올라 재조회하는 동안 이전 점이 사라지지 않는다', async () => {
    const one = makeCategory({ seq: 1 });
    const two = makeCategory({ seq: 2 });
    let todos = [makeTodo({ seq: 1, date: TODAY, categoryId: one.id })];
    let categories = [one];
    const { open } = stubGated(
      () => todos,
      () => categories,
    );
    useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });

    const { container, rerender } = render(<DateStrip summaryRevision={0} />);
    await waitFor(() => expect(dotCount(container)).toBe(1));

    todos = [...todos, makeTodo({ seq: 2, date: TODAY, categoryId: two.id })];
    categories = [one, two];
    await act(async () => {
      rerender(<DateStrip summaryRevision={1} />);
    });

    // 여기가 이 테스트의 전부: 새 값이 아직 안 왔는데 **이전 점이 그대로** 있다.
    // 재조회 때도 비우면 이 줄에서 0 이 된다.
    expect(dotCount(container)).toBe(1);

    await act(async () => {
      open();
      await Promise.resolve();
    });
    await waitFor(() => expect(dotCount(container)).toBe(2));
  });

  it('재조회가 실패해도 이미 보이던 점은 남는다 — 알리는 것은 토스트뿐이다', async () => {
    let shouldFail = false;
    const base = createMemoryRepositories();
    setRepositories({
      ...base,
      todos: {
        ...base.todos,
        listByDateRange: (from, to) =>
          shouldFail
            ? Promise.reject(new Error('조회 실패'))
            : Promise.resolve([makeTodo({ seq: 1, date: TODAY, categoryId: CATEGORY.id })]).then(
                (todos) => todos.filter((todo) => todo.date >= from && todo.date <= to),
              ),
      },
      categories: {
        ...base.categories,
        list: () =>
          shouldFail ? Promise.reject(new Error('조회 실패')) : Promise.resolve([CATEGORY]),
      },
    });
    useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });
    const onSummaryError = vi.fn();

    const { container, rerender } = render(
      <DateStrip summaryRevision={0} onSummaryError={onSummaryError} />,
    );
    await waitFor(() => expect(dotCount(container)).toBe(1));

    shouldFail = true;
    await act(async () => {
      rerender(<DateStrip summaryRevision={1} onSummaryError={onSummaryError} />);
    });

    await waitFor(() => expect(onSummaryError).toHaveBeenCalledWith(SUMMARY_ERROR_MESSAGE));
    expect(dotCount(container)).toBe(1);
  });
});
