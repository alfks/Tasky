// 선택 날짜 패널의 본문(§2-C)과 머리(calendar-layout.md R5).
//
// **본문(`DayPanelBody`)이 지키는 것**: 빈 상태 문구가 "지금 보고 있는 날짜" 를 말하는가. 날짜를
// 옮겨 다니는 것이 이 앱의 핵심 동작이라(date-strip R4), 어느 날짜에서나 "오늘은" 이라고 말하면
// 화면이 거짓말을 한다. `ShellMain`(<680, 1열)도 같은 본문을 가져다 쓰므로 여기 한 곳만 지키면 된다
// (R21 — "옮겨 받는다").
//
// **시계를 만지지 않는다.** 오늘은 날짜 스트립 스토어에 주입하고, 시스템 시계는 세 픽스처 날짜 중
// 어느 것도 아닌 날(2026-01-01)로 고정해 둔다 — 컴포넌트가 몰래 `new Date()`/`todayKey()` 를
// 읽으면 세 경우가 **전부** 깨지도록. 그래서 자정 근처에 돌려도 결과가 같다.
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { useDateStripStore } from '@/features/date-strip';
import { useDiaryStore } from '@/features/diary';
import {
  DayPanelBody,
  EMPTY_TODOS_TEXT,
  EMPTY_TODOS_TEXT_FUTURE,
  EMPTY_TODOS_TEXT_PAST,
  ShellDayPanel,
  emptyTodosText,
} from '@/features/shell/components/ShellDayPanel';
import { useTodoStore } from '@/features/todo';
import { makeCategory } from '@/test/fixtures/category';

const TODAY = '2026-09-17' as DateKey;
const PAST = '2026-09-10' as DateKey;
/** 티켓의 실측 재현 경로 — 팔레트의 `다음 주로 이동` 직후 화면. */
const FUTURE = '2026-09-23' as DateKey;

