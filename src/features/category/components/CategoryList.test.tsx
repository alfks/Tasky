// 사이드바 목록 테스트 (category §2-A·§2-D, R5·R8·R9·R18·R19).
//
// 픽스처는 **비대칭**이다: 활성 3개의 `order` 가 서로 다르고(운동 0 · 독서 1 · 공부 2), 투두 개수도
// 카테고리마다 다르다 — 각 그룹에 1건씩만 두면 순서를 뒤집거나 그룹을 바꿔도 같은 화면이 나온다.
// 종료 카테고리도 **완료(요리) + 중단(청소) 둘 다** 깐다: 한쪽만 두면 행 메뉴의
// `completed ? '중단으로 바꾸기' : '완료로 바꾸기'` 삼항을 상수로 바꿔도 전부 초록이다(R7 의 절반이 무방비).
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
/** 종료 목록의 반대쪽 분기. `closedAt` 도 요리와 달라 R8 내림차순이 섞이지 않는다. */
const 청소 = makeCategory({
  seq: 5,
  name: '청소',
  status: 'paused',
  closedAt: '2026-01-21T00:00:00.000Z',
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
    byId: indexCategories([운동, 독서, 공부, 요리, 청소]),
    status: 'ready',
    error: null,
    pendingRemoval: null,
  });
});

/**
 * 행 본체 버튼 — 손잡이(`⠿ … 순서 변경`)도 메뉴(`… 메뉴`)도 아닌 버튼 하나. **인덱스로 집지
 * 않는다**: 활성 행은 손잡이가 앞에 붙고 종료 행은 같은 크기의 빈 칸이 붙어서 자리가 다르다.
 */
function rowBody(item: HTMLElement): HTMLElement {
  const buttons = within(item)
    .getAllByRole('button')
    .filter((button) => !/순서 변경|메뉴$/u.test(button.getAttribute('aria-label') ?? ''));
  return buttons[0];
}

/** 행 본체 버튼의 이름들 — 접힌 종료 섹션은 여기 나오지 않는다. */
function rowNames(): string[] {
  return screen
    .getAllByRole('listitem')
    .map((item) => (rowBody(item).textContent ?? '').replace('공유 연결 없음', ''));
}

describe('목록 (R5·R8·R19)', () => {
  it('활성 카테고리를 `order` 순으로 보여주고 종료된 것은 접힌 섹션에 둔다', () => {
    render(<CategoryList />);

    // 이름·이모지·`n/m` 이 한 줄에 다 있고 그룹마다 값이 다르다 (R19).
    expect(rowNames()).toEqual(['운동', '독서0/1', '📚공부1/2']);
    expect(screen.queryByRole('button', { name: /요리/u })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /청소/u })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /종료됨 \(2\)/u })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('선택 날짜 기준 완료/전체를 그룹마다 따로 보여준다', () => {
    render(<CategoryList />);
    const [운동행, 독서행, 공부행] = screen.getAllByRole('listitem');

    expect(rowBody(운동행)).toHaveAccessibleName('운동');
    expect(rowBody(운동행)).toHaveAccessibleDescription('공유 연결 없음');
    expect(rowBody(독서행)).toHaveTextContent('0/1');
    expect(rowBody(공부행)).toHaveTextContent('1/2');
  });

  it('종료됨 섹션을 펼치면 완료·중단 배지가 각각 보인다 (R8)', async () => {
    const user = userEvent.setup();
    render(<CategoryList />);

    await user.click(screen.getByRole('button', { name: /종료됨 \(2\)/u }));

    // `closedAt` 내림차순이라 청소(1/21) 가 요리(1/20) 보다 앞이고, 배지는 상태마다 다르다.
    expect(rowNames().slice(3)).toEqual(['청소⏸ 중단', '요리✓ 완료']);
  });
});

