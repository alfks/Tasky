// 날짜 셀 드롭 (date-strip R13 + todo R10) — 두 feature 를 잇는 배선은 셸의 것이다.
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';
import { adopt } from '@/domain/meta';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { useTodoDropToDate } from '@/features/shell/hooks/useTodoDropToDate';
import { useShellToastStore } from '@/features/shell/store/shell-toast-store';
import { useTodoStore } from '@/features/todo';
import { makeTodo } from '@/test/fixtures/todo';

const FROM = '2026-09-16' as DateKey;
const TO = '2026-09-18' as DateKey;
const TODO = makeTodo({ seq: 1, date: FROM });

let drop: (todoId: string, to: DateKey) => void;

function Probe() {
  drop = useTodoDropToDate(FROM);
  return null;
}

beforeEach(async () => {
  const repositories = createMemoryRepositories();
  setRepositories(repositories);
  await repositories.todos.upsert(adopt(TODO));
  useShellToastStore.setState({ toasts: [] });
  await act(async () => {
    await useTodoStore.getState().loadDate(FROM);
  });
});

describe('useTodoDropToDate', () => {
  it('떨어뜨린 날짜로 옮기고 되돌리기 토스트를 띄운다', async () => {
    render(<Probe />);
    await act(async () => {
      drop(TODO.id, TO);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const toast = useShellToastStore.getState().toasts[0];
    expect(toast?.message).toContain('9월 18일');
    expect(toast?.action?.label).toBe('되돌리기');
  });

  it('[되돌리기] 가 원래 날짜로 되돌린다', async () => {
    render(<Probe />);
    await act(async () => {
      drop(TODO.id, TO);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      useShellToastStore.getState().toasts[0]?.action?.onAction();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect((await getStoredTodo())?.date).toBe(FROM);
  });

  it('옮기지 못하면 토스트를 띄우지 않는다 — 없는 id 는 조용히 실패한다', async () => {
    render(<Probe />);
    await act(async () => {
      drop('10000000-0000-4000-8000-000000000999', TO);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(useShellToastStore.getState().toasts).toHaveLength(0);
  });

  it('저장이 예외로 터지면 오류 토스트를 띄운다 (§2-C 개별 액션 실패)', async () => {
    vi.spyOn(useTodoStore.getState(), 'moveToDate').mockRejectedValue(new Error('boom'));
    render(<Probe />);
    await act(async () => {
      drop(TODO.id, TO);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(useShellToastStore.getState().toasts[0]?.variant).toBe('error');
    vi.restoreAllMocks();
  });
});

async function getStoredTodo() {
  const { getRepositories } = await import('@/repositories/container');
  return getRepositories().todos.getById(TODO.id);
}
