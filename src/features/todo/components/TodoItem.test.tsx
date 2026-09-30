// 🔁 배지 (routine.md §2·§5·R9·R10). 완료 조건: "배지가 스크린리더에 어떻게 읽히는지" — 아이콘만
// 이면 의미가 전달되지 않으므로 `role="img"` + `aria-label` 로 문장 전체를 읽게 하는지 고정한다.
// **탭 스톱은 만들지 않는다**(리뷰 Major 4) — 형제 배지(🗒·⏱)와 같은 규약이고, 만들면 배지에
// 포커스가 있는 동안 행 단축키(Space 등)가 `e.target !== e.currentTarget` 가드에 걸려 죽는다.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Category } from '@/domain/category/category';
import type { Persistable } from '@/domain/meta';
import type { Routine } from '@/domain/routine/routine';
import type { Todo } from '@/domain/todo/todo';

import { getRepositories, setRepositories } from '@/repositories/container';
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
  fillFloor: FIXTURE_DATE,
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

  it('배지는 탭 스톱이 아니고 Space 로 메뉴를 열 수 있다', async () => {
    const user = userEvent.setup();
    await 화면();
    const badge = screen.getByRole('img', { name: '루틴: 매주 목 반복' });

    expect(badge).not.toHaveAttribute('tabindex');

    const row = screen.getByRole('checkbox', { name: '아침 스트레칭' }).closest('li')!;
    row.focus();
    expect(row).toHaveFocus();
    await user.keyboard(' ');

    expect(screen.getByRole('menu', { name: '아침 스트레칭 메뉴' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '아침 스트레칭' })).not.toBeChecked();
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

// "날짜 바꾸기…" 는 네이티브 날짜 입력이 아니라 일 피커(date-strip `DayPickerPopover`, todo.md R10-b)를
// 연다. 피커 본문은 지연 로드라 `findBy` 로 기다린다. 격자 규칙 자체는 DayPicker.test 가 재고,
// 여기서는 메뉴 → 피커 → 확정 → 이동·토스트·포커스 인계까지 **행의 배선**만 본다.
describe('날짜 바꾸기… (R10-b)', () => {
  it('메뉴 항목이 grid "날짜 고르기" 를 열고, 칸을 고르면 그 날짜로 옮기며 팝오버가 닫힌다', async () => {
    const user = userEvent.setup();
    await 화면();

    await user.click(screen.getByRole('button', { name: '독서' }));
    await user.click(screen.getByRole('menuitem', { name: '날짜 바꾸기…' }));

    const grid = await screen.findByRole('grid', { name: '날짜 고르기' });
    expect(grid).toBeInTheDocument();
    expect(screen.getByText("'독서'를 어느 날로 옮길까요?")).toBeInTheDocument();
    // 열리면 포커스는 현재 값(2026-01-15, 목요일)의 칸이다.
    expect(screen.getByRole('gridcell', { name: '1월 15일 목요일' })).toHaveFocus();
    // 네이티브 입력은 남아 있지 않다.
    expect(document.querySelector('input[type="date"]')).toBeNull();

    await user.click(screen.getByRole('gridcell', { name: '1월 20일 화요일' }));

    // 이동이 확정되면 오늘 목록에서 사라지고 피커도 내려간다.
    await waitFor(() => {
      expect(screen.queryByRole('checkbox', { name: '독서' })).toBeNull();
    });
    expect(screen.queryByRole('grid', { name: '날짜 고르기' })).toBeNull();
    // 저장소에는 새 날짜로 남아 있다.
    const moved = await getRepositories().todos.getById(일반투두.id);
    expect(moved?.date).toBe('2026-01-20');
    // 포커스가 body 로 떨어지지 않는다(app-shell R14).
    await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
    });
  });

  it('Esc 는 변경 없이 닫고 포커스가 제목 버튼으로 돌아온다', async () => {
    const user = userEvent.setup();
    await 화면();

    await user.click(screen.getByRole('button', { name: '독서' }));
    await user.click(screen.getByRole('menuitem', { name: '날짜 바꾸기…' }));
    await screen.findByRole('grid', { name: '날짜 고르기' });
    const menuButton = screen.getByRole('button', { name: '독서' });
    const row = screen.getByRole('checkbox', { name: '독서' }).closest('li');
    // 앵커는 제목 버튼이다(listitem 에는 aria-haspopup 이 허용되지 않는다).
    expect(row).not.toHaveAttribute('aria-haspopup');
    expect(row).not.toHaveAttribute('aria-expanded');
    expect(menuButton).toHaveAttribute('aria-haspopup', 'grid');
    expect(menuButton).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('grid', { name: '날짜 고르기' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: '독서' })).toBeInTheDocument();
    expect(menuButton).toHaveFocus();
    // 닫히면 메뉴 팝오버의 속성으로 돌아간다.
    expect(menuButton).toHaveAttribute('aria-haspopup', 'menu');
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('피커가 열린 채 같은 행 제목을 누르면 피커가 먼저 닫히고 메뉴만 열린다', async () => {
    const user = userEvent.setup();
    await 화면();

    await user.click(screen.getByRole('button', { name: '독서' }));
    await user.click(screen.getByRole('menuitem', { name: '날짜 바꾸기…' }));
    await screen.findByRole('grid', { name: '날짜 고르기' });

    await user.click(screen.getByRole('button', { name: '독서' }));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.queryByRole('grid', { name: '날짜 고르기' })).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
