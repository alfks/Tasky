// 드래그로 순서 바꾸기의 **배선** (todo.md R11).
//
// jsdom 에는 레이아웃도 `DataTransfer` 도 없다. 그래서 여기서 고정하는 것은 "드롭이 어떤 좌표로
// 스토어에 닿는가" 까지이고, 실제 마우스 드래그는 E2E 가 본다. 좌표 계산 자체는
// `todo-drag.test.ts` 가 따로 못 박는다.
//
// 픽스처는 **비대칭**이다: 미완료 3건 사이에 완료 1건이 `order` 1 로 끼어 있어, 수열 좌표와
// 화면 좌표가 다르다 — 둘을 섞으면 엉뚱한 자리에 떨어진다.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Category } from '@/domain/category/category';
import type { Persistable } from '@/domain/meta';
import type { Todo } from '@/domain/todo/todo';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { TODO_DRAG_MIME } from '@/features/date-strip';
import { TodoList } from '@/features/todo/components/TodoList';
import { useTodoStore } from '@/features/todo/store/todo-store';
import { makeCategory } from '@/test/fixtures/category';
import { FIXTURE_DATE } from '@/test/fixtures/deps';
import { makeTodo } from '@/test/fixtures/todo';

const 공부 = makeCategory({ seq: 1, name: '공부', order: 0 });
const 카테고리: Category[] = [공부];

const 수학 = makeTodo({ seq: 1, categoryId: 공부.id, title: '수학', order: 0 });
const 과학 = makeTodo({
  seq: 2,
  categoryId: 공부.id,
  title: '과학',
  order: 1,
  done: true,
  doneAt: '2026-01-15T10:00:00.000Z',
});
const 영어 = makeTodo({ seq: 3, categoryId: 공부.id, title: '영어', order: 2 });
const 국어 = makeTodo({ seq: 4, categoryId: 공부.id, title: '국어', order: 3 });

function 데이터전송() {
  return { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '', types: [] };
}

function pointer(node: Element, type: string, y: number): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, clientX: 20, clientY: y });
  fireEvent(node, event);
}

beforeEach(async () => {
  setRepositories(createMemoryRepositories());
  useTodoStore.setState({ byId: {}, date: null, status: 'idle', error: null });
  for (const todo of [수학, 과학, 영어, 국어]) {
    await getRepositories().todos.upsert(todo as Persistable<Todo>);
  }
});

async function 화면() {
  render(<TodoList date={FIXTURE_DATE} categories={카테고리} />);
  await screen.findByRole('checkbox', { name: '수학' });
}

function 행(title: string): HTMLElement {
  const row = screen.getByRole('checkbox', { name: title }).closest('li');
  if (row === null) throw new Error(`${title} 행이 없다`);
  return row;
}

function 제목들(): string[] {
  return screen
    .getAllByRole('checkbox')
    .map(
      (box) =>
        document.getElementById(box.getAttribute('aria-labelledby') ?? '')?.textContent ?? '',
    );
}

/**
 * 손잡이에서 드래그를 시작하고 대상 행 위에 떨어뜨린다.
 *
 * `fireEvent.drop(el, { clientY })` 를 쓰지 않는다: jsdom 에 `DragEvent` 가 없어 testing-library 가
 * 평범한 `Event` 로 떨어뜨리고, 그러면 `clientY` 가 사라져 **언제나 "행 앞"** 으로 판정된다(실측 —
 * 뒤로 놓는 경우가 통째로 검사되지 않는 자리였다). `MouseEvent` 로 직접 만들어 좌표를 살린다.
 * jsdom 에는 레이아웃이 없어 행의 `getBoundingClientRect()` 는 0 이므로 `clientY > 0` 이 곧 "뒤" 다.
 */
function 끌어놓기(from: string, to: string, after: boolean): void {
  fireEvent.dragStart(screen.getByRole('button', { name: `${from} 순서 변경 (Alt+위/아래)` }), {
    dataTransfer: 데이터전송(),
  });
  const drop = new MouseEvent('drop', { bubbles: true, cancelable: true, clientY: after ? 1 : 0 });
  fireEvent(행(to), drop);
}

describe('드래그 순서 변경 (R11)', () => {
  it('제목을 길게 누른 뒤 행 위에 놓으면 재정렬되고 뒤따른 클릭은 메뉴를 열지 않는다', async () => {
    await 화면();
    const source = 행('수학');
    const over = 행('영어');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => over,
    });
    vi.useFakeTimers();
    try {
      pointer(source.querySelector('[data-todo-title]')!, 'pointerdown', 20);
      act(() => vi.advanceTimersByTime(400));
      pointer(source, 'pointermove', 1);
      pointer(source, 'pointerup', 1);
      fireEvent.click(source.querySelector('[data-todo-title]')!);
    } finally {
      vi.useRealTimers();
      Reflect.deleteProperty(document, 'elementFromPoint');
    }
    expect(screen.queryByRole('menu')).toBeNull();
    await waitFor(() => expect(제목들()).toEqual(['영어', '수학', '국어', '과학']));
  });

  it('길게 누르기 전에 세로로 움직이면 드래그가 취소되고 다음 탭은 메뉴를 연다', async () => {
    await 화면();
    const source = 행('수학');
    vi.useFakeTimers();
    try {
      pointer(source.querySelector('[data-todo-title]')!, 'pointerdown', 20);
      pointer(source, 'pointermove', 40);
      act(() => vi.advanceTimersByTime(500));
      pointer(source, 'pointerup', 40);
      fireEvent.click(source.querySelector('[data-todo-title]')!);
    } finally {
      vi.useRealTimers();
    }
    expect(screen.getByRole('menu', { name: '수학 메뉴' })).toBeInTheDocument();
    expect(제목들()).toEqual(['수학', '영어', '국어', '과학']);
  });

  it('뒤쪽 행의 아래에 떨어뜨리면 그 뒤로 간다', async () => {
    await 화면();

    끌어놓기('수학', '영어', true);

    await waitFor(() => {
      expect(제목들()).toEqual(['영어', '수학', '국어', '과학']);
    });
  });

  it('앞쪽 행의 위에 떨어뜨리면 그 앞으로 간다', async () => {
    await 화면();

    끌어놓기('국어', '수학', false);

    await waitFor(() => {
      expect(제목들()).toEqual(['국어', '수학', '영어', '과학']);
    });
  });

  it('완료 항목은 드롭 대상이 아니다', async () => {
    await 화면();

    끌어놓기('수학', '과학', true);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(제목들()).toEqual(['수학', '영어', '국어', '과학']);
  });

  it('완료 항목에는 손잡이가 없어 끌 수 없다', async () => {
    await 화면();

    expect(screen.queryByRole('button', { name: /과학 순서 변경/u })).toBeNull();
  });

  it('날짜 스트립이 받을 수 있게 같은 MIME 으로 id 를 싣는다 (R10-d)', async () => {
    await 화면();

    const dataTransfer = 데이터전송();
    fireEvent.dragStart(screen.getByRole('button', { name: '수학 순서 변경 (Alt+위/아래)' }), {
      dataTransfer,
    });

    expect(dataTransfer.setData).toHaveBeenCalledWith(TODO_DRAG_MIME, 수학.id);
  });
});
