// 카테고리 간 드래그의 **배선** (todo.md R20). 같은 그룹 순서 변경(R11)과 한 화면에 공존한다.
//
// `TodoList` 를 통째로 띄운다. 그룹 하나만 렌더하면 "남의 그룹에서 왔는가" 를 판단하는 쪽(목록)이
// 빠져 배선의 절반이 검사되지 않는다 — 그리고 이 티켓이 막으려는 사고가 바로 그 절반이다.
//
// 화면이 아니라 **저장소**를 본다. 낙관적 갱신이 없는 액션이라 화면만 재면 저장 실패를 놓치고,
// 실제로 이 레포는 "화면엔 보이는데 저장은 안 된" 회귀를 여러 번 겪었다.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

import { ToastViewport, dismissToast, useToasts } from '@/components/ui/Toast';

const 공부 = makeCategory({ seq: 1, name: '공부', order: 0 });
const 운동 = makeCategory({ seq: 2, name: '운동', order: 1 });
const 요가 = makeCategory({ seq: 3, name: '요가', status: 'completed', closedAt: '2026-01-14T00:00:00.000Z' }); // prettier-ignore
const 요리 = makeCategory({ seq: 4, name: '요리' }); // 목록에 넘기지 않는다 = 삭제된 카테고리(R16).
const 카테고리: Category[] = [공부, 운동, 요가];

const 수학 = makeTodo({ seq: 1, categoryId: 공부.id, title: '수학', order: 0 });
const 영어 = makeTodo({ seq: 2, categoryId: 공부.id, title: '영어', order: 1 });
const 달리기 = makeTodo({ seq: 3, categoryId: 운동.id, title: '달리기', order: 0 });
const 스트레칭 = makeTodo({ seq: 4, categoryId: 요가.id, title: '스트레칭', order: 0 });
const 김치 = makeTodo({ seq: 5, categoryId: 요리.id, title: '김치찌개', done: true });

beforeEach(async () => {
  setRepositories(createMemoryRepositories());
  useTodoStore.setState({ byId: {}, date: null, status: 'idle', error: null });
  for (const todo of [수학, 영어, 달리기, 스트레칭, 김치]) {
    await getRepositories().todos.upsert(todo as Persistable<Todo>);
  }
});

function ToastHub() {
  return <ToastViewport toasts={useToasts()} onClose={dismissToast} />;
}

async function 화면(): Promise<void> {
  render(
    <>
      <TodoList date={FIXTURE_DATE} categories={카테고리} />
      <ToastHub />
    </>,
  );
  await screen.findByRole('checkbox', { name: '수학' });
}

/** 브라우저 `DataTransfer` 대역. jsdom 에 없어서 직접 만든다 — 드래그 내내 같은 객체를 쓴다. */
function 데이터전송() {
  const store = new Map<string, string>();
  return {
    setData: (type: string, value: string) => store.set(type, value),
    getData: (type: string) => store.get(type) ?? '',
    setDragImage: vi.fn(),
    effectAllowed: '',
    dropEffect: '',
    types: [] as string[],
  };
}

type 전송 = ReturnType<typeof 데이터전송>;

/** 손잡이에서 드래그를 시작한다. 돌려주는 객체가 그대로 드롭까지 따라간다(실제 브라우저와 같은 흐름). */
function 끌기시작(title: string): 전송 {
  const dataTransfer = 데이터전송();
  fireEvent.dragStart(screen.getByRole('button', { name: `${title} 순서 변경 (Alt+위/아래)` }), {
    dataTransfer,
  });
  return dataTransfer;
}

function 그룹(name: string): HTMLElement {
  return screen.getByRole('region', { name });
}

function 행(title: string): HTMLElement {
  const row = screen.getByRole('checkbox', { name: title }).closest('li');
  if (row === null) throw new Error(`${title} 행이 없다`);
  return row;
}

/** 저장소에 실제로 저장된 카테고리. 화면만 재면 저장 실패가 그대로 통과한다. */
async function 저장된카테고리(id: string): Promise<string | undefined> {
  return (await getRepositories().todos.getById(id))?.categoryId;
}

