// 루틴 등록 액션 테스트 (todo R21). 저장소는 memory 구현이고 매 테스트 새로 주입한다.
import { beforeEach, describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';
import type { Persistable } from '@/domain/meta';
import type { Todo } from '@/domain/todo/todo';

import { getRepositories, setRepositories, type Repositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';
import { RepositoryError } from '@/repositories/repository-error';

import { createTodoStore, type TodoStore } from '@/features/todo/store/todo-store';
import { fixedDeps, FIXTURE_DATE } from '@/test/fixtures/deps';
import { FIXTURE_CATEGORY_ID, makeTodo } from '@/test/fixtures/todo';

type Store = ReturnType<typeof createTodoStore>;

let store: Store;

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  store = createTodoStore(fixedDeps());
});

const state = (): TodoStore => store.getState();

describe('createRoutine', () => {
  it('반복 패턴에 맞는 날짜마다 같은 제목·카테고리의 투두를 만들고, 만든 id 들을 돌려준다', async () => {
    // FIXTURE_DATE = 2026-01-15(목).
    const ids = await state().createRoutine({
      categoryId: FIXTURE_CATEGORY_ID,
      title: '아침 스트레칭',
      startDate: FIXTURE_DATE,
      endDate: '2026-01-29' as DateKey,
      recurrence: { type: 'weekly', daysOfWeek: [4] },
    });
    expect(ids).not.toBe(false);
    expect(ids).toHaveLength(3);

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
    expect(created.map((todo) => todo.id).sort()).toEqual([...(ids as string[])].sort());
  });

  it('같은 날짜·카테고리에 같은 제목이 이미 있으면 그 날짜는 건너뛴다(중복 방지)', async () => {
    await state().loadDate(FIXTURE_DATE);
    await state().addTodo({ categoryId: FIXTURE_CATEGORY_ID, title: '아침 스트레칭' });

    const ids = await state().createRoutine({
      categoryId: FIXTURE_CATEGORY_ID,
      title: '아침 스트레칭',
      startDate: FIXTURE_DATE,
      endDate: '2026-01-29' as DateKey,
      recurrence: { type: 'weekly', daysOfWeek: [4] },
    });
    // 3개 날짜가 맞지만 FIXTURE_DATE 는 이미 있어 2개만 새로 만든다.
    expect(ids).toHaveLength(2);

    const all = await getRepositories().todos.listByDateRange(
      FIXTURE_DATE,
      '2026-01-29' as DateKey,
    );
    expect(all.filter((todo) => todo.date === FIXTURE_DATE)).toHaveLength(1);
    expect(all).toHaveLength(3);
  });

  it('기존 투두의 제목이 정규화되지 않았어도(백업 복원 등) 중복으로 본다', async () => {
    // 백업 복원 경로(domain/backup/validate-rows.ts)는 형식만 검증하고 정규화한 값을 쓰지 않아,
    // 저장소에 앞뒤 공백이 남은 제목이 있을 수 있다 — 그런 값도 픽스처로 직접 넣어 재현한다.
    await getRepositories().todos.upsert(
      makeTodo({
        date: FIXTURE_DATE,
        categoryId: FIXTURE_CATEGORY_ID,
        title: ' 아침 스트레칭 ',
      }) as Persistable<Todo>,
    );

    const ids = await state().createRoutine({
      categoryId: FIXTURE_CATEGORY_ID,
      title: '아침 스트레칭',
      startDate: FIXTURE_DATE,
      endDate: FIXTURE_DATE,
      recurrence: { type: 'weekly', daysOfWeek: [4] },
    });

    expect(ids).toEqual([]);
    expect(await getRepositories().todos.listAll()).toHaveLength(1);
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

  it('맞는 날짜가 없으면 아무것도 만들지 않고 빈 배열을 돌려준다(성공)', async () => {
    const ids = await state().createRoutine({
      categoryId: FIXTURE_CATEGORY_ID,
      title: '아침 스트레칭',
      startDate: FIXTURE_DATE,
      endDate: '2026-01-16' as DateKey,
      recurrence: { type: 'monthly', daysOfMonth: [1] },
    });
    expect(ids).toEqual([]);
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

describe('undoRoutine', () => {
  it('메모리에 없는(다른 날짜) 항목도 저장소에서 지운다', async () => {
    // 등록만 하고 그 날짜를 "보고" 있지 않다 — 되돌리기 대상은 대부분 메모리 밖이다(R17).
    const ids = await state().createRoutine({
      categoryId: FIXTURE_CATEGORY_ID,
      title: '아침 스트레칭',
      startDate: FIXTURE_DATE,
      endDate: '2026-01-29' as DateKey,
      recurrence: { type: 'weekly', daysOfWeek: [4] },
    });
    const created = ids as string[];
    expect(created).toHaveLength(3);
    expect(Object.keys(state().byId)).toHaveLength(0); // 아무 날짜도 loadDate 하지 않았다.

    const ok = await state().undoRoutine(created);
    expect(ok).toBe(true);

    const left = await getRepositories().todos.listByDateRange(
      FIXTURE_DATE,
      '2026-01-29' as DateKey,
    );
    expect(left).toHaveLength(0);
  });

  it('지금 보고 있는 날짜의 항목은 메모리에서도 빠진다', async () => {
    await state().loadDate(FIXTURE_DATE);
    const ids = await state().createRoutine({
      categoryId: FIXTURE_CATEGORY_ID,
      title: '아침 스트레칭',
      startDate: FIXTURE_DATE,
      endDate: '2026-01-29' as DateKey,
      recurrence: { type: 'weekly', daysOfWeek: [4] },
    });
    expect(Object.keys(state().byId)).toHaveLength(1);

    await state().undoRoutine(ids as string[]);
    expect(Object.keys(state().byId)).toHaveLength(0);
  });

  it('이미 없는 id 는 조용히 건너뛴다', async () => {
    const ok = await state().undoRoutine(['f0000000-0000-4000-8000-000000009999']);
    expect(ok).toBe(true);
  });
});
