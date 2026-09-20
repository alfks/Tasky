import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Category } from '@/domain/category/category';
import type { DateKey } from '@/domain/date/date-key';
import type { Todo } from '@/domain/todo/todo';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { DateStrip } from '@/features/date-strip/components/DateStrip';
import { TODAY_TICK_MS } from '@/features/date-strip/hooks/useTodayTick';
import { MAX_DATE_KEY, MIN_DATE_KEY } from '@/features/date-strip/lib/week';
import {
  createInitialDateStripState,
  useDateStripStore,
} from '@/features/date-strip/store/date-strip-store';

/** 2026-09-17 은 목요일이라 그 주는 9/14(월)~9/20(일)이다. */
const TODAY: DateKey = '2026-09-17';

/**
 * 조회만 하는 저장소 스텁. 이 화면은 읽기 전용이라 `upsert` 는 불리지 않는다 —
 * 불리면 테스트가 바로 실패하도록 throw 한다.
 */
function stubRepositories(
  options: { todos?: Todo[]; categories?: Category[]; fail?: boolean } = {},
) {
  const todos = options.todos ?? [];
  const categories = options.categories ?? [];
  const reject = () => Promise.reject(new Error('조회 실패'));
  const base = createMemoryRepositories();
  setRepositories({
    ...base,
    todos: {
      ...base.todos,
      listByDateRange: (from, to) =>
        options.fail === true
          ? reject()
          : Promise.resolve(todos.filter((todo) => todo.date >= from && todo.date <= to)),
      upsert: () => Promise.reject(new Error('스트립은 쓰지 않는다')),
    },
    categories: {
      ...base.categories,
      list: () => (options.fail === true ? reject() : Promise.resolve(categories)),
      upsert: () => Promise.reject(new Error('스트립은 쓰지 않는다')),
    },
  });
}