/** 한 그룹 안의 투두 제목을 화면 순서대로. */
function 제목들(name: string): string[] {
  return within(그룹(name))
    .getAllByRole('checkbox')
    .map((box) => document.getElementById(box.getAttribute('aria-labelledby') ?? '')?.textContent ?? ''); // prettier-ignore
}

describe('카테고리 간 드래그 (R20)', () => {
  it('다른 카테고리 그룹에 떨어뜨리면 그 카테고리로 저장된다', async () => {
    await 화면();

    fireEvent.drop(그룹('운동'), { dataTransfer: 끌기시작('수학') });

    await waitFor(async () => {
      await expect(저장된카테고리(수학.id)).resolves.toBe(운동.id);
    });
    expect(제목들('운동')).toEqual(['달리기', '수학']);
    expect(제목들('공부')).toEqual(['영어']);
  });

  it('다른 카테고리의 **항목 위**에 떨어뜨려도 순서 변경이 아니라 이동이다', async () => {
    await 화면();

    // 모호해지는 바로 그 지점: 남의 그룹의 행 위. 규칙은 "카테고리가 다르면 무조건 이동" 이다.
    fireEvent.drop(행('달리기'), { dataTransfer: 끌기시작('수학') });

    await waitFor(async () => {
      await expect(저장된카테고리(수학.id)).resolves.toBe(운동.id);
    });
    // 대상 그룹 **끝**으로 간다(R12) — 행 위에 떨어뜨렸다고 그 앞으로 끼어들지 않는다.
    expect(제목들('운동')).toEqual(['달리기', '수학']);
  });

  it('같은 그룹 안에서는 지금처럼 순서만 바뀐다 (R11 회귀)', async () => {
    await 화면();

    const dataTransfer = 끌기시작('영어');
    const drop = new MouseEvent('drop', { bubbles: true, cancelable: true, clientY: 0 });
    Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer });
    fireEvent(행('수학'), drop);

    await waitFor(() => {
      expect(제목들('공부')).toEqual(['영어', '수학']);
    });
    await expect(저장된카테고리(영어.id)).resolves.toBe(공부.id);
  });

  it('되돌리기 토스트로 원래 카테고리에 되돌린다', async () => {
    await 화면();

    fireEvent.drop(그룹('운동'), { dataTransfer: 끌기시작('수학') });

    expect(await screen.findByText('운동 카테고리로 옮겼어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));

    await waitFor(async () => {
      await expect(저장된카테고리(수학.id)).resolves.toBe(공부.id);
    });
    expect(제목들('공부')).toContain('수학');
  });

  it('끌고 있는 동안 받을 수 있는 그룹에만 점선이 선다', async () => {
    await 화면();

    const dataTransfer = 끌기시작('수학');
    fireEvent.dragOver(그룹('운동'), { dataTransfer });

    expect(그룹('운동')).toHaveClass('border-dashed');
    // 출발한 그룹은 순서 변경의 자리다 — 여기에 같은 표시가 서면 두 제스처가 한 신호를 쓴다.
    expect(그룹('공부')).not.toHaveClass('border-dashed');
    expect(dataTransfer.dropEffect).toBe('move');
  });

  it('삭제된 카테고리 그룹은 받지 않는다 (R16)', async () => {
    await 화면();

    const dataTransfer = 끌기시작('수학');
    fireEvent.dragOver(그룹('삭제된 카테고리'), { dataTransfer });
    fireEvent.drop(그룹('삭제된 카테고리'), { dataTransfer });

    expect(그룹('삭제된 카테고리')).not.toHaveClass('border-dashed');
    await expect(저장된카테고리(수학.id)).resolves.toBe(공부.id);
  });

  it('종료된 카테고리 그룹도 받지 않는다 (메뉴 선택지와 같은 집합, R12)', async () => {
    await 화면();

    const dataTransfer = 끌기시작('수학');
    fireEvent.dragOver(그룹('요가'), { dataTransfer });
    fireEvent.drop(그룹('요가'), { dataTransfer });

    expect(그룹('요가')).not.toHaveClass('border-dashed');
    await expect(저장된카테고리(수학.id)).resolves.toBe(공부.id);
  });
});