describe('순서 변경 (R5)', () => {
  it('`Alt+↓` 로 한 칸 내리고 결과를 낭독한다', async () => {
    const user = userEvent.setup();
    render(<CategoryList />);
    const 운동행 = rowBody(screen.getAllByRole('listitem')[0]);

    운동행.focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');

    await waitFor(() => expect(rowNames()[0]).toContain('독서'));
    expect(rowNames()[1]).toContain('운동');
    expect(screen.getByRole('status')).toHaveTextContent('운동 을(를) 2번째로 옮겼어요');
  });

  it('`Alt` 없는 ↑/↓ 는 순서를 건드리지 않는다', async () => {
    const user = userEvent.setup();
    render(<CategoryList />);
    const 운동행 = rowBody(screen.getAllByRole('listitem')[0]);

    // 목록 방향키는 나중에 셸이 "선택 이동" 으로 쓸 자리다 — 가드가 조용히 빠지면 방향키마다 순서가 뒤집힌다.
    운동행.focus();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowUp}');

    expect(rowNames()).toEqual(['운동', '독서0/1', '📚공부1/2']);
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('맨 위에서 `Alt+↑` 는 아무것도 바꾸지 않는다', async () => {
    const user = userEvent.setup();
    render(<CategoryList />);
    const 운동행 = rowBody(screen.getAllByRole('listitem')[0]);

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
    expect(screen.getByRole('button', { name: /종료됨 \(3\)/u })).toBeInTheDocument();
  });

  it('완료(completed) 행의 메뉴는 재개와 `중단으로 바꾸기` 를 준다 (R7·R9)', async () => {
    const user = userEvent.setup();
    render(<CategoryList />);
    await user.click(screen.getByRole('button', { name: /종료됨 \(2\)/u }));

    await user.click(screen.getByRole('button', { name: '요리 메뉴' }));
    expect(await screen.findByRole('menuitem', { name: '중단으로 바꾸기' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '완료로 바꾸기' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: '재개' }));

    await waitFor(() => expect(rowNames()).toHaveLength(5));
    // 재개는 활성 목록 끝으로 간다 (R9). 청소는 종료된 채 남아 섹션이 (1) 이 된다.
    expect(rowNames()[3]).toContain('요리');
    expect(screen.getByRole('button', { name: /종료됨 \(1\)/u })).toBeInTheDocument();
  });

  it('중단(paused) 행의 메뉴는 `완료로 바꾸기` 를 주고 실제로 완료가 된다 (R7)', async () => {
    const user = userEvent.setup();
    render(<CategoryList />);
    await user.click(screen.getByRole('button', { name: /종료됨 \(2\)/u }));

    // 완료 행과 **반대쪽** 분기다 — 라벨을 한쪽으로 상수화하면 여기서 죽는다.
    await user.click(screen.getByRole('button', { name: '청소 메뉴' }));
    expect(await screen.findByRole('menuitem', { name: '완료로 바꾸기' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '중단으로 바꾸기' })).not.toBeInTheDocument();

    // 라벨만 맞고 전이가 반대면 `paused → paused` 라 도메인이 거절한다 — 결과까지 단언한다.
    await user.click(screen.getByRole('menuitem', { name: '완료로 바꾸기' }));

    await waitFor(() => expect(rowNames()).toContain('청소✓ 완료'));
    expect(screen.getByRole('button', { name: /종료됨 \(2\)/u })).toBeInTheDocument();
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

  it('적재 중에는 스켈레톤만 두고 추가 버튼은 감춘다 (§2-D)', () => {
    useCategoryStore.setState({ byId: {}, status: 'loading' });
    render(<CategoryList />);

    // 아직 안 읽힌 목록 위에서 만들기를 열면 유일성 검사(R2)가 빈 모집단으로 돈다.
    expect(screen.queryByRole('button', { name: '+ 카테고리 추가' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '첫 카테고리 만들기' })).not.toBeInTheDocument();
  });

  it('적재에 실패하면 문구와 다시 시도를 보여준다', () => {
    useCategoryStore.setState({ status: 'error', error: '저장하지 못했어요. 다시 시도해 주세요' });
    render(<CategoryList />);

    expect(screen.getByRole('alert')).toHaveTextContent('저장하지 못했어요');
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });
});
