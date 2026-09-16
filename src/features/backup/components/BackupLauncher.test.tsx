import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Meta, Persistable } from '@/domain/meta';

import { setRepositories } from '@/repositories/container';
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
  it('마운트하면 현재 상태를 읽는다', async () => {
    await seedTodos(3);
    render(<BackupLauncher />);
    await screen.findByRole('button', { name: /백업\/복원/ });
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
    await waitForCounts();
    expect(screen.queryByText('백업한 지 오래됐어요')).toBeNull();
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
    await waitForCounts();

    expect(screen.queryByRole('dialog')).toBeNull();
    await user.tab();
    expect(screen.getByRole('button', { name: /백업\/복원/ })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('dialog')).toHaveAccessibleName('백업/복원');
  });

  it('가져오기 결과를 토스트로 알린다 (R12)', async () => {
    await seedTodos(3);
    render(<BackupLauncher />);
    await waitForCounts();

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

/** `refresh()` 가 끝나 개수가 들어올 때까지 기다린다. */
async function waitForCounts(): Promise<{ categories: number; todos: number }> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const current = useBackupStore.getState().current;
    if (current !== null) {
      return current;
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('refresh() 가 끝나지 않았습니다');
}
