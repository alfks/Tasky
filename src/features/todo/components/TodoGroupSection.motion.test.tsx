// R8 이동 모션을 화면에서 (todo.md R8). FLIP 의 시각 효과는 jsdom 에 레이아웃이 없어 확인할 수
// 없다 — 여기서 고정하는 것은 **언제 어디에 그려지는가** 이고, 실제 움직임은 E2E 몫이다.
//
// 픽스처는 **비대칭**이다: 미완료 3 · 완료 1 이고 완료 1건의 `doneAt` 이 과거라, 방금 체크한 항목이
// 구분선 바로 아래로 오는지(R7)까지 같은 단언으로 갈린다.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Category } from '@/domain/category/category';
import type { DateKey } from '@/domain/date/date-key';
import type { Persistable } from '@/domain/meta';
import type { Todo } from '@/domain/todo/todo';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { COMPLETION_WAIT_MS } from '@/features/todo/components/todo-motion';
import { TodoList } from '@/features/todo/components/TodoList';
import { useTodoStore } from '@/features/todo/store/todo-store';
import { makeCategory } from '@/test/fixtures/category';
import { FIXTURE_DATE } from '@/test/fixtures/deps';
import { makeTodo } from '@/test/fixtures/todo';

const 공부 = makeCategory({ seq: 1, name: '공부', order: 0 });
const 카테고리: Category[] = [공부];
const 내일 = '2026-01-16' as DateKey;

const 수학 = makeTodo({ seq: 1, categoryId: 공부.id, title: '수학', order: 0 });
const 영어 = makeTodo({ seq: 2, categoryId: 공부.id, title: '영어', order: 1 });
const 국어 = makeTodo({ seq: 3, categoryId: 공부.id, title: '국어', order: 2 });
const 과학 = makeTodo({
  seq: 4,
  categoryId: 공부.id,
  title: '과학',
  order: 3,
  done: true,
  doneAt: '2026-01-15T01:00:00.000Z',
});
const 내일할일 = makeTodo({ seq: 9, categoryId: 공부.id, title: '체육', date: 내일, order: 0 });

