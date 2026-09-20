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
  useTodoStore.setState({
    byId: {},
    date: null,
    status: 'idle',
    error: null,
    writeRevision: 0,
    routines: {},
    routineStatus: 'idle',
    visibleRange: null,
  });
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

    expect(await screen.findByRole('alert')).toHaveTextContent('1970-01-01~2099-12-31');
    expect(await getRepositories().todos.listAll()).toEqual([]);
  });

  it('시작·종료 순서는 맞지만 범위 밖이면 "순서" 문구가 아니라 "범위" 문구를 보인다', async () => {
    // 회귀 방지: 순서는 맞는데(2099-12-31 < 2100-01-01) 범위만 벗어난 입력에서
    // "종료일은 시작일과 같거나 이후여야 해요" 를 보이면 사용자가 멀쩡한 종료일을 고치려 헤맨다.
    const user = userEvent.setup();
    render(<RoutineDialog todo={todo} categories={[공부]} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2099-12-31' } });
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2100-01-01' } });
    await user.click(screen.getByRole('button', { name: '목' }));
    await user.click(screen.getByRole('button', { name: '루틴 등록' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('1970-01-01~2099-12-31');
    expect(alert).not.toHaveTextContent('종료일은 시작일');
  });

  it('시작일·종료일을 비우면 안내하고 다이얼로그를 유지한다', async () => {
    const user = userEvent.setup();
    render(<RoutineDialog todo={todo} categories={[공부]} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: '목' }));
    await user.click(screen.getByRole('button', { name: '루틴 등록' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('시작일과 종료일을 골라 주세요');
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

describe('무기한 등록 ("계속 반복", routine.md R2~R5)', () => {
  it('체크하면 종료일 입력이 비활성화되고 값이 비워진다', async () => {
    const user = userEvent.setup();
    render(<RoutineDialog todo={todo} categories={[공부]} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-01-29' } });

    await user.click(screen.getByRole('checkbox', { name: '계속 반복' }));

    const endDateInput = screen.getByLabelText('종료일');
    expect(endDateInput).toBeDisabled();
    expect(endDateInput).toHaveValue('');
  });

  it('키보드만으로 체크박스를 켤 수 있다(Tab + Space)', async () => {
    const user = userEvent.setup();
    render(<RoutineDialog todo={todo} categories={[공부]} onClose={vi.fn()} />);
    const checkbox = screen.getByRole('checkbox', { name: '계속 반복' });

    checkbox.focus();
    expect(checkbox).toHaveFocus();
    await user.keyboard(' ');

    expect(checkbox).toBeChecked();
    expect(screen.getByLabelText('종료일')).toBeDisabled();
  });

  it('즉시 채우기 결과가 0건이어도 오류가 아니라 성공 토스트를 내고 Routine 을 저장한다(R4·R5)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RoutineDialog todo={todo} categories={[공부]} onClose={onClose} />);

    // 시작일은 todo.date(목요일) 그대로 두고 반복 요일은 "월"로 골라, 즉시 채우기 구간(방문 전이라
    // 시작일 하루뿐, R3)에 맞는 날짜가 없게 만든다 — 패턴 자체는 유효하다.
    await user.click(screen.getByRole('button', { name: '월' }));
    await user.click(screen.getByRole('checkbox', { name: '계속 반복' }));
    await user.click(screen.getByRole('button', { name: '루틴 등록' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const toasts = getToasts();
    expect(toasts.map((toast) => toast.message)).toContain('곧 반복이 시작돼요');
    expect(toasts.find((toast) => toast.message === '곧 반복이 시작돼요')?.action).toBeUndefined();

    const saved = await getRepositories().routines.list({ includeInactive: true });
    expect(saved).toHaveLength(1);
    expect(saved[0]?.active).toBe(true);
    expect(await getRepositories().todos.listAll()).toEqual([]);
  });

  it('결과가 있으면 되돌리기가 만든 인스턴스와 Routine 레코드를 함께 지운다', async () => {
    const user = userEvent.setup();
    render(<RoutineDialog todo={todo} categories={[공부]} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '목' })); // todo.date 와 같은 요일
    await user.click(screen.getByRole('checkbox', { name: '계속 반복' }));
    await user.click(screen.getByRole('button', { name: '루틴 등록' }));

    await waitFor(() => expect(getToasts()).toHaveLength(1));
    expect(await getRepositories().routines.list({ includeInactive: true })).toHaveLength(1);
    const toast = getToasts()[0];
    expect(toast?.message).toBe('1개의 할 일을 만들었어요');

    toast?.action?.onAction();
    await waitFor(async () => {
      expect(await getRepositories().todos.listAll()).toEqual([]);
    });
    // 인스턴스만이 아니라 루틴 레코드도 지워야 다음 방문에 다시 생기지 않는다.
    expect(await getRepositories().routines.list({ includeInactive: true })).toHaveLength(0);
  });
});
