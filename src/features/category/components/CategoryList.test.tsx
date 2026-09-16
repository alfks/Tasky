// 사이드바 목록 테스트 (category §2-A·§2-D, R5·R8·R9·R18·R19).
//
// 픽스처는 **비대칭**이다: 활성 3개의 `order` 가 서로 다르고(운동 0 · 독서 1 · 공부 2), 투두 개수도
// 카테고리마다 다르다 — 각 그룹에 1건씩만 두면 순서를 뒤집거나 그룹을 바꿔도 같은 화면이 나온다.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Todo } from '@/domain/todo/todo';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { CategoryList } from '@/features/category/components/CategoryList';
import { indexCategories } from '@/features/category/store/category-state';
import { useCategoryStore } from '@/features/category/store/category-store';
import { useTodoStore } from '@/features/todo';
import { makeCategory } from '@/test/fixtures/category';
import { makeTodo } from '@/test/fixtures/todo';

const 운동 = makeCategory({ seq: 1, name: '운동', order: 0 });
const 독서 = makeCategory({ seq: 2, name: '독서', order: 1 });
const 공부 = makeCategory({ seq: 3, name: '공부', order: 2, emoji: '📚' });
const 요리 = makeCategory({
  seq: 4,
  name: '요리',
  status: 'completed',
  closedAt: '2026-01-20T00:00:00.000Z',
});

/** 공부 2건(1건 완료) · 독서 1건(미완료) · 운동 0건 — R19 의 `n/m` 이 그룹마다 달라야 한다. */
const todos: Todo[] = [
  makeTodo({ seq: 1, categoryId: 공부.id, title: '수학', done: true }),
  makeTodo({ seq: 2, categoryId: 공부.id, title: '영어' }),
  makeTodo({ seq: 3, categoryId: 독서.id, title: '소설' }),
];

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  useTodoStore.setState({ byId: Object.fromEntries(todos.map((todo) => [todo.id, todo])) });
  useCategoryStore.setState({
    byId: indexCategories([운동, 독서, 공부, 요리]),
    status: 'ready',
    error: null,
    pendingRemoval: null,
  });
});

/** 행 본체 버튼의 이름들 — 접힌 종료 섹션은 여기 나오지 않는다. */
function rowNames(): string[] {
  return screen
    .getAllByRole('listitem')
    .map((item) => within(item).getAllByRole('button')[0].textContent ?? '');
}

