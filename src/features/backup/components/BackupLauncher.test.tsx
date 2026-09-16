import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Meta, Persistable } from '@/domain/meta';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryTables } from '@/repositories/memory/live';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { BackupLauncher } from '@/features/backup/components/BackupLauncher';
import { initialBackupState } from '@/features/backup/store/backup-state';
import { useBackupStore } from '@/features/backup/store/backup-store';
import { makeCategory } from '@/test/fixtures/category';
import { makeSettings } from '@/test/fixtures/settings';
import { makeTodos } from '@/test/fixtures/todo';

const persist = <T extends Meta>(entity: T): Persistable<T> => entity as unknown as Persistable<T>;

/** 투두 `count` 개를 담은 저장소. 경고 점 조건(투두 ≥ 20)을 개수로 조절한다. */
async function seedTodos(count: number): Promise<void> {
  const repositories = createMemoryRepositories(createMemoryTables());
  setRepositories(repositories);
  const category = makeCategory();
  await repositories.dataset.restore({
    categories: [persist(category)],
    todos: makeTodos(count, () => ({ categoryId: category.id })).map(persist),
    focusSessions: [],
    settings: persist(makeSettings()),
  });
}

beforeEach(() => {
  useBackupStore.setState(initialBackupState);
});

describe('BackupLauncher (§2·R14)', () => {
  it('마운트는 경고 점만 판정하고 개수는 읽지 않는다 (ADR-0009 규칙 4)', async () => {
    await seedTodos(3);
    const readAll = vi.spyOn(getRepositories().dataset, 'readAll');
    render(<BackupLauncher />);
    await screen.findByRole('button', { name: /백업\/복원/ });
    await waitForWarningCheck();

    // 개수는 다이얼로그를 열 때 읽는다 — 앱이 뜰 때 전량을 메모리로 끌어올리지 않는다.
    expect(useBackupStore.getState().current).toBeNull();
    expect(readAll).not.toHaveBeenCalled();
    readAll.mockRestore();
  });

  it('다이얼로그를 열면 그때 개수를 읽는다 (§2)', async () => {
    const user = userEvent.setup();
    await seedTodos(3);
    render(<BackupLauncher />);
    await waitForWarningCheck();

    await user.click(screen.getByRole('button', { name: /백업\/복원/ }));
    expect(await waitForCounts()).toEqual({ categories: 1, todos: 3 });
  });

  it('백업이 없고 투두가 20개 이상이면 경고 점이 보인다', async () => {
    await seedTodos(20);
    render(<BackupLauncher />);
    expect(await screen.findByText('백업한 지 오래됐어요')).toBeInTheDocument();
  });

  it('투두가 적으면 경고 점이 없다', async () => {
    await seedTodos(3);
    render(<BackupLauncher />);
    await waitForWarningCheck();
    expect(screen.queryByText('백업한 지 오래됐어요')).toBeNull();
  });

  // 서버 HTML 에 없는 노드를 첫 클라이언트 렌더에 넣으면 React 19 가 트리를 통째로 다시 만든다
  // (실 Chromium PAGEERROR — 리뷰 라운드 1 Major-1). `ToastViewport` 가 그 노드였다.
  // 지금 스택은 서버 렌더를 하지 않으므로(ADR-0013) 이 테스트는 프리렌더가 돌아왔을 때를 위한 고정이다.
  it('서버가 그린 HTML 에 그대로 하이드레이션된다 (콘솔 에러 0)', async () => {
    await seedTodos(3);
    const container = document.createElement('div');
    container.innerHTML = renderToString(<BackupLauncher />);
    document.body.append(container);

    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(String(args[0]));
    });
    const root = await act(async () => hydrateRoot(container, <BackupLauncher />));
    spy.mockRestore();

    expect(errors).toEqual([]);
    await act(async () => root.unmount());
    container.remove();
  });

  it('경고 점 옆에 그것을 끄는 조작이 없다 (R14)', async () => {
    await seedTodos(20);
    render(<BackupLauncher />);
    await screen.findByText('백업한 지 오래됐어요');
    // 진입점 버튼 하나뿐 — 점을 닫는 두 번째 버튼이 없다.
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('버튼을 키보드로 눌러 다이얼로그를 연다 (지연 로드)', async () => {
    const user = userEvent.setup();
    await seedTodos(3);
    render(<BackupLauncher />);
    await waitForWarningCheck();

    expect(screen.queryByRole('dialog')).toBeNull();
    await user.tab();
    expect(screen.getByRole('button', { name: /백업\/복원/ })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('dialog')).toHaveAccessibleName('백업/복원');
  });

  it('가져오기 결과를 토스트로 알린다 (R12)', async () => {
    await seedTodos(3);
    render(<BackupLauncher />);
    await waitForWarningCheck();

    act(() => {
      useBackupStore.setState({
        result: {
          counts: { added: 20, updated: 3, kept: 289 },
          source: { categories: 4, todos: 312 },
        },
      });
    });

    expect(
      await screen.findByText(
        '카테고리 4개, 할 일 312개를 가져왔어요 (추가 20 · 갱신 3 · 유지 289)',
      ),
    ).toBeInTheDocument();
  });
});

/** 어떤 비동기 상태가 들어올 때까지 기다린다. */
async function waitFor<T>(read: () => T | null, label: string): Promise<T> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const value = read();
    if (value !== null) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`${label} 가 끝나지 않았습니다`);
}

/** `refreshWarning()` 이 끝날 때까지 — 경고 점 판정 시각이 찍히면 끝이다. */
const waitForWarningCheck = (): Promise<string> =>
  waitFor(() => useBackupStore.getState().refreshedAt, 'refreshWarning()');

/** `refresh()` 가 끝나 개수가 들어올 때까지 기다린다. */
const waitForCounts = (): Promise<{ categories: number; todos: number }> =>
  waitFor(() => useBackupStore.getState().current, 'refresh()');
