// 관리 화면 순서 변경(routine.md R13)의 **배선** — `CategoryList.dnd.test.tsx` 와 같은 방식.
//
// jsdom 에는 레이아웃도 `DataTransfer` 도 없다. 여기서 고정하는 것은 "드롭·`Alt+↑/↓` 가 어떤 좌표로
// 스토어에 닿고 무엇을 낭독하는가" 까지이고, 좌표 계산은 `src/lib/drag-order.test.ts`, 재매김은
// `src/domain/routine/routine-rank.test.ts` 가 따로 못 박는다. 본문을 직접 렌더한다(lazy 껍질은
// `RoutineManager.test.tsx` 가 본다).
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adopt } from '@/domain/meta';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { useDateStripStore } from '@/features/date-strip';
import { ROUTINE_DRAG_MIME } from '@/features/todo/components/routine-drag';
import { RoutineManagerDialog } from '@/features/todo/components/RoutineManagerDialog';
import { useTodoStore } from '@/features/todo/store/todo-store';
import { makeCategory } from '@/test/fixtures/category';
import { FIXTURE_DATE } from '@/test/fixtures/deps';
import { makeRoutine } from '@/test/fixtures/routine';
import { makeTodo } from '@/test/fixtures/todo';

const 카테고리 = makeCategory({ seq: 1, name: '아침', order: 0 });
const 운동 = makeRoutine({ seq: 1, title: '운동', order: 0 });
const 독서 = makeRoutine({ seq: 2, title: '독서', order: 1 });
const 명상 = makeRoutine({ seq: 3, title: '명상', order: 2 });

beforeEach(async () => {
  setRepositories(createMemoryRepositories());
  for (const routine of [운동, 독서, 명상]) {
    await getRepositories().routines.upsert(adopt(routine));
  }
  useTodoStore.setState({
    byId: {},
    date: null,
    status: 'idle',
    error: null,
    writeRevision: 0,
    routines: {},
    routineStatus: 'idle',
  });
  useDateStripStore.setState({ selectedDate: FIXTURE_DATE, today: FIXTURE_DATE, view: 'week' });
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

/** 목록 순서 — 손잡이의 접근 이름에서 뽑는다(행 본체는 반복 문구가 붙어 이름만 비교할 수 없다). */
function 이름들(): string[] {
  return screen
    .getAllByRole('button', { name: /순서 변경 \(Alt\+위\/아래\)$/u })
    .map((button) => (button.getAttribute('aria-label') ?? '').replace(/ 순서 변경.*$/u, ''));
}

/** 본문을 열고 목록이 적재될 때까지 기다린다. */
async function openDialog() {
  render(<RoutineManagerDialog categories={[카테고리]} onClose={() => {}} />);
  await screen.findByRole('dialog', { name: '루틴' });
  await waitFor(() => expect(이름들()).toEqual(['운동', '독서', '명상']));
}

/** `MouseEvent` 로 직접 만들어 `clientY` 를 살린다 — jsdom 은 레이아웃이 없어 `clientY > 0` 이 곧 "뒤" 다. */
function 끌어놓기(from: string, to: string, after: boolean): void {
  fireEvent.dragStart(손잡이(from), { dataTransfer: 데이터전송() });
  fireEvent(
    행(to),
    new MouseEvent('drop', { bubbles: true, cancelable: true, clientY: after ? 1 : 0 }),
  );
}

describe('드래그 순서 변경 (R13)', () => {
  it('뒤쪽 행의 아래에 떨어뜨리면 그 뒤로 가고 결과를 낭독한다', async () => {
    await openDialog();

    끌어놓기('운동', '명상', true);

    await waitFor(() => expect(이름들()).toEqual(['독서', '명상', '운동']));
    expect(screen.getByRole('status')).toHaveTextContent('운동 루틴을 3번째로 옮겼어요');
  });

  it('앞쪽 행의 위에 떨어뜨리면 그 앞으로 간다', async () => {
    await openDialog();

    끌어놓기('명상', '운동', false);

    await waitFor(() => expect(이름들()).toEqual(['명상', '운동', '독서']));
    expect(screen.getByRole('status')).toHaveTextContent('명상 루틴을 1번째로 옮겼어요');
  });

  it('자기 행 위에 떨어뜨리면 아무것도 바뀌지 않는다', async () => {
    await openDialog();

    끌어놓기('독서', '독서', true);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(이름들()).toEqual(['운동', '독서', '명상']);
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('투두·카테고리와 다른 MIME 으로 id 를 싣는다', async () => {
    await openDialog();
    const dataTransfer = 데이터전송();

    fireEvent.dragStart(손잡이('운동'), { dataTransfer });

    expect(dataTransfer.setData).toHaveBeenCalledWith(ROUTINE_DRAG_MIME, 운동.id);
  });

  it('저장한 순서가 실제로 남는다 — 다시 읽어도 같다', async () => {
    await openDialog();

    끌어놓기('운동', '독서', true);
    await waitFor(() => expect(이름들()).toEqual(['독서', '운동', '명상']));

    await act(() => useTodoStore.getState().loadRoutines());
    expect(이름들()).toEqual(['독서', '운동', '명상']);
  });
});

describe('키보드 `Alt+↑/↓` (R13·§5)', () => {
  it('손잡이에서 Alt+↓ 를 누르면 한 칸 내려가고 같은 문면을 낭독한다', async () => {
    const user = userEvent.setup();
    await openDialog();

    손잡이('운동').focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');

    await waitFor(() => expect(이름들()).toEqual(['독서', '운동', '명상']));
    expect(screen.getByRole('status')).toHaveTextContent('운동 루틴을 2번째로 옮겼어요');
  });

  it('맨 위에서 Alt+↑ 는 아무것도 바꾸지 않고 낭독도 없다', async () => {
    const user = userEvent.setup();
    await openDialog();

    손잡이('운동').focus();
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(이름들()).toEqual(['운동', '독서', '명상']);
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});

describe('오늘 보드 반영 (R13 — 이미 만들어진 인스턴스)', () => {
  it('순서를 바꾸면 보고 있는 날짜의 인스턴스가 메모리에서도 바로 그 순서다', async () => {
    const 운동인스턴스 = makeTodo({ seq: 1, title: '운동', routineId: 운동.id, order: 0 });
    const 독서인스턴스 = makeTodo({ seq: 2, title: '독서', routineId: 독서.id, order: 1 });
    await getRepositories().todos.upsert(adopt(운동인스턴스));
    await getRepositories().todos.upsert(adopt(독서인스턴스));
    await act(() => useTodoStore.getState().loadDate(FIXTURE_DATE));
    const user = userEvent.setup();
    await openDialog();

    손잡이('독서').focus();
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');

    await waitFor(() => expect(이름들()).toEqual(['독서', '운동', '명상']));
    const board = Object.values(useTodoStore.getState().byId)
      .sort((a, b) => a.order - b.order)
      .map((todo) => todo.title);
    expect(board).toEqual(['독서', '운동']);
  });
});
