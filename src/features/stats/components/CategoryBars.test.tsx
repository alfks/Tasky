// 카테고리별 막대 — 순서·비율·경계 (R5, §2 상태, §5 접근성).
//
// 카테고리마다 완료/전체를 전부 다르게 둔다(1/3·2/2·0/1·1/2·3/4). 대칭 픽스처였다면 순서를
// 뒤집거나 done/total 을 맞바꿔도 같은 화면이 나와 이 파일이 아무것도 검사하지 못한다.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Category } from '@/domain/category/category';
import type { Todo } from '@/domain/todo/todo';

import { CategoryBars } from '@/features/stats/components/CategoryBars';
import { useTodoStore } from '@/features/todo';
import { makeCategory } from '@/test/fixtures/category';
import { FIXTURE_DATE } from '@/test/fixtures/deps';
import { makeTodo } from '@/test/fixtures/todo';

const STUDY = makeCategory({ seq: 8, order: 0, name: '공부', emoji: '📚' });
const EXERCISE = makeCategory({ seq: 7, order: 1, name: '운동' });
const CHORES = makeCategory({ seq: 6, order: 2, name: '집안일' });
const CLOSED = makeCategory({
  seq: 2,
  name: '독서',
  status: 'completed',
  closedAt: '2026-01-10T00:00:00.000Z',
});
const REMOVED = makeCategory({ seq: 1, name: '옛것', deletedAt: '2026-01-11T00:00:00.000Z' });
// id 오름차순으로 정렬하면 맨 앞에 오는 값 — 표시 순서(R5)가 id 순서와 다른지 검사한다.
const GONE_ID = '00000000-0000-4000-8000-000000000009';

const CATEGORIES: Category[] = [STUDY, EXERCISE, CHORES, CLOSED, REMOVED];

function todosFor(categoryId: string, done: number, total: number, offset: number): Todo[] {
  return Array.from({ length: total }, (_, index) =>
    makeTodo({ seq: offset + index, categoryId, done: index < done }),
  );
}

/** 공부 1/3 · 운동 2/2 · 독서(종료) 0/1 · 옛것(삭제) 1/2 · 행 없는 것 3/4. 집안일은 투두 0개. */
function mixedTodos(): Todo[] {
  return [
    ...todosFor(STUDY.id, 1, 3, 1),
    ...todosFor(EXERCISE.id, 2, 2, 10),
    ...todosFor(CLOSED.id, 0, 1, 20),
    ...todosFor(REMOVED.id, 1, 2, 30),
    ...todosFor(GONE_ID, 3, 4, 40),
  ];
}

function seed(todos: readonly Todo[]): void {
  useTodoStore.setState({
    byId: Object.fromEntries(todos.map((todo) => [todo.id, todo])),
    date: FIXTURE_DATE,
    status: 'ready',
    error: null,
  });
}

beforeEach(() => {
  useTodoStore.setState({ byId: {}, date: null, status: 'idle', error: null });
});

describe('CategoryBars (R5)', () => {
  it('활성 order → 종료 → 삭제됨 → 이름 모를 것 순으로 그린다', () => {
    seed(mixedTodos());

    // 인자를 뒤집어 넘긴다 — 입력 순서를 그대로 흘리면 여기서 깨진다.
    render(<CategoryBars categories={[...CATEGORIES].reverse()} />);

    expect(screen.getAllByRole('progressbar').map((bar) => bar.getAttribute('aria-label'))).toEqual(
      ['공부', '운동', '독서', '옛것 (삭제됨)', '삭제된 카테고리'],
    );
  });

  it('막대마다 자기 완료/전체를 값으로 읽힌다 (§5)', () => {
    seed(mixedTodos());

    render(<CategoryBars categories={CATEGORIES} />);

    expect(
      screen
        .getAllByRole('progressbar')
        .map((bar) => [bar.getAttribute('aria-valuenow'), bar.getAttribute('aria-valuemax')]),
    ).toEqual([
      ['1', '3'],
      ['2', '2'],
      ['0', '1'],
      ['1', '2'],
      ['3', '4'],
    ]);
    expect(screen.getAllByRole('progressbar')[0]).toHaveAttribute(
      'aria-valuetext',
      '3개 중 1개 완료',
    );
  });

  it('채움 폭이 카테고리마다 반올림 없는 비율이다', () => {
    seed(mixedTodos());

    const { container } = render(<CategoryBars categories={CATEGORIES} />);
    const fills = Array.from(container.querySelectorAll('[role="progressbar"] > span'));

    expect(fills.map((fill) => fill.getAttribute('style'))).toEqual([
      `width: ${(1 / 3) * 100}%;`,
      'width: 100%;',
      'width: 0%;',
      'width: 50%;',
      'width: 75%;',
    ]);
  });

  it('숫자를 항상 병기한다 (색만으로 정보를 주지 않는다)', () => {
    seed(mixedTodos());

    render(<CategoryBars categories={CATEGORIES} />);

    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.getByText('0/1')).toBeInTheDocument();
  });

  it('그날 투두가 없는 카테고리는 줄을 만들지 않는다', () => {
    seed(mixedTodos());

    render(<CategoryBars categories={CATEGORIES} />);

    expect(screen.queryByText('집안일')).not.toBeInTheDocument();
  });

  it('카테고리가 0개여도 남은 투두의 막대는 남는다 (category R17 잔여 투두)', () => {
    seed(todosFor(GONE_ID, 3, 4, 1));

    render(<CategoryBars categories={[]} />);

    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', '삭제된 카테고리');
  });

  it('그날 투두가 하나도 없으면 안내 문구를 대신 보여준다 (§2)', () => {
    seed([]);

    render(<CategoryBars categories={CATEGORIES} />);

    expect(screen.getByText('오늘 적은 할 일이 없어요')).toBeInTheDocument();
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
  });

  it('카테고리가 아주 많아도 전부 그리고 채움 폭은 100%를 넘지 않는다', () => {
    const many = Array.from({ length: 24 }, (_, index) =>
      makeCategory({ seq: index + 1, order: index, name: `카테고리 ${index + 1}` }),
    );
    // i번째 카테고리는 i+1개 중 i개 완료 — 비율이 전부 다르다.
    seed(
      many.flatMap((category, index) => todosFor(category.id, index, index + 1, index * 100 + 1)),
    );

    const { container } = render(<CategoryBars categories={many} />);
    const widths = Array.from(container.querySelectorAll('[role="progressbar"] > span')).map(
      (fill) => Number((fill.getAttribute('style') ?? '').replace(/[^\d.]/g, '')),
    );

    expect(widths).toHaveLength(24);
    expect(Math.max(...widths)).toBeLessThanOrEqual(100);
    expect(widths[0]).toBe(0);
  });
});