/** `prefers-reduced-motion` 응답을 고정한다. */
function 모션축소(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

beforeEach(async () => {
  모션축소(false);
  setRepositories(createMemoryRepositories());
  useTodoStore.setState({ byId: {}, date: null, status: 'idle', error: null });
  for (const todo of [수학, 영어, 국어, 과학, 내일할일]) {
    await getRepositories().todos.upsert(todo as Persistable<Todo>);
  }
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/**
 * 체크박스를 누른다. `userEvent` 대신 `fireEvent` 를 쓰는 이유: 가짜 타이머를 켜면 `userEvent` 의
 * 내부 대기가 풀리지 않아 클릭이 끝나지 않는다(실측 — 8초 타임아웃). 이 파일이 재는 것은 400ms
 * 대기 하나라 클릭의 세부 동작(포인터 이동·포커스)은 다른 파일(`TodoList.keyboard.test.tsx`)이 본다.
 */
async function 흐르기(ms: number): Promise<void> {
  // 타이머가 깨우는 상태 갱신도 `act` 안에서 흘려야 화면에 반영된 뒤에 단언할 수 있다.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function 체크(title: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('checkbox', { name: title }));
  });
}

/**
 * 첫 적재는 **실제 타이머**로 끝낸 뒤에 가짜 타이머로 갈아탄다. 적재 전에 갈아타면 RTL 의
 * `findBy*` 폴링이 스스로 돌지 못해 무한히 기다린다 — 이 파일이 재는 것은 400ms 대기 하나다.
 */
async function 화면(date: DateKey = FIXTURE_DATE) {
  const view = render(<TodoList date={date} categories={카테고리} />);
  await screen.findByRole('checkbox', { name: '수학' });
  vi.useFakeTimers();
  return view;
}

/** 그려진 행 제목 — 완료 블록 포함, 화면 위에서 아래 순서. */
function 제목들(): string[] {
  return screen
    .getAllByRole('checkbox')
    .map(
      (box) =>
        document.getElementById(box.getAttribute('aria-labelledby') ?? '')?.textContent ?? '',
    );
}

/** 구분선 위에 있는 행 수 = 미완료 블록에 그려진 행 수. */
function 구분선위(): string[] {
  const rows = screen.getAllByRole('listitem');
  const divider = rows.findIndex(
    (row) => within(row).queryByRole('heading', { level: 3 }) !== null,
  );
  return rows.slice(0, divider).flatMap((row) => {
    const box = within(row).queryByRole('checkbox');
    return box === null
      ? []
      : [document.getElementById(box.getAttribute('aria-labelledby') ?? '')?.textContent ?? ''];
  });
}

describe('체크 → 대기 → 이동 (R8)', () => {
  it('체크 직후에는 제자리에서 취소선만 보이고 400ms 뒤에 완료 블록으로 내려간다', async () => {
    await 화면();

    await 체크('수학');

    // 대기 중: 자리는 그대로, 취소선은 이미 보인다.
    expect(screen.getByRole('checkbox', { name: '수학' })).toBeChecked();
    expect(구분선위()).toEqual(['수학', '영어', '국어']);
    expect(screen.getByRole('button', { name: '수학' })).toHaveClass('line-through');

    // 399ms 까지는 아직이다. 한 번에 399 를 흘리면 가짜 타이머가 그 사이의 렌더를 다르게 묶으므로
    // 100·100·199 로 나눠 짚는다(실측 — 한 번에 흘리면 400 전에 풀린 것처럼 보인다).
    await 흐르기(399);
    expect(구분선위()).toEqual(['수학', '영어', '국어']);

    await 흐르기(1);
    // 방금 완료한 것이 구분선 **바로 아래** 다(R7: doneAt 내림차순).
    expect(구분선위()).toEqual(['영어', '국어']);
    expect(제목들()).toEqual(['영어', '국어', '수학', '과학']);
  });

  it('대기 시간은 400ms 다', async () => {
    // 상수만 참조하면 값을 바꿔도 위 테스트가 따라간다 — 리터럴로 한 번 더 못 박는다.
    expect(COMPLETION_WAIT_MS).toBe(400);
  });

  it('대기 중 두 번째 체크는 함께 내려간다 (타이머가 되감기지 않는다)', async () => {
    await 화면();

    await 체크('수학');
    await 흐르기(300);
    await 체크('영어');
    expect(구분선위()).toEqual(['수학', '영어', '국어']);

    await 흐르기(100);

    expect(구분선위()).toEqual(['국어']);
    expect(제목들()).toEqual(['국어', '영어', '수학', '과학']);
  });

  it('연타해도 마지막 상태 하나만 남는다', async () => {
    await 화면();

    await 체크('수학');
    await 체크('수학');
    await 체크('수학');

    await 흐르기(COMPLETION_WAIT_MS);

    expect(screen.getByRole('checkbox', { name: '수학' })).toBeChecked();
    expect(구분선위()).toEqual(['영어', '국어']);
  });

  it('해제하면 원래 order 자리로 돌아간다', async () => {
    await 화면();

    await 체크('수학');
    await 흐르기(COMPLETION_WAIT_MS);
    await 체크('수학');
    await 흐르기(COMPLETION_WAIT_MS);

    expect(제목들()).toEqual(['수학', '영어', '국어', '과학']);
  });

  it('대기 중 날짜가 바뀌면 옛 날짜의 행을 붙들지 않는다', async () => {
    const { rerender } = await 화면();

    await 체크('수학');
    rerender(<TodoList date={내일} categories={카테고리} />);

    await vi.waitFor(() => {
      expect(screen.queryByRole('checkbox', { name: '체육' })).not.toBeNull();
    });
    expect(제목들()).toEqual(['체육']);

    await 흐르기(COMPLETION_WAIT_MS);
    expect(제목들()).toEqual(['체육']);
  });

  it('이동이 끝난 뒤 한 번 낭독한다', async () => {
    await 화면();
    const live = document.querySelector('[aria-live="polite"]');

    await 체크('수학');
    expect(live).toHaveTextContent('');

    await 흐르기(COMPLETION_WAIT_MS);

    expect(live).toHaveTextContent('완료됨, 아래로 이동');
  });
});

describe('이동 뒤 포커스 (§5)', () => {
  it('완료 블록으로 내려가도 포커스는 그 항목에 남는다', async () => {
    await 화면();
    const row = screen.getByRole('checkbox', { name: '수학' }).closest('li');
    if (row === null) throw new Error('행이 없다');
    row.focus();
    expect(row).toHaveFocus();

    await 체크('수학');
    await 흐르기(COMPLETION_WAIT_MS);

    // 두 블록은 서로 다른 자식 배열이라 React 가 행을 **새로 만든다** — 옛 요소는 끊어진다.
    const moved = screen.getByRole('checkbox', { name: '수학' }).closest('li');
    expect(moved).not.toBe(row);
    expect(moved).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);
  });
});

describe('reduced-motion (R8)', () => {
  it('대기 없이 즉시 재배치한다', async () => {
    모션축소(true);
    await 화면();

    await 체크('수학');

    // 타이머를 **한 틱도 흘리지 않고** 단언한다 — `waitFor` 로 기다리면 가짜 시계가 400ms 를
    // 지나쳐 버려서 "대기가 없다" 와 "대기가 있다" 가 똑같이 통과한다.
    expect(구분선위()).toEqual(['영어', '국어']);
  });

  it('이동 낭독도 그 자리에서 한다', async () => {
    모션축소(true);
    await 화면();

    await 체크('수학');

    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('완료됨, 아래로 이동');
  });
});
