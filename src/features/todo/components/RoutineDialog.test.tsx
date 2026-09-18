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

  it('반복 조건에 맞는 날짜가 전부 이미 등록돼 있으면 안내하고 닫지 않는다(0개 토스트를 내지 않는다)', async () => {
    const user = userEvent.setup();
    // 기간 안의 유일한 대상 날짜(등록 대상 항목 자신의 날짜)를 미리 저장소에 넣는다 —
    // 매칭되는 날짜는 있지만 dedup 으로 전부 걸러지는 경우다.
    await getRepositories().todos.upsert(todo as Persistable<Todo>);
    const onClose = vi.fn();
    render(<RoutineDialog todo={todo} categories={[공부]} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: '목' }));
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: FIXTURE_DATE } });
    await user.click(screen.getByRole('button', { name: '루틴 등록' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 전부 등록돼 있어요');
    expect(onClose).not.toHaveBeenCalled();
    expect(getToasts()).toEqual([]);
  });

  it('시작일이 날짜 스트립 범위(1970~2099) 밖이면 거절한다(입력 min/max 를 우회해도)', async () => {
    const user = userEvent.setup();
    render(<RoutineDialog todo={todo} categories={[공부]} onClose={vi.fn()} />);

    // 네이티브 date input 의 min/max 는 표시 힌트일 뿐이라 fireEvent.change 로 그냥 벗어난다.
    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '1900-01-01' } });
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '1900-01-15' } });
    await user.click(screen.getByRole('button', { name: '목' }));
    await user.click(screen.getByRole('button', { name: '루틴 등록' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('종료일은 시작일');
    expect(await getRepositories().todos.listAll()).toEqual([]);
  });

  it('되돌리기는 지금 보고 있지 않은(다른 날짜) 항목도 전부 지운다', async () => {
    const user = userEvent.setup();
    render(<RoutineDialog todo={todo} categories={[공부]} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '목' }));
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-01-29' } });
    await user.click(screen.getByRole('button', { name: '루틴 등록' }));

    await waitFor(() => expect(getToasts()).toHaveLength(1));
    const toast = getToasts()[0];
    expect(toast?.action?.label).toBe('되돌리기');

    toast?.action?.onAction();
    await waitFor(async () => {
      const left = await getRepositories().todos.listByDateRange(FIXTURE_DATE, '2026-01-29');
      expect(left).toHaveLength(0);
    });
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

  it('숫자 조각과 숫자가 아닌 조각이 섞이면 전체를 무효로 보고 안내한다(일부만 조용히 버리지 않는다)', async () => {
    const user = userEvent.setup();
    render(<RoutineDialog todo={todo} categories={[공부]} onClose={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText('반복 주기'), '매달');
    // "1" 은 정수로 읽히므로, 옛 구현(조각별로 걸러내기)이라면 "15일" 만 버리고 [1] 로 조용히
    // 등록했을 것이다 — 새 구현은 조각 하나라도 무효면 전체를 무효로 본다.
    await user.type(screen.getByLabelText(/반복 일/), '1, 15일');
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-03-15' } });
    await user.click(screen.getByRole('button', { name: '루틴 등록' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('반복할 요일이나 날짜');
    expect(await getRepositories().todos.listAll()).toEqual([]);
  });
});
