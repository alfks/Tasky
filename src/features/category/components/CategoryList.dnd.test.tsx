// 사이드바 드래그 순서 변경의 **배선** (category R5, §2-A).
//
// jsdom 에는 레이아웃도 `DataTransfer` 도 없다. 여기서 고정하는 것은 "드롭이 어떤 좌표로 스토어에
// 닿는가" 까지이고, 좌표 계산 자체는 `src/lib/drag-order.test.ts` 가 따로 못 박는다.
//
// 픽스처는 **비대칭**이다: 활성 3개의 `order` 가 서로 다르고(운동 0 · 독서 1 · 공부 2) 종료 1개가
// 섞여 있다 — 활성/종료를 한 좌표계로 세면 여기서 엇나간다.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Category } from '@/domain/category/category';
import type { Persistable } from '@/domain/meta';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { CATEGORY_DRAG_MIME } from '@/features/category/components/category-drag';
import { CategoryList } from '@/features/category/components/CategoryList';
import { indexCategories } from '@/features/category/store/category-state';
import { useCategoryStore } from '@/features/category/store/category-store';
import { useTodoStore } from '@/features/todo';
import { makeCategory } from '@/test/fixtures/category';

const 운동 = makeCategory({ seq: 1, name: '운동', order: 0 });
const 독서 = makeCategory({ seq: 2, name: '독서', order: 1 });
const 공부 = makeCategory({ seq: 3, name: '공부', order: 2 });
const 요리 = makeCategory({
  seq: 4,
  name: '요리',
  status: 'completed',
  closedAt: '2026-01-20T00:00:00.000Z',
});

beforeEach(async () => {
  setRepositories(createMemoryRepositories());
  // 저장소에도 같은 값을 깔아 둔다 — `load()` 로 다시 읽는 테스트가 있고, 스토어에만 깔면
  // 드래그가 건드린 두 건만 저장소에 있어 나머지가 사라진 것처럼 보인다.
  for (const category of [운동, 독서, 공부, 요리]) {
    await getRepositories().categories.upsert(category as Persistable<Category>);
  }
  useTodoStore.setState({ byId: {} });
  useCategoryStore.setState({
    byId: indexCategories([운동, 독서, 공부, 요리]),
    status: 'ready',
    error: null,
    pendingRemoval: null,
  });
});

function 데이터전송() {
  return { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '', types: [] };
}

function 손잡이(name: string): HTMLElement {
  return screen.getByRole('button', { name: `${name} 순서 변경 (Alt+위/아래)` });
}

function 행(name: string): HTMLElement {
  const row = 손잡이(name).closest('li');
  if (row === null) throw new Error(`${name} 행이 없다`);
  return row;
}

/** 활성 행 본체의 이름들 — 손잡이·메뉴 버튼은 빼고 본체만 읽는다. */
function 이름들(): string[] {
  return screen.getAllByRole('listitem').map((item) => {
    const body = within(item)
      .getAllByRole('button')
      .filter((button) => !/순서 변경|메뉴$/u.test(button.getAttribute('aria-label') ?? ''));
    return (body[0].textContent ?? '').replace('공유 연결 없음', '');
  });
}

/**
 * 손잡이에서 드래그를 시작하고 대상 행 위에 떨어뜨린다.
 *
 * `fireEvent.drop(el, { clientY })` 를 쓰지 않는다: jsdom 에 `DragEvent` 가 없어 testing-library 가
 * 평범한 `Event` 로 떨어뜨리고, 그러면 `clientY` 가 사라져 **언제나 "행 앞"** 으로 판정된다.
 * `MouseEvent` 로 직접 만들어 좌표를 살린다. jsdom 에는 레이아웃이 없어 행의
 * `getBoundingClientRect()` 는 0 이므로 `clientY > 0` 이 곧 "뒤" 다.
 */
function 끌어놓기(from: string, to: string, after: boolean): void {
  fireEvent.dragStart(손잡이(from), { dataTransfer: 데이터전송() });
  fireEvent(
    행(to),
    new MouseEvent('drop', { bubbles: true, cancelable: true, clientY: after ? 1 : 0 }),
  );
}

describe('드래그 순서 변경 (R5)', () => {
  it('뒤쪽 행의 아래에 떨어뜨리면 그 뒤로 가고 결과를 낭독한다', async () => {
    render(<CategoryList />);

    끌어놓기('운동', '공부', true);

    await waitFor(() => expect(이름들()).toEqual(['독서', '공부', '운동']));
    expect(screen.getByRole('status')).toHaveTextContent('운동 을(를) 3번째로 옮겼어요');
  });

  it('앞쪽 행의 위에 떨어뜨리면 그 앞으로 간다', async () => {
    render(<CategoryList />);

    끌어놓기('공부', '운동', false);

    await waitFor(() => expect(이름들()).toEqual(['공부', '운동', '독서']));
    expect(screen.getByRole('status')).toHaveTextContent('공부 을(를) 1번째로 옮겼어요');
  });

  it('자기 행 위에 떨어뜨리면 아무것도 바뀌지 않는다', async () => {
    render(<CategoryList />);

    끌어놓기('독서', '독서', true);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(이름들()).toEqual(['운동', '독서', '공부']);
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('저장한 순서가 실제로 남는다 — 다시 읽어도 같다', async () => {
    render(<CategoryList />);

    끌어놓기('운동', '독서', true);
    await waitFor(() => expect(이름들()).toEqual(['독서', '운동', '공부']));

    await act(() => useCategoryStore.getState().load());
    expect(이름들()).toEqual(['독서', '운동', '공부']);
  });

  it('종료된 카테고리에는 손잡이가 없어 끌 수 없다 (R8)', async () => {
    const user = userEvent.setup();
    render(<CategoryList />);
    await user.click(screen.getByRole('button', { name: /종료됨 \(1\)/u }));

    expect(screen.queryByRole('button', { name: /요리 순서 변경/u })).toBeNull();
  });

  it('투두와 다른 MIME 으로 id 를 싣는다 — 날짜 스트립이 이 드래그를 받지 않는다', () => {
    render(<CategoryList />);
    const dataTransfer = 데이터전송();

    fireEvent.dragStart(손잡이('운동'), { dataTransfer });

    expect(dataTransfer.setData).toHaveBeenCalledWith(CATEGORY_DRAG_MIME, 운동.id);
  });
});
