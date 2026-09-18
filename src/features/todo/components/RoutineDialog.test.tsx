// 루틴 등록 다이얼로그 테스트 (todo R21).
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Persistable } from '@/domain/meta';
import type { Todo } from '@/domain/todo/todo';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { RoutineDialog } from '@/features/todo/components/RoutineDialog';
import { useTodoStore } from '@/features/todo/store/todo-store';
import { makeCategory } from '@/test/fixtures/category';
import { FIXTURE_DATE } from '@/test/fixtures/deps';
import { FIXTURE_CATEGORY_ID, makeTodo } from '@/test/fixtures/todo';

import { clearToasts, getToasts } from '@/components/ui/Toast';

const 공부 = makeCategory({ seq: 1, name: '공부', order: 0 });
// FIXTURE_DATE(2026-01-15) 는 목요일이다.
const todo = makeTodo({
  title: '아침 스트레칭',
  date: FIXTURE_DATE,
  categoryId: FIXTURE_CATEGORY_ID,
});

/** 저장소·스토어·토스트 허브를 매 테스트 초기화한다(컴포넌트는 싱글턴 스토어를 쓴다). */
beforeEach(() => {
  setRepositories(createMemoryRepositories());
  useTodoStore.setState({ byId: {}, date: null, status: 'idle', error: null, writeRevision: 0 });
  clearToasts();
});

describe('매주 반복', () => {
  it('요일을 고르고 등록하면 그 요일마다 투두가 만들어지고, 토스트로 알리고 닫힌다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RoutineDialog todo={todo} categories={[공부]} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: '목' }));
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-01-29' } });
    await user.click(screen.getByRole('button', { name: '루틴 등록' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(getToasts().map((toast) => toast.message)).toContain('3개의 할 일을 만들었어요');

    const created = await getRepositories().todos.listByDateRange(FIXTURE_DATE, '2026-01-29');
    expect(created.map((row) => row.date).sort()).toEqual([
      '2026-01-15',
      '2026-01-22',
      '2026-01-29',
    ]);
    expect(created.every((row) => row.title === '아침 스트레칭')).toBe(true);
  });

  it('등록 대상 항목이 이미 그 날짜에 있으면 두 번 만들지 않는다(중복 방지)', async () => {
    const user = userEvent.setup();
    // 다이얼로그를 연 항목 자신을 미리 저장소에 넣어 둔다 — 실제 화면에서는 이미 목록에 있는
    // 그 항목을 열어 루틴을 등록하는 흐름이다.
    await getRepositories().todos.upsert(todo as Persistable<Todo>);
    render(<RoutineDialog todo={todo} categories={[공부]} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '목' }));
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-01-29' } });
    await user.click(screen.getByRole('button', { name: '루틴 등록' }));

    await waitFor(() =>
      expect(getToasts().map((toast) => toast.message)).toContain('2개의 할 일을 만들었어요'),
    );
    const all = await getRepositories().todos.listByDateRange(FIXTURE_DATE, '2026-01-29');
    expect(all.filter((row) => row.date === FIXTURE_DATE)).toHaveLength(1);
    expect(all).toHaveLength(3);
  });

  it('요일을 하나도 고르지 않으면 오류 문구를 보이고 다이얼로그를 유지한다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RoutineDialog todo={todo} categories={[공부]} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-01-29' } });
    await user.click(screen.getByRole('button', { name: '루틴 등록' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('반복할 요일이나 날짜');
    expect(onClose).not.toHaveBeenCalled();
    expect(await getRepositories().todos.listAll()).toEqual([]);
  });

  it('제목을 지우면 도메인 검증 문구를 그대로 보이고, 저장소에 아무것도 쓰지 않는다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RoutineDialog todo={todo} categories={[공부]} onClose={onClose} />);

    await user.clear(screen.getByLabelText('제목'));
    await user.click(screen.getByRole('button', { name: '목' }));
    await user.click(screen.getByRole('button', { name: '루틴 등록' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('할 일을 입력해 주세요');
    expect(onClose).not.toHaveBeenCalled();
    expect(getToasts()).toEqual([]);
    expect(await getRepositories().todos.listAll()).toEqual([]);
  });
});

describe('매달 반복', () => {
  it('일(day)을 입력하고 등록하면 그 날마다 투두가 만들어진다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RoutineDialog todo={todo} categories={[공부]} onClose={onClose} />);

    await user.selectOptions(screen.getByLabelText('반복 주기'), '매달');
    await user.type(screen.getByLabelText(/반복 일/), '15');
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-03-15' } });
    await user.click(screen.getByRole('button', { name: '루틴 등록' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const created = await getRepositories().todos.listByDateRange(FIXTURE_DATE, '2026-03-15');
    expect(created.map((row) => row.date).sort()).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
    ]);
  });

  it('숫자가 아닌 조각이 섞이면 전체를 무효로 보고 안내한다(일부만 조용히 버리지 않는다)', async () => {
    const user = userEvent.setup();
    render(<RoutineDialog todo={todo} categories={[공부]} onClose={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText('반복 주기'), '매달');
    await user.type(screen.getByLabelText(/반복 일/), '1~15');
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-03-15' } });
    await user.click(screen.getByRole('button', { name: '루틴 등록' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('반복할 요일이나 날짜');
    expect(await getRepositories().todos.listAll()).toEqual([]);
  });
});
