import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Category } from '@/domain/category/category';
import type { DateKey } from '@/domain/date/date-key';
import type { Todo } from '@/domain/todo/todo';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { DateStrip } from '@/features/date-strip/components/DateStrip';
import { monthGridDays } from '@/features/date-strip/lib/month';
import {
  createInitialDateStripState,
  useDateStripStore,
} from '@/features/date-strip/store/date-strip-store';
import { makeCategory } from '@/test/fixtures/category';
import { makeTodo } from '@/test/fixtures/todo';

/** 2026-09-17(목). 9월은 화요일에 시작해 수요일에 끝나므로 격자가 8/31 ~ 10/4 로 앞뒤로 삐져나온다. */
const TODAY: DateKey = '2026-09-17';
/** 그 달 격자의 칸 수(5줄). `monthGridDays` 와 어긋나면 이 상수가 아니라 계산이 틀린 것이다. */
const GRID_CELLS = monthGridDays(TODAY).length;
const CATEGORY = makeCategory();

/**
 * 조회 범위를 기록하는 저장소 스텁. `todos` 배열을 **바깥에서 갈아끼울 수 있게** 돌려준다 —
 * 무효화(T-56)를 같은 마운트에서 보려면 저장소의 내용이 렌더 도중 바뀔 수 있어야 한다.
 */
function stub(initial: Todo[] = [], categories: Category[] = [CATEGORY]) {
  const state = { todos: initial };
  const ranges: string[] = [];
  const base = createMemoryRepositories();
  setRepositories({
    ...base,
    todos: {
      ...base.todos,
      listByDateRange: (from, to) => {
        ranges.push(`${from}~${to}`);
        return Promise.resolve(state.todos.filter((todo) => todo.date >= from && todo.date <= to));
      },
    },
    categories: { ...base.categories, list: () => Promise.resolve(categories) },
  });
  return { ranges, state };
}