/** 렌더 후 요약 조회(비동기)까지 흘려보낸다. */
async function renderStrip(props: Partial<Parameters<typeof DateStrip>[0]> = {}) {
  const result = render(<DateStrip summaryRevision={0} {...props} />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return result;
}

/** 셀은 라디오다(§5). 접근성 이름으로 찾는다. */
const cell = (name: string | RegExp) => screen.getByRole('radio', { name });

/** 셀에 포커스를 준다. onFocus 가 상태를 바꾸므로 act 로 감싼다. */
function focusCell(name: string | RegExp) {
  act(() => cell(name).focus());
}

beforeEach(() => {
  stubRepositories();
  useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('R1. 스트립은 선택 날짜가 속한 월요일 시작 7일을 보여준다', () => {
  it('목요일이 선택되면 월요일부터 일요일까지 7칸이 이 순서로 놓인다', async () => {
    await renderStrip();
    const names = screen.getAllByRole('radio').map((node) => node.getAttribute('aria-label'));
    expect(names).toEqual([
      '9월 14일 월요일',
      '9월 15일 화요일',
      '9월 16일 수요일',
      '9월 17일 목요일, 오늘',
      '9월 18일 금요일',
      '9월 19일 토요일',
      '9월 20일 일요일',
    ]);
  });

  it('주가 달을 걸치면 두 달의 날짜가 한 줄에 있고 월 표시는 월요일이 속한 달이다', async () => {
    useDateStripStore.setState({ selectedDate: '2026-10-01', today: TODAY });
    await renderStrip();
    expect(screen.getAllByRole('radio')).toHaveLength(7);
    expect(cell('9월 28일 월요일')).toBeInTheDocument();
    expect(cell('10월 4일 일요일')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2026년 9월/ })).toBeInTheDocument();
  });

  it('연말 주는 두 해의 날짜를 함께 보여준다', async () => {
    useDateStripStore.setState({ selectedDate: '2026-01-01', today: TODAY });
    await renderStrip();
    expect(cell('12월 29일 월요일')).toBeInTheDocument();
    expect(cell('1월 4일 일요일')).toBeInTheDocument();
  });

  it('윤일(2/29)이 있는 주도 7칸이고 2월 29일 칸이 있다', async () => {
    useDateStripStore.setState({ selectedDate: '2028-02-29', today: TODAY });
    await renderStrip();
    expect(screen.getAllByRole('radio')).toHaveLength(7);
    expect(cell('2월 29일 화요일')).toBeChecked();
  });
});

describe('R2. 앱 시작 시 선택 날짜는 항상 오늘이다', () => {
  it('초기 상태로 렌더하면 오늘 칸이 선택돼 있다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 17, 9, 30));
    useDateStripStore.setState(createInitialDateStripState());
    render(<DateStrip summaryRevision={0} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(cell(/9월 17일 목요일/)).toBeChecked();
  });
});

describe('R3. 오늘 셀은 강조색 링, 선택 셀은 강조색 채움이고 둘 다면 채움만 남는다', () => {
  it('선택되지 않은 오늘은 링만 갖는다', async () => {
    useDateStripStore.setState({ selectedDate: '2026-09-15', today: TODAY });
    await renderStrip();
    const today = cell(/9월 17일 목요일, 오늘/);
    expect(today.className).toContain('ring-2');
    expect(today.className).not.toContain('bg-accent');
  });

  it('선택 셀은 강조색으로 채워지고 aria-checked 가 참이다', async () => {
    useDateStripStore.setState({ selectedDate: '2026-09-15', today: TODAY });
    await renderStrip();
    const selected = cell('9월 15일 화요일');
    expect(selected).toBeChecked();
    expect(selected.className).toContain('bg-accent');
    expect(cell(/9월 17일 목요일, 오늘/)).not.toBeChecked();
  });

  it('오늘이면서 선택이면 링 없이 채움만 남는다', async () => {
    await renderStrip();
    const today = cell(/9월 17일 목요일, 오늘/);
    expect(today.className).toContain('bg-accent');
    expect(today.className).not.toContain('ring-2');
  });
});

describe('R4. ‹ › 는 7일을 옮기고 요일을 유지한다', () => {
  it('다음 주 버튼은 같은 요일의 7일 뒤를 선택한다', async () => {
    const user = userEvent.setup();
    await renderStrip();
    await user.click(screen.getByRole('button', { name: '다음 주' }));
    expect(useDateStripStore.getState().selectedDate).toBe('2026-09-24');
    expect(cell(/9월 24일 목요일/)).toBeChecked();
  });

  it('이전 주 버튼은 같은 요일의 7일 앞을 선택한다', async () => {
    const user = userEvent.setup();
    await renderStrip();
    await user.click(screen.getByRole('button', { name: '이전 주' }));
    expect(useDateStripStore.getState().selectedDate).toBe('2026-09-10');
  });
});

describe('R5. [오늘] 은 선택 날짜가 오늘일 때 비활성이다', () => {
  it('오늘이 선택돼 있으면 비활성이다', async () => {
    await renderStrip();
    expect(screen.getByRole('button', { name: '오늘로 이동' })).toBeDisabled();
  });

  it('다른 날이 선택되면 활성이고, 누르면 오늘로 돌아온다', async () => {
    const user = userEvent.setup();
    useDateStripStore.setState({ selectedDate: '2026-03-03', today: TODAY });
    await renderStrip();
    const button = screen.getByRole('button', { name: '오늘로 이동' });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(useDateStripStore.getState().selectedDate).toBe(TODAY);
  });
});

describe('R6. 범위 밖으로 가는 버튼은 비활성이다', () => {
  it('하한 주에서는 이전 주가 비활성이고 범위 밖 칸도 비활성이다', async () => {
    useDateStripStore.setState({ selectedDate: MIN_DATE_KEY, today: TODAY });
    await renderStrip();
    expect(screen.getByRole('button', { name: '이전 주' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음 주' })).toBeEnabled();
    expect(cell('12월 29일 월요일')).toBeDisabled();
    expect(cell(/1월 1일 목요일/)).toBeEnabled();
  });

  it('상한 주에서는 다음 주가 비활성이다', async () => {
    useDateStripStore.setState({ selectedDate: MAX_DATE_KEY, today: TODAY });
    await renderStrip();
    expect(screen.getByRole('button', { name: '다음 주' })).toBeDisabled();
    expect(cell('1월 3일 일요일')).toBeDisabled();
  });
});

describe('R9. 요일 색은 토·일만 다르고 요일 글자가 항상 있다', () => {
  it('토요일·일요일 글자에만 전용 색 토큰이 붙는다', async () => {
    await renderStrip();
    const weekdayOf = (name: string) => cell(name).querySelector('span')?.className ?? '';
    expect(weekdayOf('9월 19일 토요일')).toContain('var(--color-saturday)');
    expect(weekdayOf('9월 20일 일요일')).toContain('var(--color-sunday)');
    expect(weekdayOf('9월 18일 금요일')).toContain('text-muted');
  });

  it('모든 칸에 요일 글자가 하나씩 있다', async () => {
    await renderStrip();
    const labels = screen.getAllByRole('radio').map((node) => node.textContent?.[0]);
    expect(labels).toEqual(['월', '화', '수', '목', '금', '토', '일']);
  });
});

describe('R12. 자정을 넘기면 오늘 표시가 갱신되고 선택 날짜는 그대로다', () => {
  it('확인 주기는 1분이다', () => {
    expect(TODAY_TICK_MS).toBe(60_000);
  });

  it('1분이 지나면 오늘 표시가 다음 날로 옮겨간다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 17, 23, 59, 30));
    useDateStripStore.setState(createInitialDateStripState());
    render(<DateStrip summaryRevision={0} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(cell(/9월 17일 목요일, 오늘/)).toBeInTheDocument();

    vi.setSystemTime(new Date(2026, 8, 18, 0, 0, 30));
    await act(async () => {
      // 상수가 아니라 1분을 그대로 넣는다 — 주기를 늘리는 변경이 이 테스트에 잡히게.
      vi.advanceTimersByTime(60_000);
    });

    expect(cell(/9월 18일 금요일, 오늘/)).toBeInTheDocument();
    expect(cell('9월 17일 목요일')).toBeChecked();
    expect(useDateStripStore.getState().selectedDate).toBe(TODAY);
  });
});

describe('§5. 키보드만으로 셀 이동·선택이 되고 스트립 안의 ←/→ 는 전역 이동으로 새지 않는다', () => {
  it('←/→ 는 포커스만 하루씩 옮기고 선택은 그대로 둔다', async () => {
    const user = userEvent.setup();
    await renderStrip();
    focusCell(/9월 17일 목요일/);

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toHaveAttribute('aria-label', '9월 18일 금요일');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(document.activeElement).toHaveAttribute('aria-label', '9월 16일 수요일');
    expect(useDateStripStore.getState().selectedDate).toBe(TODAY);
  });

  it('주 끝을 넘어가면 다음 주가 보이고 포커스가 이어진다', async () => {
    const user = userEvent.setup();
    await renderStrip();
    focusCell(/9월 20일 일요일/);
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toHaveAttribute('aria-label', '9월 21일 월요일');
    expect(cell('9월 27일 일요일')).toBeInTheDocument();
  });

  it('Home/End 는 그 주의 월요일·일요일로 옮긴다', async () => {
    const user = userEvent.setup();
    await renderStrip();
    focusCell(/9월 17일 목요일/);
    await user.keyboard('{Home}');
    expect(document.activeElement).toHaveAttribute('aria-label', '9월 14일 월요일');
    await user.keyboard('{End}');
    expect(document.activeElement).toHaveAttribute('aria-label', '9월 20일 일요일');
  });

  it('Enter 와 Space 로 포커스한 날을 선택한다', async () => {
    const user = userEvent.setup();
    await renderStrip();
    focusCell(/9월 17일 목요일/);
    await user.keyboard('{ArrowRight}{Enter}');
    expect(useDateStripStore.getState().selectedDate).toBe('2026-09-18');
    await user.keyboard('{ArrowRight}{ArrowRight} ');
    expect(useDateStripStore.getState().selectedDate).toBe('2026-09-20');
  });

  it('스트립 안의 ←/→ 는 바깥으로 전파되지 않는다(전역 ±1일과 겹치지 않게)', async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    render(
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- 전파 여부만 보는 테스트용 관찰자다.
      <div onKeyDown={outer}>
        <DateStrip summaryRevision={0} />
      </div>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    focusCell(/9월 17일 목요일/);
    await user.keyboard('{ArrowRight}');
    expect(outer).not.toHaveBeenCalled();
  });

  it('탭 정지점은 한 칸뿐이고(roving tabindex) 포커스가 떠나면 선택 주로 돌아온다', async () => {
    const user = userEvent.setup();
    await renderStrip();
    expect(screen.getAllByRole('radio').filter((node) => node.tabIndex === 0)).toHaveLength(1);

    focusCell(/9월 20일 일요일/);
    await user.keyboard('{ArrowRight}');
    expect(cell('9월 27일 일요일')).toBeInTheDocument();

    act(() => screen.getByRole('button', { name: '다음 주' }).focus());
    await waitFor(() => expect(cell(/9월 17일 목요일, 오늘/)).toBeInTheDocument());
  });
});

describe('§5. 스트립은 라디오 그룹이고 탭 정지점이 포커스를 따라간다', () => {
  it('셀 7개를 묶는 라디오 그룹에 이름이 있다', async () => {
    await renderStrip();
    const group = screen.getByRole('radiogroup', { name: '날짜 선택' });
    // 그룹 역할이 없으면 스크린리더의 "7개 중 4번째" 안내가 통째로 사라진다.
    expect(within(group).getAllByRole('radio')).toHaveLength(7);
  });

  it('화살표로 옮긴 포커스를 탭 정지점이 따라간다(선택 셀에 고정되지 않는다)', async () => {
    const user = userEvent.setup();
    await renderStrip();
    expect(cell(/9월 17일 목요일, 오늘/).tabIndex).toBe(0);

    focusCell(/9월 17일 목요일/);
    await user.keyboard('{ArrowRight}{ArrowRight}');

    expect(cell('9월 19일 토요일').tabIndex).toBe(0);
    expect(cell(/9월 17일 목요일, 오늘/).tabIndex).toBe(-1);
    // 선택은 그대로다 — 정지점과 선택이 갈라진 상태를 단언하는 것이 이 테스트의 요점이다.
    expect(cell(/9월 17일 목요일, 오늘/)).toBeChecked();
    expect(screen.getAllByRole('radio').filter((node) => node.tabIndex === 0)).toHaveLength(1);
  });
});

describe('§5. 헤더 버튼이 자기 클릭으로 비활성돼도 포커스가 스트립에 남는다', () => {
  it('[오늘] 을 키보드로 누르면 포커스가 오늘 셀로 넘어간다', async () => {
    const user = userEvent.setup();
    useDateStripStore.setState({ selectedDate: '2026-03-03', today: TODAY });
    await renderStrip();

    const button = screen.getByRole('button', { name: '오늘로 이동' });
    act(() => button.focus());
    await user.keyboard('{Enter}');

    expect(button).toBeDisabled();
    expect(document.body).not.toHaveFocus();
    expect(cell(/9월 17일 목요일, 오늘/)).toHaveFocus();
  });

  it('[다음 주] 가 범위 끝에서 비활성되면 포커스가 선택 셀로 넘어간다', async () => {
    const user = userEvent.setup();
    useDateStripStore.setState({ selectedDate: '2099-12-20', today: TODAY });
    await renderStrip();

    const button = screen.getByRole('button', { name: '다음 주' });
    act(() => button.focus());
    await user.keyboard('{Enter}');

    expect(button).toBeDisabled();
    expect(cell('12월 27일 일요일')).toHaveFocus();
  });

  it('비활성되지 않는 주 이동은 버튼에 포커스를 남겨 연달아 누를 수 있다', async () => {
    const user = userEvent.setup();
    await renderStrip();

    const button = screen.getByRole('button', { name: '다음 주' });
    act(() => button.focus());
    await user.keyboard('{Enter}{Enter}');

    expect(button).toHaveFocus();
    expect(useDateStripStore.getState().selectedDate).toBe('2026-10-01');
  });
});

describe('onVisibleRange — 보이는 범위를 알린다(routine.md R6 배선 지점)', () => {
  it('마운트하면 보이는 주의 양끝으로 한 번 부른다', async () => {
    const onVisibleRange = vi.fn();
    await renderStrip({ onVisibleRange });

    expect(onVisibleRange).toHaveBeenCalledWith('2026-09-14', '2026-09-20');
  });

  it('보이는 주가 바뀌면(다음 주로 이동) 새 범위로 다시 부른다', async () => {
    const user = userEvent.setup();
    const onVisibleRange = vi.fn();
    await renderStrip({ onVisibleRange });
    onVisibleRange.mockClear();

    await user.click(screen.getByRole('button', { name: '다음 주' }));

    await waitFor(() => expect(onVisibleRange).toHaveBeenCalledWith('2026-09-21', '2026-09-27'));
  });

  it('콜백을 주지 않아도 렌더는 그대로 된다(옵셔널)', async () => {
    await expect(renderStrip()).resolves.not.toThrow();
  });
});