describe('목록 (R5·R8·R19)', () => {
  it('활성 카테고리를 `order` 순으로 보여주고 종료된 것은 접힌 섹션에 둔다', () => {
    render(<CategoryList />);

    // 이름·이모지·`n/m` 이 한 줄에 다 있고 그룹마다 값이 다르다 (R19).
    expect(rowNames()).toEqual(['운동', '독서0/1', '📚공부1/2']);
    expect(screen.queryByRole('button', { name: /요리/u })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /종료됨 \(1\)/u })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('선택 날짜 기준 완료/전체를 그룹마다 따로 보여준다', () => {
    render(<CategoryList />);
    const [운동행, 독서행, 공부행] = screen.getAllByRole('listitem');

    expect(within(운동행).getAllByRole('button')[0]).toHaveTextContent(/^운동$/u);
    expect(within(독서행).getAllByRole('button')[0]).toHaveTextContent('0/1');
    expect(within(공부행).getAllByRole('button')[0]).toHaveTextContent('1/2');
  });

  it('종료됨 섹션을 펼치면 상태 배지와 함께 보인다', async () => {
    const user = userEvent.setup();
    render(<CategoryList />);

    await user.click(screen.getByRole('button', { name: /종료됨 \(1\)/u }));

    const rows = screen.getAllByRole('listitem');
    expect(within(rows[rows.length - 1]).getAllByRole('button')[0]).toHaveTextContent('요리✓ 완료');
  });
});

describe('순서 변경 (R5)', () => {
  it('`Alt+↓` 로 한 칸 내리고 결과를 낭독한다', async () => {
    const user = userEvent.setup();
    render(<CategoryList />);
    const 운동행 = within(screen.getAllByRole('listitem')[0]).getAllByRole('button')[0];

    운동행.focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');

    await waitFor(() => expect(rowNames()[0]).toContain('독서'));
    expect(rowNames()[1]).toContain('운동');
    expect(screen.getByRole('status')).toHaveTextContent('운동 을(를) 2번째로 옮겼어요');
  });

  it('맨 위에서 `Alt+↑` 는 아무것도 바꾸지 않는다', async () => {
    const user = userEvent.setup();
    render(<CategoryList />);
    const 운동행 = within(screen.getAllByRole('listitem')[0]).getAllByRole('button')[0];

    운동행.focus();
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');

    expect(rowNames()[0]).toContain('운동');
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});

describe('행 메뉴 (R7·R8)', () => {
  it('완료로 종료하면 활성 목록에서 빠지고 종료됨 개수가 늘어난다', async () => {
    const user = userEvent.setup();
    render(<CategoryList />);

    await user.click(screen.getByRole('button', { name: '독서 메뉴' }));
    await user.click(await screen.findByRole('menuitem', { name: '완료로 종료' }));

    await waitFor(() => expect(rowNames()).toHaveLength(2));
    expect(rowNames().join()).not.toContain('독서');
    expect(screen.getByRole('button', { name: /종료됨 \(2\)/u })).toBeInTheDocument();
  });

  it('종료된 카테고리는 재개·상태 바꾸기를 준다', async () => {
    const user = userEvent.setup();
    render(<CategoryList />);
    await user.click(screen.getByRole('button', { name: /종료됨 \(1\)/u }));

    await user.click(screen.getByRole('button', { name: '요리 메뉴' }));
    expect(await screen.findByRole('menuitem', { name: '중단으로 바꾸기' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: '재개' }));

    await waitFor(() => expect(rowNames()).toHaveLength(4));
    // 재개는 활성 목록 끝으로 간다 (R9).
    expect(rowNames()[3]).toContain('요리');
  });

  it('수정을 고르면 그 카테고리로 다이얼로그가 열린다', async () => {
    const user = userEvent.setup();
    render(<CategoryList />);

    await user.click(screen.getByRole('button', { name: '공부 메뉴' }));
    await user.click(await screen.findByRole('menuitem', { name: '수정' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('이름')).toHaveValue('공부');
  });

  it('삭제 항목은 처리기(T-12b)를 받았을 때만 나온다', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const { rerender } = render(<CategoryList />);

    await user.click(screen.getByRole('button', { name: '공부 메뉴' }));
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '삭제' })).not.toBeInTheDocument();

    rerender(<CategoryList onRemove={onRemove} />);
    await user.click(screen.getByRole('menuitem', { name: '삭제' }));

    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ name: '공부' }));
  });
});

describe('빈 상태·적재 (§2-D·R18)', () => {
  it('카테고리가 없으면 첫 카테고리 만들기를 권한다', async () => {
    const user = userEvent.setup();
    useCategoryStore.setState({ byId: {}, status: 'ready' });
    render(<CategoryList />);

    expect(screen.getByText('아직 카테고리가 없어요')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '첫 카테고리 만들기' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('처음 열면 카테고리를 읽고 첫 실행이면 시드 하나가 보인다 (R18)', async () => {
    useCategoryStore.setState({ byId: {}, status: 'idle' });
    render(<CategoryList />);

    expect(await screen.findByRole('button', { name: 'todo' })).toBeInTheDocument();
    expect(rowNames()).toHaveLength(1);
  });

  it('적재에 실패하면 문구와 다시 시도를 보여준다', () => {
    useCategoryStore.setState({ status: 'error', error: '저장하지 못했어요. 다시 시도해 주세요' });
    render(<CategoryList />);

    expect(screen.getByRole('alert')).toHaveTextContent('저장하지 못했어요');
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });
});