async function renderMonth(props: Partial<Parameters<typeof DateStrip>[0]> = {}) {
  const result = render(<DateStrip summaryRevision={0} {...props} />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return result;
}

/** 보이는 범위가 바뀐 뒤의 요약 재조회를 끝까지 흘려보낸다 — 안 하면 테스트 밖에서 상태가 바뀐다(act 경고). */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const cellName = (pattern: RegExp) =>
  screen.getByRole('gridcell', { name: pattern }).getAttribute('aria-label');

beforeEach(() => {
  // 보기 전환이 기기별 저장(R14)을 쓴다 — 앞 테스트가 남긴 값이 `createInitialDateStripState()` 에 새지 않게.
  window.localStorage.clear();
  useDateStripStore.setState({ selectedDate: TODAY, today: TODAY, view: 'month' });
});

describe('R14. 주 보기와 월 보기를 버튼 하나로 오간다', () => {
  it('주 보기에서 [월 보기] 를 누르면 격자가, 다시 누르면 한 줄 스트립이 나온다', async () => {
    stub();
    useDateStripStore.setState({ view: 'week' });
    const user = userEvent.setup();
    await renderMonth();

    expect(screen.getAllByRole('radio')).toHaveLength(7);
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '월 보기로 전환' }));
    expect(screen.getByRole('grid', { name: '날짜 선택' })).toBeInTheDocument();
    expect(screen.getAllByRole('gridcell')).toHaveLength(GRID_CELLS);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: '주 보기로 전환' }));
    expect(screen.getAllByRole('radio')).toHaveLength(7);
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('보기를 바꿔도 선택 날짜는 그대로다', async () => {
    stub();
    useDateStripStore.setState({ view: 'week' });
    const user = userEvent.setup();
    await renderMonth();

    await user.click(screen.getByRole('button', { name: '월 보기로 전환' }));
    expect(useDateStripStore.getState().selectedDate).toBe(TODAY);
    expect(screen.getByRole('gridcell', { name: /^9월 17일 목요일/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('월 보기로 두고 스토어를 다시 만들면 월 보기다 — 보기는 기기별로 기억한다(R14)', async () => {
    // 새로고침 = 모듈 재평가 = 초기 상태 생성기의 결과가 그대로 첫 화면이다. 전환 버튼으로 월 보기를
    // 골라 뒀으면 이 값은 'month' 다. 선택 날짜는 여전히 오늘이다(R2) — 두 상태가 어긋나지 않는
    // 이유는 선택이 오늘이면 월 격자도 오늘이 든 달이기 때문이다.
    stub();
    useDateStripStore.setState({ view: 'week' });
    const user = userEvent.setup();
    await renderMonth();

    expect(createInitialDateStripState().view).toBe('week');
    await user.click(screen.getByRole('button', { name: '월 보기로 전환' }));
    expect(createInitialDateStripState().view).toBe('month');
    expect(createInitialDateStripState().selectedDate).toBe(createInitialDateStripState().today);
    await user.click(screen.getByRole('button', { name: '주 보기로 전환' }));
    expect(createInitialDateStripState().view).toBe('week');
  });
});

describe('R17. 월 격자의 요약도 한 번의 범위 조회로 읽는다', () => {
  it('칸이 28~42개여도 조회는 한 번이고 범위는 격자의 양끝이다', async () => {
    const { ranges } = stub();
    await renderMonth();

    // 8/31(월) ~ 10/4(일). 주 7일만 읽으면 이 단언이 죽는다 — 격자 밖 날짜가 요약 없이 남는다.
    expect(ranges).toEqual(['2026-08-31~2026-10-04']);
  });

  it('격자 끝자락(이 달 밖 날짜)의 투두도 점을 받는다', async () => {
    stub([
      makeTodo({ seq: 1, date: '2026-08-31' as DateKey, categoryId: CATEGORY.id }),
      makeTodo({ seq: 2, date: '2026-10-04' as DateKey, categoryId: CATEGORY.id }),
    ]);
    await renderMonth();

    // 주 조회(9/14~9/20)로 되돌리면 두 날 모두 요약이 없어 이 단언이 죽는다.
    await waitFor(() => {
      expect(cellName(/^8월 31일 월요일/)).toContain('할 일 1개 중 0개 완료');
    });
    expect(cellName(/^10월 4일 일요일/)).toContain('할 일 1개 중 0개 완료');
  });

  it('달을 옮기면 그 달의 범위로 다시 조회한다', async () => {
    const { ranges } = stub();
    const user = userEvent.setup();
    await renderMonth();

    await user.click(screen.getByRole('button', { name: '다음 달' }));
    await waitFor(() => {
      // 10월: 10/1(목) ~ 10/31(토) → 9/28(월) ~ 11/1(일).
      expect(ranges).toEqual(['2026-08-31~2026-10-04', '2026-09-28~2026-11-01']);
    });
  });
});

describe('T-56. 월 보기에서도 체크 한 번에 그 달 셀이 즉시 갱신된다', () => {
  it('같은 마운트에서 summaryRevision 이 바뀌면 셀 이름이 BEFORE 와 달라진다', async () => {
    const todo = makeTodo({ seq: 1, date: TODAY, categoryId: CATEGORY.id });
    const { state } = stub([todo]);
    const { rerender } = await renderMonth();

    await waitFor(() => {
      expect(cellName(/^9월 17일 목요일/)).toContain('할 일 1개 중 0개 완료');
    });
    // **같은 마운트**에서 전후를 비교한다. 재마운트해서 보면 의존성이 빠져도 새 조회가 돌아
    // 테스트가 살아남는다(T-45 가 걸린 함정).
    const before = cellName(/^9월 17일 목요일/);

    state.todos = [{ ...todo, done: true }];
    rerender(<DateStrip summaryRevision={1} />);

    await waitFor(() => {
      expect(cellName(/^9월 17일 목요일/)).not.toBe(before);
    });
    expect(cellName(/^9월 17일 목요일/)).toContain('할 일 1개 중 1개 완료');
  });

  it('갱신되는 동안 이미 보이던 점이 사라지지 않는다', async () => {
    const todo = makeTodo({ seq: 1, date: TODAY, categoryId: CATEGORY.id });
    const { state } = stub([todo]);
    const { container, rerender } = await renderMonth();
    const dots = () => container.querySelectorAll('[style*="--cat-color"]').length;

    await waitFor(() => expect(dots()).toBe(1));
    state.todos = [{ ...todo, done: true }];
    rerender(<DateStrip summaryRevision={1} />);
    // 재조회 중에도 0 으로 떨어지지 않는다 — 비우기는 "보이는 범위가 바뀌었다" 에만 묶여 있다.
    expect(dots()).toBe(1);

    // 재조회가 끝난 뒤에도 그대로다(점은 그대로, 바뀐 것은 ✓ 와 이름이다).
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(dots()).toBe(1);
  });
});

describe('R16. 월 보기 칸도 주 보기와 같은 언어를 쓴다', () => {
  it('셀 접근성 이름의 문장 형식이 주 보기와 같다', async () => {
    stub([
      makeTodo({ seq: 1, date: TODAY, categoryId: CATEGORY.id, done: true }),
      makeTodo({ seq: 2, date: TODAY, categoryId: CATEGORY.id }),
    ]);
    await renderMonth();

    await waitFor(() => {
      expect(cellName(/^9월 17일 목요일/)).toBe('9월 17일 목요일, 오늘, 할 일 2개 중 1개 완료');
    });
  });

  it('선택 상태는 이름이 아니라 aria-selected 가 전한다 (R11)', async () => {
    stub();
    await renderMonth();
    const cell = screen.getByRole('gridcell', { name: /^9월 17일 목요일/ });
    expect(cell).toHaveAttribute('aria-selected', 'true');
    expect(cell.getAttribute('aria-label')).not.toContain('선택');
  });

  it('요일은 격자 맨 위 columnheader 줄에서 한 번만 나온다', async () => {
    stub();
    await renderMonth();
    expect(screen.getAllByRole('columnheader').map((el) => el.textContent)).toEqual([
      '월',
      '화',
      '수',
      '목',
      '금',
      '토',
      '일',
    ]);
  });

  it('칸이 포커스를 받는 것만으로는 격자가 옮겨지지 않는다 — 마우스 순서(pointerdown → focus → click)', async () => {
    stub();
    await renderMonth();
    const monthLabel = screen.getByRole('button', { name: /2026년 9월/ });

    // 마우스: pointerdown → mousedown → focus → pointerup → click. focus 시점에 격자가 10월로 다시
    // 그려지면 click 이 떨어질 칸이 사라져 선택이 안 된다(실브라우저 재현 버그).
    const cell = screen.getByRole('gridcell', { name: /^10월 4일 일요일/ });
    fireEvent.pointerDown(cell);
    fireEvent.mouseDown(cell);
    act(() => cell.focus());
    expect(screen.getAllByRole('gridcell')).toHaveLength(GRID_CELLS);
    expect(monthLabel).toHaveTextContent('2026년 9월');
    expect(cell).toHaveFocus();

    fireEvent.pointerUp(cell);
    fireEvent.mouseUp(cell);
    fireEvent.click(cell);
    expect(useDateStripStore.getState().selectedDate).toBe('2026-10-04');
    await settle();
  });

  it('터치 순서(pointerdown → pointerup → mousedown → focus → mouseup → click)에서도 선택되고 격자가 그 달로 넘어간다', async () => {
    stub();
    await renderMonth();

    // 터치는 호환 마우스 이벤트가 pointerup **뒤에** 온다(리뷰 실측) — 포인터 플래그 방식은 여기서 무너졌다.
    const cell = screen.getByRole('gridcell', { name: /^10월 4일 일요일/ });
    fireEvent.pointerDown(cell, { pointerType: 'touch' });
    fireEvent.pointerUp(cell, { pointerType: 'touch' });
    fireEvent.mouseDown(cell);
    act(() => cell.focus());
    expect(screen.getAllByRole('gridcell')).toHaveLength(GRID_CELLS);
    expect(screen.getByRole('button', { name: /2026년 9월/ })).toBeInTheDocument();
    fireEvent.mouseUp(cell);
    fireEvent.click(cell);

    expect(useDateStripStore.getState().selectedDate).toBe('2026-10-04');
    expect(screen.getByRole('gridcell', { name: /^10월 4일 일요일/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // 10월 격자: 9/28(월) ~ 11/1(일) = 35칸, 월 표시도 10월이다.
    expect(screen.getAllByRole('gridcell')).toHaveLength(monthGridDays('2026-10-04').length);
    expect(screen.getByRole('button', { name: /2026년 10월/ })).toBeInTheDocument();
    expect(screen.queryByRole('gridcell', { name: /^8월 31일/ })).not.toBeInTheDocument();
    // 누른 칸은 새 격자에서도 같은 요소라 포커스 링이 그대로다.
    expect(screen.getByRole('gridcell', { name: /^10월 4일 일요일/ })).toHaveFocus();
    await settle();
  });

  it('이 달 밖 칸도 누르면 그 날짜가 선택된다 — 지난 달 쪽(userEvent 경로)', async () => {
    stub();
    const user = userEvent.setup();
    await renderMonth();

    await user.click(screen.getByRole('gridcell', { name: /^8월 31일 월요일/ }));
    expect(useDateStripStore.getState().selectedDate).toBe('2026-08-31');
    expect(screen.getByRole('button', { name: /2026년 8월/ })).toBeInTheDocument();
    await settle();
  });

  it('같은 달 칸의 포커스는 여전히 앵커를 옮긴다 — 누르고 밖에서 놓아도(클릭 불성립) → 는 그 칸에서 출발한다', async () => {
    stub();
    const user = userEvent.setup();
    await renderMonth();

    const cell = screen.getByRole('gridcell', { name: /^9월 4일 금요일/ });
    fireEvent.pointerDown(cell);
    fireEvent.mouseDown(cell);
    act(() => cell.focus());
    fireEvent.pointerUp(document.body);
    fireEvent.mouseUp(document.body);
    expect(useDateStripStore.getState().selectedDate).toBe(TODAY);

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('gridcell', { name: /^9월 5일 토요일/ })).toHaveFocus();
  });

  it('이 달 밖 칸에 포커스만 남은 채(누르고 밖에서 놓음) → 를 누르면 눈에 보이는 그 칸에서 출발한다', async () => {
    stub();
    const user = userEvent.setup();
    await renderMonth();

    const cell = screen.getByRole('gridcell', { name: /^10월 4일 일요일/ });
    fireEvent.pointerDown(cell);
    fireEvent.mouseDown(cell);
    act(() => cell.focus());
    fireEvent.pointerUp(document.body);
    fireEvent.mouseUp(document.body);
    // 앵커는 안 옮겼으니 격자는 9월 그대로다.
    expect(screen.getByRole('button', { name: /2026년 9월/ })).toBeInTheDocument();

    // 키 이동은 앵커(9/17)가 아니라 포커스 칸(10/4)에서 — 10/5 로 가며 격자가 10월로 넘어간다.
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('gridcell', { name: /^10월 5일 월요일/ })).toHaveFocus();
    expect(screen.getByRole('button', { name: /2026년 10월/ })).toBeInTheDocument();
    expect(useDateStripStore.getState().selectedDate).toBe(TODAY);
    await settle();
  });
});

describe('calendar-layout.md §2 R12. 격자 치수는 밀도 토큰만 참조하고 px 리터럴이 없다', () => {
  it('요일 머리글 줄이 --cal-cell-w·--cal-weekday-text 를 쓴다', async () => {
    stub();
    await renderMonth();
    const columnheader = screen.getAllByRole('columnheader')[0]!;
    expect(columnheader.className).toContain('w-[var(--cal-cell-w)]');
    expect(columnheader.className).toContain('text-[length:var(--cal-weekday-text)]');
    expect(columnheader.className).not.toMatch(/\bw-\[\d+px\]/);
  });

  it('칸이 --cal-cell-h-month·--cal-cell-w 를 쓰고 px 리터럴이 없다', async () => {
    stub();
    await renderMonth();
    const cell = screen.getByRole('gridcell', { name: /^9월 17일 목요일/ });
    expect(cell.className).toContain('w-[var(--cal-cell-w)]');
    expect(cell.className).toContain('h-[var(--cal-cell-h-month)]');
    expect(cell.className).not.toMatch(/\b[wh]-\[\d+px\]/);
    // 숫자는 칸(button) 안 span 이 그린다 — --cal-day-text 는 거기 있다.
    expect(screen.getByText('17').className).toContain('text-[length:var(--cal-day-text)]');
  });
});

describe('R18. 월 보기에서 ↑/↓ 는 일주일을 움직인다', () => {
  it('↓ 는 7일 뒤, ↑ 는 7일 앞 칸으로 포커스를 옮긴다', async () => {
    stub();
    const user = userEvent.setup();
    await renderMonth();

    await act(async () => {
      screen.getByRole('gridcell', { name: /^9월 17일 목요일/ }).focus();
    });
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('gridcell', { name: /^9월 24일 목요일/ })).toHaveFocus();

    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(screen.getByRole('gridcell', { name: /^9월 10일 목요일/ })).toHaveFocus();
  });

  it('키보드 ↓ 로 다음 달 칸에 가면 격자가 따라간다 — 포인터 필터가 키 이동을 막지 않는다', async () => {
    stub();
    const user = userEvent.setup();
    await renderMonth();

    // 9/17 → 9/24 → 10/1: 마지막 걸음에서 격자가 10월로 넘어가고 포커스는 10/1 칸이다.
    await act(async () => {
      screen.getByRole('gridcell', { name: /^9월 17일 목요일/ }).focus();
    });
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(screen.getByRole('gridcell', { name: /^10월 1일 목요일/ })).toHaveFocus();
    expect(screen.getByRole('button', { name: /2026년 10월/ })).toBeInTheDocument();
    expect(screen.getAllByRole('gridcell')).toHaveLength(monthGridDays('2026-10-01').length);
    // 선택은 그대로다 — 포커스 이동은 선택이 아니다(§5).
    expect(useDateStripStore.getState().selectedDate).toBe(TODAY);
    await settle();
  });

  it('←/→ 는 여전히 하루씩 움직이고 Home/End 는 그 줄의 월·일요일이다', async () => {
    stub();
    const user = userEvent.setup();
    await renderMonth();

    await act(async () => {
      screen.getByRole('gridcell', { name: /^9월 17일 목요일/ }).focus();
    });
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('gridcell', { name: /^9월 18일 금요일/ })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('gridcell', { name: /^9월 14일 월요일/ })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('gridcell', { name: /^9월 20일 일요일/ })).toHaveFocus();
  });

  it('주 보기에서는 ↑/↓ 를 가로채지 않는다 — 갈 곳이 없다', async () => {
    stub();
    useDateStripStore.setState({ view: 'week' });
    const user = userEvent.setup();
    await renderMonth();

    const cell = screen.getByRole('radio', { name: /^9월 17일 목요일/ });
    await act(async () => {
      cell.focus();
    });
    await user.keyboard('{ArrowDown}');
    expect(cell).toHaveFocus();
  });
});
