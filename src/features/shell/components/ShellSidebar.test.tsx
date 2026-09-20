// 사이드바 진입점 배선 테스트 (app-shell.md §2-A, routine.md §2 — T-83).
//
// `CategoryList`·`RoutineManager` 자체 동작은 각 feature 의 테스트가 이미 본다. 여기서 묻는 것은
// 셸이 "루틴" 진입점을 실제로 올렸고, 그 다이얼로그가 필요로 하는 `categories` 를 받았는가뿐이다.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adopt } from '@/domain/meta';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { ShellSidebar } from '@/features/shell/components/ShellSidebar';
import { useTodoStore } from '@/features/todo';
import { makeCategory } from '@/test/fixtures/category';
import { makeRoutine } from '@/test/fixtures/routine';

const 운동 = makeCategory({ seq: 1, name: '운동', order: 0 });

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  useTodoStore.setState({
    byId: {},
    date: null,
    status: 'idle',
    error: null,
    writeRevision: 0,
    routines: {},
    routineStatus: 'idle',
  });
});

describe('"루틴" 진입점', () => {
  it('도구 줄에 있고, 누르면 관리 다이얼로그가 열린다', async () => {
    const user = userEvent.setup();
    render(
      <ShellSidebar
        showTitle
        categories={[운동]}
        onSelectCategory={vi.fn()}
        onRemoveCategory={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '루틴' }));
    expect(await screen.findByRole('dialog', { name: '루틴' })).toBeInTheDocument();
  });

  it('셸이 넘긴 categories 로 기존 루틴의 카테고리를 그대로 보여준다', async () => {
    await getRepositories().routines.upsert(adopt(makeRoutine({ title: '운동하기' })));
    const user = userEvent.setup();
    render(
      <ShellSidebar
        showTitle
        categories={[운동]}
        onSelectCategory={vi.fn()}
        onRemoveCategory={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '루틴' }));
    await waitFor(() => expect(screen.getByText('운동하기')).toBeInTheDocument());
    // 카테고리 이모지(없음) 대신 이름이 정상적으로 붙어 있다는 것은 `categories` prop 이 실제로
    // `RoutineManager` 까지 닿았다는 뜻이다("+ 루틴 추가" 도 비활성이 아니어야 한다).
    expect(screen.getByRole('button', { name: '+ 루틴 추가' })).toBeEnabled();
  });
});
