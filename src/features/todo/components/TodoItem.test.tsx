// 🔁 배지 (routine.md §2·§5·R9·R10). 완료 조건: "배지가 스크린리더에 어떻게 읽히는지" — 아이콘만
// 이면 의미가 전달되지 않으므로 `role="img"` + `aria-label` 로 문장 전체를 읽게 하는지 고정한다.
// **탭 스톱은 만들지 않는다**(리뷰 Major 4) — 형제 배지(🗒·⏱)와 같은 규약이고, 만들면 배지에
// 포커스가 있는 동안 행 단축키(Space 등)가 `e.target !== e.currentTarget` 가드에 걸려 죽는다.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Category } from '@/domain/category/category';
import type { Persistable } from '@/domain/meta';
import type { Routine } from '@/domain/routine/routine';
import type { Todo } from '@/domain/todo/todo';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { TodoList } from '@/features/todo/components/TodoList';
import { useTodoStore } from '@/features/todo/store/todo-store';
import { makeCategory } from '@/test/fixtures/category';
import { FIXTURE_DATE, FIXTURE_INSTANT, fixtureId } from '@/test/fixtures/deps';
import { makeTodo } from '@/test/fixtures/todo';

const 공부 = makeCategory({ seq: 1, name: '공부', order: 0 });

// FIXTURE_DATE(2026-01-15)는 목요일이다.
const 루틴: Routine = {
  id: fixtureId('generated', 1),
  createdAt: FIXTURE_INSTANT,
  updatedAt: FIXTURE_INSTANT,
  rev: 1,
  title: '아침 스트레칭',
  categoryId: 공부.id,
  recurrence: { type: 'weekly', daysOfWeek: [4] },
  startDate: FIXTURE_DATE,
  active: true,
  materializedThrough: FIXTURE_DATE,
};

const 루틴투두 = makeTodo({
  seq: 1,
  categoryId: 공부.id,
  title: '아침 스트레칭',
  routineId: 루틴.id,
});
const 일반투두 = makeTodo({ seq: 2, categoryId: 공부.id, title: '독서', order: 1 });

beforeEach(async () => {
  setRepositories(createMemoryRepositories());
  useTodoStore.setState({
    byId: {},
    date: null,
    status: 'idle',
    error: null,
    routines: {},
    routineStatus: 'idle',
  });
});

async function 화면(routines: Record<string, Routine> = { [루틴.id]: 루틴 }) {
  useTodoStore.setState({ routines });
  const repos = createMemoryRepositories();
  setRepositories(repos);
  await repos.todos.upsert(루틴투두 as Persistable<Todo>);
  await repos.todos.upsert(일반투두 as Persistable<Todo>);
  render(<TodoList date={FIXTURE_DATE} categories={[공부] as Category[]} />);
  await screen.findByRole('checkbox', { name: '아침 스트레칭' });
}

describe('🔁 배지', () => {
  it('루틴에서 나온 투두에만 배지가 있고, 접근 이름이 반복 패턴 문장이다(아이콘만이 아니다)', async () => {
    await 화면();

    const badge = screen.getByRole('img', { name: '루틴: 매주 목 반복' });
    expect(badge).toBeInTheDocument();
    // 일반 투두(독서)에는 배지가 없다 — 전체 배지 수가 1개뿐이어야 한다.
    expect(screen.getAllByRole('img', { name: /^루틴:/ })).toHaveLength(1);
  });

  it('마우스 hover 는 title 로 같은 문장을 보여준다', async () => {
    await 화면();
    const badge = screen.getByRole('img', { name: '루틴: 매주 목 반복' });

    expect(badge).toHaveAttribute('title', '루틴: 매주 목 반복');
  });

  it('배지는 탭 스톱이 아니다 — 행 단축키(Space 로 완료 토글)를 그대로 살려 둔다(리뷰 Major 4)', async () => {
    const user = userEvent.setup();
    await 화면();
    const badge = screen.getByRole('img', { name: '루틴: 매주 목 반복' });

    expect(badge).not.toHaveAttribute('tabindex');

    const row = screen.getByRole('checkbox', { name: '아침 스트레칭' }).closest('li')!;
    row.focus();
    expect(row).toHaveFocus();
    await user.keyboard(' ');

    expect(screen.getByRole('checkbox', { name: '아침 스트레칭' })).toBeChecked();
  });

  it('routines 맵에 그 루틴이 없으면(삭제됨, R10) 배지가 사라진다 — 원본 없이 아이콘만 남지 않는다', async () => {
    await 화면({}); // 루틴 레코드가 store 에 없다 — 아직 안 읽었거나 삭제된 경우와 같은 모양.

    expect(screen.queryByRole('img', { name: /^루틴:/ })).toBeNull();
  });

  it('루틴에 연결되지 않은 투두는 애초에 배지 후보가 아니다', async () => {
    await 화면();
    const row = screen.getByRole('checkbox', { name: '독서' }).closest('li');
    expect(row?.querySelector('[role="img"][aria-label^="루틴:"]')).toBeNull();
  });
});