const STUDY = makeCategory({ seq: 1, order: 0, name: '공부' });
const SUMMARY = { done: 0, total: 0, rate: 0, percent: 0 };

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  // Date 만 고정한다. setInterval/setTimeout 은 실물 그대로 둬야 effect 와 cleanup 이 평소처럼 돈다.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
  useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });
  useTodoStore.setState({ byId: {}, date: null, status: 'idle', error: null });
  useDiaryStore.setState({
    date: null,
    entry: undefined,
    status: 'idle',
    error: null,
    pendingRemoval: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

/** 빈 상태 한 줄만 남기는 최소 조합 — 카테고리는 있고 그날 투두가 0개다 (§2-C 두 번째 빈 상태). */
async function mount(date: DateKey): Promise<void> {
  render(
    <DayPanelBody
      date={date}
      categories={[STUDY]}
      categoriesPending={false}
      todosFirstLoading={false}
      failureCard={null}
      todosEmpty
      onCreateCategory={() => {}}
    />,
  );
  // `TodoList` 가 마운트하며 그 날짜를 읽는다 — 그 effect 가 가라앉은 뒤에 본다.
  await act(async () => {
    await Promise.resolve();
  });
}

/** 세 문구 중 하나만 화면에 있어야 한다. 뒤집힌 분기는 이 대조에서 잡힌다. */
function expectOnly(text: string): void {
  expect(screen.getByText(text)).toBeInTheDocument();
  for (const other of [EMPTY_TODOS_TEXT, EMPTY_TODOS_TEXT_PAST, EMPTY_TODOS_TEXT_FUTURE]) {
    if (other === text) continue;
    expect(screen.queryByText(other)).not.toBeInTheDocument();
  }
}

describe('emptyTodosText — 선택 날짜에 따라 갈린다', () => {
  it('오늘이면 스펙 §2-C 의 문장 그대로다', () => {
    expect(emptyTodosText(TODAY, TODAY)).toBe(EMPTY_TODOS_TEXT);
  });

  it('지난 날짜면 과거형이고 재촉하지 않는다', () => {
    expect(emptyTodosText(PAST, TODAY)).toBe(EMPTY_TODOS_TEXT_PAST);
  });

  it('앞으로 올 날짜면 미리 적어 두자고 권한다', () => {
    expect(emptyTodosText(FUTURE, TODAY)).toBe(EMPTY_TODOS_TEXT_FUTURE);
  });

  it('하루 차이에서도 갈린다 — 경계가 오늘 하루에 딱 맞는다', () => {
    expect(emptyTodosText('2026-09-16' as DateKey, TODAY)).toBe(EMPTY_TODOS_TEXT_PAST);
    expect(emptyTodosText('2026-09-18' as DateKey, TODAY)).toBe(EMPTY_TODOS_TEXT_FUTURE);
  });

  it('달·해 경계를 넘어도 사전순 비교가 날짜순과 같다', () => {
    expect(emptyTodosText('2026-08-31' as DateKey, '2026-09-01' as DateKey)).toBe(
      EMPTY_TODOS_TEXT_PAST,
    );
    expect(emptyTodosText('2027-01-01' as DateKey, '2026-12-31' as DateKey)).toBe(
      EMPTY_TODOS_TEXT_FUTURE,
    );
  });
});

describe('빈 상태 한 줄이 보고 있는 날짜를 말한다 (§2-C)', () => {
  it('오늘을 보고 있으면 "오늘은 …" 이다', async () => {
    await mount(TODAY);
    expectOnly(EMPTY_TODOS_TEXT);
  });

  it('지난 날짜를 보고 있으면 "오늘은 …" 이 아니다', async () => {
    await mount(PAST);
    expectOnly(EMPTY_TODOS_TEXT_PAST);
  });

  it('앞으로 올 날짜를 보고 있으면 "오늘은 …" 이 아니다', async () => {
    await mount(FUTURE);
    expectOnly(EMPTY_TODOS_TEXT_FUTURE);
  });

  it('투두가 있으면 어느 날짜에서도 빈 상태 줄을 그리지 않는다', async () => {
    render(
      <DayPanelBody
        date={PAST}
        categories={[STUDY]}
        categoriesPending={false}
        todosFirstLoading={false}
        failureCard={null}
        todosEmpty={false}
        onCreateCategory={() => {}}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    for (const text of [EMPTY_TODOS_TEXT, EMPTY_TODOS_TEXT_PAST, EMPTY_TODOS_TEXT_FUTURE]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
  });
});

describe('다이어리 카드 (diary.md §2)', () => {
  it('failureCard 가 없으면 오늘의 기록 카드가 함께 그려진다', async () => {
    await mount(TODAY);
    expect(screen.getByRole('region', { name: '오늘의 기록' })).toBeInTheDocument();
  });

  it('failureCard 가 있으면 다이어리 카드를 그리지 않는다(같은 저장소가 죽은 상태)', async () => {
    render(
      <DayPanelBody
        date={TODAY}
        categories={[STUDY]}
        categoriesPending={false}
        todosFirstLoading={false}
        failureCard={<p>문제가 생겼어요</p>}
        todosEmpty
        onCreateCategory={() => {}}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('region', { name: '오늘의 기록' })).not.toBeInTheDocument();
  });
});

describe('자정을 넘기면 같은 날짜가 오늘에서 어제가 된다 (R12)', () => {
  it('스트립의 오늘이 갱신되면 문구도 따라 바뀐다 — 마운트 시점에 굳지 않는다', async () => {
    await mount(TODAY);
    expectOnly(EMPTY_TODOS_TEXT);

    act(() => {
      // `refreshToday()` 가 자정 직후 하는 일과 같다 — 선택 날짜는 그대로 두고 오늘만 옮긴다.
      useDateStripStore.setState({ today: '2026-09-18' as DateKey });
    });

    expectOnly(EMPTY_TODOS_TEXT_PAST);
  });
});

describe('패널 머리 (calendar-layout.md R5)', () => {
  it('`M월 D일 (요일)` 과 달성률 퍼센트가 함께 있고, `main` 이 이 패널이다', async () => {
    render(
      <ShellDayPanel
        date={TODAY}
        summary={{ done: 1, total: 2, rate: 0.5, percent: 50 }}
        categories={[STUDY]}
        categoriesPending={false}
        todosFirstLoading={false}
        failureCard={null}
        todosEmpty={false}
        onCreateCategory={() => {}}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'shell-main');
    const head = main.firstElementChild;
    expect(head?.textContent).toContain('9월 17일 (목)');
    expect(head?.textContent).toContain('50%');
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('빈 카테고리 상태에서도 머리는 그대로 뜬다', async () => {
    render(
      <ShellDayPanel
        date={TODAY}
        summary={SUMMARY}
        categories={[]}
        categoriesPending={false}
        todosFirstLoading={false}
        failureCard={null}
        todosEmpty={false}
        onCreateCategory={() => {}}
      />,
    );
    expect(screen.getByText(/9월 17일/)).toBeInTheDocument();
  });
});
