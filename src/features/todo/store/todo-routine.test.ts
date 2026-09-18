// 루틴 등록 액션 테스트 (todo R21). 저장소는 memory 구현이고 매 테스트 새로 주입한다.
import { beforeEach, describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';

import { getRepositories, setRepositories, type Repositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';
import { RepositoryError } from '@/repositories/repository-error';

import { createTodoStore, type TodoStore } from '@/features/todo/store/todo-store';
import { fixedDeps, FIXTURE_DATE } from '@/test/fixtures/deps';
import { FIXTURE_CATEGORY_ID } from '@/test/fixtures/todo';

type Store = ReturnType<typeof createTodoStore>;

let store: Store;

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  store = createTodoStore(fixedDeps());
});

const state = (): TodoStore => store.getState();

describe('createRoutine', () => {
  it('반복 패턴에 맞는 날짜마다 같은 제목·카테고리의 투두를 만든다', async () => {
    // FIXTURE_DATE = 2026-01-15(목).
    const ok = await state().createRoutine({
      categoryId: FIXTURE_CATEGORY_ID,
      title: '아침 스트레칭',
      startDate: FIXTURE_DATE,
      endDate: '2026-01-29' as DateKey,
      recurrence: { type: 'weekly', daysOfWeek: [4] },
    });
    expect(ok).toBe(true);

    const created = await getRepositories().todos.listByDateRange(
      FIXTURE_DATE,
      '2026-01-29' as DateKey,
    );
    expect(created.map((todo) => todo.date).sort()).toEqual([
      '2026-01-15',
      '2026-01-22',
      '2026-01-29',
    ]);
    expect(created.every((todo) => todo.title === '아침 스트레칭')).toBe(true);
    expect(created.every((todo) => todo.categoryId === FIXTURE_CATEGORY_ID)).toBe(true);
  });

  it('지금 보고 있는 날짜에 생성된 투두만 메모리에 반영한다(R17)', async () => {
    await state().loadDate(FIXTURE_DATE);
    await state().createRoutine({
      categoryId: FIXTURE_CATEGORY_ID,
      title: '아침 스트레칭',
      startDate: FIXTURE_DATE,
      endDate: '2026-01-29' as DateKey,
      recurrence: { type: 'weekly', daysOfWeek: [4] },
    });

    const visible = Object.values(state().byId);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.date).toBe(FIXTURE_DATE);
  });

  it('기존 투두 뒤에 order 를 이어 붙인다', async () => {
    await state().loadDate(FIXTURE_DATE);
    await state().addTodo({ categoryId: FIXTURE_CATEGORY_ID, title: '기존 할 일' });

    await state().createRoutine({
      categoryId: FIXTURE_CATEGORY_ID,
      title: '루틴 할 일',
      startDate: FIXTURE_DATE,
      endDate: FIXTURE_DATE,
      recurrence: { type: 'weekly', daysOfWeek: [4] },
    });

    const todos = Object.values(state().byId).sort((a, b) => a.order - b.order);
    expect(todos.map((todo) => todo.title)).toEqual(['기존 할 일', '루틴 할 일']);
    expect(todos[1]?.order).toBeGreaterThan(todos[0]?.order ?? -1);
  });

  it('맞는 날짜가 없으면 아무것도 만들지 않고 성공을 돌려준다', async () => {
    const ok = await state().createRoutine({
      categoryId: FIXTURE_CATEGORY_ID,
      title: '아침 스트레칭',
      startDate: FIXTURE_DATE,
      endDate: '2026-01-16' as DateKey,
      recurrence: { type: 'monthly', daysOfMonth: [1] },
    });
    expect(ok).toBe(true);
    expect(await getRepositories().todos.listAll()).toEqual([]);
  });

  it('검증 실패(빈 반복 패턴)는 false 를 돌려주고 문구를 남긴다', async () => {
    const ok = await state().createRoutine({
      categoryId: FIXTURE_CATEGORY_ID,
      title: '아침 스트레칭',
      startDate: FIXTURE_DATE,
      endDate: '2026-01-16' as DateKey,
      recurrence: { type: 'weekly', daysOfWeek: [] },
    });
    expect(ok).toBe(false);
    expect(state().error).not.toBeNull();
  });

  it('저장 실패는 false 를 돌려주고 저장소에 아무것도 남기지 않는다', async () => {
    const repos = getRepositories();
    setRepositories({
      ...repos,
      dataset: {
        ...repos.dataset,
        write: () => Promise.reject(new RepositoryError('DATASET_WRITE_INVALID', '테스트')),
      },
    } satisfies Repositories);

    const ok = await state().createRoutine({
      categoryId: FIXTURE_CATEGORY_ID,
      title: '아침 스트레칭',
      startDate: FIXTURE_DATE,
      endDate: '2026-01-29' as DateKey,
      recurrence: { type: 'weekly', daysOfWeek: [4] },
    });
    expect(ok).toBe(false);
    expect(state().error).not.toBeNull();
  });
});
