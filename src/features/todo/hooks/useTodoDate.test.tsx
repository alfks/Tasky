// `useTodoDate` — 훅이 돌려주는 값만 본다(TECH_PLAN §7: 스토어 계층은 렌더를 보지 않는다).
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { useTodoDate } from '@/features/todo/hooks/useTodoDate';
import { useTodoStore } from '@/features/todo/store/todo-store';
import { FIXTURE_DATE } from '@/test/fixtures/deps';

const TOMORROW = '2026-01-16' as DateKey;

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  useTodoStore.setState({ byId: {}, date: null, status: 'idle', error: null });
});

describe('useTodoDate (R17)', () => {
  it('마운트하면 그 날짜를 읽고 status 가 ready 가 된다', async () => {
    const { result } = renderHook(() => useTodoDate(FIXTURE_DATE));

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(useTodoStore.getState().date).toBe(FIXTURE_DATE);
  });

  it('날짜가 바뀌면 그 날짜를 다시 읽는다', async () => {
    const { rerender } = renderHook(({ date }: { date: DateKey }) => useTodoDate(date), {
      initialProps: { date: FIXTURE_DATE },
    });

    rerender({ date: TOMORROW });

    await waitFor(() => {
      expect(useTodoStore.getState().date).toBe(TOMORROW);
    });
  });
});
