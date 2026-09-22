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
import { useShellUiStore } from '@/features/shell/store/shell-ui-store';
import { useTodoStore } from '@/features/todo';
import { makeCategory } from '@/test/fixtures/category';
import { makeRoutine } from '@/test/fixtures/routine';

import {
  ToastViewport,
  clearToasts,
  dismissToast,
  pushToast,
  useToasts,
} from '@/components/ui/Toast';

const 운동 = makeCategory({ seq: 1, name: '운동', order: 0 });

/** 계정 블록이 요구하는 prop — 이 파일의 관심사(루틴 진입점)와 무관하므로 항상 같은 대역을 준다. */
const exportBackup = () => Promise.resolve(true);

/** `ShellToasts`(app-shell R8 전역 허브)를 축약한 것 — 실제 토스트 DOM 을 만든다. */
function ToastHost() {
  return <ToastViewport toasts={useToasts()} onClose={dismissToast} />;
}

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
  useShellUiStore.setState({
    sidebarPinned: false,
    insightCollapsed: false,
    drawerOpen: false,
    insightOverlayOpen: false,
  });
  clearToasts();
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
        exportBackup={exportBackup}
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
        exportBackup={exportBackup}
      />,
    );

    await user.click(screen.getByRole('button', { name: '루틴' }));
    await waitFor(() => expect(screen.getByText('운동하기')).toBeInTheDocument());
    // 카테고리 이모지(없음) 대신 이름이 정상적으로 붙어 있다는 것은 `categories` prop 이 실제로
    // `RoutineManager` 까지 닿았다는 뜻이다("+ 루틴 추가" 도 비활성이 아니어야 한다).
    expect(screen.getByRole('button', { name: '+ 루틴 추가' })).toBeEnabled();
  });

  it(
    '무관한 토스트가 떠 있어도 루틴 삭제 포커스를 가로채지 않는다 ' +
      '(리뷰 #104 Major — preferToast: false)',
    async () => {
      await getRepositories().routines.upsert(adopt(makeRoutine({ title: '운동하기' })));
      const user = userEvent.setup();
      render(<ToastHost />);
      render(
        <ShellSidebar
          showTitle
          categories={[운동]}
          onSelectCategory={vi.fn()}
          onRemoveCategory={vi.fn()}
          exportBackup={exportBackup}
        />,
      );

      // 이 삭제와 **무관한** 되돌리기 토스트(예: 방금 만든 루틴의 등록 성공)가 떠 있다.
      pushToast({
        message: '3개의 할 일을 만들었어요',
        action: { label: '되돌리기', onAction: vi.fn() },
      });
      const undoButton = await screen.findByRole('button', { name: '되돌리기' });

      await user.click(screen.getByRole('button', { name: '루틴' }));
      await waitFor(() => expect(screen.getByText('운동하기')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: '운동하기 루틴 메뉴' }));
      await user.click(screen.getByRole('menuitem', { name: '삭제' }));

      await waitFor(() => expect(screen.queryByText('운동하기')).not.toBeInTheDocument());
      // 포커스가 무관한 토스트로 튀지 않는다 — 튀었다면 거기서 Enter 가 루틴 삭제가 아니라
      // 그 등록을 되돌린다(파괴적, 리뷰 #104 Major 실측).
      await waitFor(() => expect(undoButton).not.toHaveFocus());
      expect(document.activeElement).not.toBe(document.body);
    },
  );
});

describe('사이드바 고정 토글 (calendar-layout.md §1-A · R23~R24)', () => {
  it('showTitle 이 아닐 때(드로어 안)는 렌더되지 않는다', () => {
    render(
      <ShellSidebar
        showTitle={false}
        categories={[운동]}
        onSelectCategory={vi.fn()}
        onRemoveCategory={vi.fn()}
        exportBackup={exportBackup}
      />,
    );
    expect(screen.queryByRole('button', { name: /사이드바 고정/ })).not.toBeInTheDocument();
  });

  it('고정돼 있지 않으면 "사이드바 고정" · aria-pressed=false', () => {
    render(
      <ShellSidebar
        showTitle
        categories={[운동]}
        onSelectCategory={vi.fn()}
        onRemoveCategory={vi.fn()}
        exportBackup={exportBackup}
      />,
    );
    const toggle = screen.getByRole('button', { name: '사이드바 고정' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('고정돼 있으면 "사이드바 고정 해제" · aria-pressed=true, 누르면 store 를 뒤집는다', async () => {
    useShellUiStore.setState({ sidebarPinned: true });
    const user = userEvent.setup();
    render(
      <ShellSidebar
        showTitle
        categories={[운동]}
        onSelectCategory={vi.fn()}
        onRemoveCategory={vi.fn()}
        exportBackup={exportBackup}
      />,
    );
    const toggle = screen.getByRole('button', { name: '사이드바 고정 해제' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await user.click(toggle);
    expect(useShellUiStore.getState().sidebarPinned).toBe(false);
  });
});
