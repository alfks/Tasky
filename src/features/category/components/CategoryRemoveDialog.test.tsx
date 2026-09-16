// 삭제 대화상자 테스트 (category §2-C·§2-D·§5, R10~R16).
//
// **한글 IME**: 즉석 생성(②)의 이름 입력은 조합이 일어나는 자리다. 조합 확정 Enter 한 번이 파괴
// 버튼을 눌러서는 안 된다. 판정은 `@/lib/ime` + `Dialog` 가 하고(여기서 다시 구현하지 않는다)
// 이 테스트는 그 규칙이 실제 조합 이벤트에서 작동하는지 확인한다 — `isComposing` 과 `keyCode 229` 둘 다.
//
// 픽스처는 **비대칭**이다: 활성 3개를 서로 다른 `order` 로, 종료 1개를 더 두고, 공부에는 완료 2건 ·
// 미완료 3건을 둔다. 대칭 픽스처였다면 "대상 목록에서 자기 자신·종료를 뺀다"(R10·R8)를 틀려도 통과한다.
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Category } from '@/domain/category/category';
import { PALETTE } from '@/domain/theme/palette';

import { setRepositories, type Repositories } from '@/repositories/container';
import { createMemoryTables, type MemoryTables } from '@/repositories/memory/live';
import { createMemoryRepositories } from '@/repositories/memory/repositories';
import { RepositoryError } from '@/repositories/repository-error';

import { CategoryRemoveDialog } from '@/features/category/components/CategoryRemoveDialog';
import { useCategoryRemoval } from '@/features/category/hooks/useCategoryRemoval';
import { indexCategories } from '@/features/category/store/category-state';
import { useCategoryStore } from '@/features/category/store/category-store';
import { useTodoStore } from '@/features/todo';
import { makeCategories, makeCategory } from '@/test/fixtures/category';
import { FIXTURE_DATE } from '@/test/fixtures/deps';
import { makeTodo } from '@/test/fixtures/todo';

const [CORAL, PEACH, ORANGE, YELLOW] = PALETTE;

const 공부 = makeCategory({ seq: 1, name: '공부', order: 0, color: CORAL.light });
const 운동 = makeCategory({ seq: 2, name: '운동', order: 1, color: PEACH.light, emoji: '🏃' });
const 독서 = makeCategory({ seq: 3, name: '독서', order: 2, color: ORANGE.light });
const 쉼 = makeCategory({
  seq: 4,
  name: '쉼',
  order: 3,
  color: YELLOW.light,
  status: 'completed',
  closedAt: '2026-02-01T00:00:00.000Z',
});

/** 공부: 완료 2 · 미완료 3. 운동: 미완료 1(이동 결과를 눈으로 확인할 대상). */
const 할일 = [
  makeTodo({ seq: 1, categoryId: 공부.id, order: 0, done: false }),
  makeTodo({
    seq: 2,
    categoryId: 공부.id,
    order: 1,
    done: true,
    doneAt: '2026-02-01T00:00:00.000Z',
  }),
  makeTodo({ seq: 3, categoryId: 공부.id, order: 2, done: false }),
  makeTodo({
    seq: 4,
    categoryId: 공부.id,
    order: 3,
    done: true,
    doneAt: '2026-02-01T00:00:00.000Z',
  }),
  makeTodo({ seq: 5, categoryId: 공부.id, order: 4, done: false }),
  makeTodo({ seq: 6, categoryId: 운동.id, order: 0, done: false }),
];

let tables: MemoryTables;

function seed(categories: readonly Category[], todos = 할일): void {
  tables = createMemoryTables();
  for (const category of categories) {
    tables.categories.rows.set(category.id, category);
  }
  for (const todo of todos) {
    tables.todos.rows.set(todo.id, todo);
  }
  setRepositories(createMemoryRepositories(tables));
  useCategoryStore.setState({
    byId: indexCategories(categories),
    status: 'ready',
    error: null,
    pendingRemoval: null,
  });
}

beforeEach(() => {
  seed([공부, 운동, 독서, 쉼]);
  // 되돌리기 뒤 목록 재조회(`refreshTodos`)를 볼 수 있게 날짜를 올려 둔다 — 날짜가 `null` 이면
  // 재조회 자체가 일어나지 않아 그 배선이 있으나 없으나 같아진다.
  useTodoStore.setState({ byId: {}, date: FIXTURE_DATE, status: 'ready', error: null });
});

afterEach(() => {
  useCategoryStore.setState({ pendingRemoval: null, error: null });
});

/** 열기 버튼 + 대화상자. `CategoryList` 가 `onRemove` 에 `requestRemove` 를 넘기는 배선과 같다. */
function Harness({ category = 공부 }: { category?: Category }) {
  const controller = useCategoryRemoval();
  return (
    <>
      <button type="button" onClick={() => controller.requestRemove(category)}>
        삭제 열기
      </button>
      <CategoryRemoveDialog controller={controller} />
    </>
  );
}

/** 대상을 바꿔 가며 열 수 있는 하네스 — `key={target.id}` 로 폼이 새로 마운트되는지 본다. */
function TwoTargets() {
  const controller = useCategoryRemoval();
  return (
    <>
      <button type="button" onClick={() => controller.requestRemove(공부)}>
        공부 삭제
      </button>
      <button type="button" onClick={() => controller.requestRemove(운동)}>
        운동 삭제
      </button>
      <CategoryRemoveDialog controller={controller} />
    </>
  );
}

/** 대기 중인 저장(마이크로태스크 + 타이머)을 전부 흘려보낸다. "실행되지 않았다" 를 단언하기 전에 반드시 부른다. */
async function flush(rounds = 1): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** 대화상자를 연다(개수를 세는 비동기가 끝날 때까지 기다린다). */
async function open(category?: Category): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  render(<Harness {...(category === undefined ? {} : { category })} />);
  await user.click(screen.getByRole('button', { name: '삭제 열기' }));
  await screen.findByRole('alertdialog');
  return user;
}

const dialog = (): HTMLElement => screen.getByRole('alertdialog');

/** `dataset.write` 호출 횟수만 센다(막지 않는다). "쓰기가 아예 안 나갔다" 를 단언할 때 쓴다. */
function countWrites(): () => number {
  const repositories = createMemoryRepositories(tables);
  let count = 0;
  setRepositories({
    ...repositories,
    dataset: {
      ...repositories.dataset,
      write: (writes) => {
        count += 1;
        return repositories.dataset.write(writes);
      },
    },
  } satisfies Repositories);
  return () => count;
}

/** 저장소의 로우 그대로(툼스톤 포함). */
function todoRow(id: string) {
  const found = tables.todos.rows.get(id);
  if (found === undefined) {
    throw new Error(`저장소에 ${id} 가 없습니다`);
  }
  return found;
}

describe('선택지와 기본값 (R10)', () => {
  it('제목·본문이 N/M 을 그대로 말하고 기본값은 ① 이며 초기 포커스가 거기에 있다', async () => {
    await open();

    expect(dialog()).toHaveAccessibleName("'공부'를 삭제할까요?");
    expect(dialog()).toHaveTextContent('완료한 할 일 2개는 기록으로 남아요.');
    expect(dialog()).toHaveTextContent('아직 안 한 할 일 3개는 어떻게 할까요?');
    const 옮기기 = screen.getByRole('radio', { name: '다른 카테고리로 옮기기' });
    expect(옮기기).toBeChecked();
    expect(옮기기).toHaveFocus();
  });

  it('이동 대상은 자기 자신과 종료된 카테고리를 뺀 활성 목록이고 order 순이다', async () => {
    await open();

    const select = screen.getByRole('combobox', { name: '옮길 카테고리' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['🏃 운동', '독서']);
    expect(select).toHaveValue(운동.id);
  });

  it('받침이 있는 이름은 조사가 바뀐다', async () => {
    await open(운동);

    expect(dialog()).toHaveAccessibleName("'운동'을 삭제할까요?");
  });

  it('대상을 고르면 ① 이 함께 선택된다 — 순서를 강요하지 않는다', async () => {
    const user = await open();
    await user.click(screen.getByRole('radio', { name: '함께 삭제' }));

    await user.selectOptions(screen.getByRole('combobox', { name: '옮길 카테고리' }), 독서.id);

    expect(screen.getByRole('radio', { name: '다른 카테고리로 옮기기' })).toBeChecked();
  });

  it('③ 은 몇 개가 사라지는지 알려 준다', async () => {
    await open();

    expect(screen.getByRole('radio', { name: '함께 삭제' })).toHaveAccessibleDescription(
      '아직 안 한 할 일 3개가 사라져요',
    );
  });

  it('옮길 카테고리가 없으면 ① 이 비활성 + 사유이고 기본값이 ② 다', async () => {
    seed([공부, 쉼]);
    await open();

    const 옮기기 = screen.getByRole('radio', { name: '다른 카테고리로 옮기기' });
    expect(옮기기).toBeDisabled();
    expect(옮기기).toHaveAccessibleDescription('옮길 카테고리가 없어요');
    const 새로 = screen.getByRole('radio', { name: '새 카테고리를 만들어 옮기기' });
    expect(새로).toBeChecked();
    expect(새로).toHaveFocus();
    expect(screen.getByLabelText('이름')).toBeInTheDocument();
  });
});

describe('축약 (R11)', () => {
  it('미완료가 없으면 선택지 없이 문구 + [취소][삭제] 만 나온다', async () => {
    seed([공부, 운동], [할일[1], 할일[3]]);
    await open();

    expect(dialog()).toHaveTextContent('완료한 할 일 2개는 기록으로 남아요.');
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
  });

  it('할 일이 하나도 없으면 그렇게 말한다', async () => {
    seed([공부, 운동], []);
    await open();

    expect(dialog()).toHaveTextContent('할 일이 없는 카테고리예요.');
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('완료가 없으면 첫 문장을 생략한다', async () => {
    seed([공부, 운동], [할일[0], 할일[2]]);
    await open();

    expect(dialog()).not.toHaveTextContent('기록으로 남아요');
    expect(dialog()).toHaveTextContent('아직 안 한 할 일 2개는 어떻게 할까요?');
  });
});

describe('실행 (R13·R14)', () => {
  it('① 로 삭제하면 미완료만 대상으로 옮겨지고 완료는 그대로다', async () => {
    const user = await open();

    await user.selectOptions(screen.getByRole('combobox', { name: '옮길 카테고리' }), 독서.id);
    await user.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(todoRow(할일[0].id).categoryId).toBe(독서.id);
    expect(todoRow(할일[2].id).categoryId).toBe(독서.id);
    expect(todoRow(할일[4].id).categoryId).toBe(독서.id);
    expect(todoRow(할일[1].id)).toEqual(할일[1]);
    expect(todoRow(할일[3].id)).toEqual(할일[3]);
    expect(useCategoryStore.getState().byId[공부.id]).toBeUndefined();
  });

  it('③ 으로 삭제하면 미완료가 카테고리와 같은 deletedAt 으로 지워진다', async () => {
    const user = await open();

    await user.click(screen.getByRole('radio', { name: '함께 삭제' }));
    await user.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    const deletedAt = tables.categories.rows.get(공부.id)?.deletedAt;
    expect(deletedAt).toBeDefined();
    expect(todoRow(할일[0].id).deletedAt).toBe(deletedAt);
    expect(todoRow(할일[1].id).deletedAt).toBeUndefined();
  });

  it('저장에 실패하면 대화상자가 남고 같은 문구를 보여준다 (§2-D)', async () => {
    const user = await open();
    const repositories = createMemoryRepositories(tables);
    setRepositories({
      ...repositories,
      dataset: {
        ...repositories.dataset,
        write: () => Promise.reject(new RepositoryError('DATASET_WRITE_INVALID', '테스트')),
      },
    } satisfies Repositories);

    await user.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() =>
      expect(within(dialog()).getByRole('alert')).toHaveTextContent(
        '저장하지 못했어요. 다시 시도해 주세요',
      ),
    );
    expect(tables.categories.rows.get(공부.id)?.deletedAt).toBeUndefined();
  });
});

describe('② 즉석 생성 (R12)', () => {
  it('②를 고르면 이름 입력이 나타나고 포커스가 옮겨 가며, 다른 라디오로 바꿔도 값은 남는다', async () => {
    const user = await open();

    await user.click(screen.getByRole('radio', { name: '새 카테고리를 만들어 옮기기' }));
    await waitFor(() => expect(screen.getByLabelText('이름')).toHaveFocus());
    await user.type(screen.getByLabelText('이름'), '새 그룹');

    await user.click(screen.getByRole('radio', { name: '함께 삭제' }));
    expect(screen.queryByLabelText('이름')).toBeNull();

    await user.click(screen.getByRole('radio', { name: '새 카테고리를 만들어 옮기기' }));
    expect(screen.getByLabelText('이름')).toHaveValue('새 그룹');
  });

  it('새 카테고리로 옮기면 한 트랜잭션에서 생성 + 이동이 끝난다', async () => {
    const user = await open();

    await user.click(screen.getByRole('radio', { name: '새 카테고리를 만들어 옮기기' }));
    await user.type(screen.getByLabelText('이름'), '새 그룹');
    await user.click(screen.getByRole('radio', { name: '민트' }));
    await user.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    const created = Object.values(useCategoryStore.getState().byId).find(
      (category) => category.name === '새 그룹',
    );
    expect(created).toMatchObject({ color: PALETTE[5].light, order: 3 });
    expect(todoRow(할일[0].id).categoryId).toBe(created?.id);
    expect(todoRow(할일[1].id).categoryId).toBe(공부.id);
  });

  it('빈 이름·중복 이름이면 오류를 보여주고 실행 경로로 들어가지 않는다', async () => {
    // "문구가 떴다" 만으로는 부족하다 — 화면 검증을 통째로 들어내도 도메인이 트랜잭션 안에서 같은
    // 문구를 던진다(R13). R12 의 "실행되지 않는다" 는 삭제 계획을 **시작조차 하지 않는 것**이고,
    // 그 첫 걸음이 대상 투두 조회다. 그래서 호출 횟수를 센다.
    const base = createMemoryRepositories(tables);
    const listByCategory = vi.fn(base.todos.listByCategory);
    setRepositories({ ...base, todos: { ...base.todos, listByCategory } } satisfies Repositories);
    const user = await open();
    const afterOpen = listByCategory.mock.calls.length;
    await user.click(screen.getByRole('radio', { name: '새 카테고리를 만들어 옮기기' }));

    await user.click(screen.getByRole('button', { name: '삭제' }));
    await flush();
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('이름을 입력해 주세요');
    expect(listByCategory).toHaveBeenCalledTimes(afterOpen);
    expect(tables.categories.rows.get(공부.id)?.deletedAt).toBeUndefined();

    await user.type(screen.getByLabelText('이름'), '운동');
    await user.click(screen.getByRole('button', { name: '삭제' }));
    await flush();
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('같은 이름이 이미 있어요');
    expect(listByCategory).toHaveBeenCalledTimes(afterOpen);
    expect(tables.categories.rows.get(공부.id)?.deletedAt).toBeUndefined();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});

describe('한글 IME — 조합 중 Enter 는 삭제를 실행하지 않는다 (§5)', () => {
  it.each([
    ['isComposing', { isComposing: true, keyCode: 13 }],
    ['keyCode 229', { isComposing: false, keyCode: 229 }],
  ])('%s 로 알려오는 조합 확정 Enter 를 무시한다', async (_label, init) => {
    const user = await open();
    await user.click(screen.getByRole('radio', { name: '새 카테고리를 만들어 옮기기' }));
    const input = screen.getByLabelText('이름');
    await user.type(input, '한글');

    fireEvent(input, createEvent.keyDown(input, { key: 'Enter', bubbles: true, ...init }));
    await flush();

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(tables.categories.rows.get(공부.id)?.deletedAt).toBeUndefined();
  });

  // Enter 는 이름 입력에서 조합 여부와 무관하게 막히므로(오버레이의 "텍스트 입력 Enter 금지" 규칙)
  // **IME 판정만** 걸러 내는 자리는 Esc 다: 조합을 취소하는 Esc 가 대화상자를 닫으면 안 된다.
  it.each([
    ['isComposing', { isComposing: true, keyCode: 27 }],
    ['keyCode 229', { isComposing: false, keyCode: 229 }],
  ])('%s 로 알려오는 조합 취소 Esc 는 대화상자를 닫지 않는다', async (_label, init) => {
    const user = await open();
    await user.click(screen.getByRole('radio', { name: '새 카테고리를 만들어 옮기기' }));
    const input = screen.getByLabelText('이름');
    await user.type(input, '한글');

    fireEvent(input, createEvent.keyDown(input, { key: 'Escape', bubbles: true, ...init }));
    await flush();

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByLabelText('이름')).toHaveValue('한글');
  });

  it('조합이 끝난 Esc 는 취소로 닫는다', async () => {
    const user = await open();
    await user.click(screen.getByRole('radio', { name: '새 카테고리를 만들어 옮기기' }));
    const input = screen.getByLabelText('이름');
    await user.type(input, '한글');

    fireEvent(
      input,
      createEvent.keyDown(input, { key: 'Escape', bubbles: true, isComposing: false, keyCode: 27 }),
    );

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(tables.categories.rows.get(공부.id)?.deletedAt).toBeUndefined();
  });

  it('조합이 끝난 Enter 도 이름 입력에서는 삭제를 실행하지 않는다', async () => {
    const user = await open();
    await user.click(screen.getByRole('radio', { name: '새 카테고리를 만들어 옮기기' }));
    await user.type(screen.getByLabelText('이름'), '새 그룹{Enter}');
    await flush();

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(tables.categories.rows.get(공부.id)?.deletedAt).toBeUndefined();
  });
});

describe('되돌리기 (R15)', () => {
  it('삭제하면 토스트가 뜨고 [되돌리기] 가 전부 되감는다', async () => {
    const user = await open();
    await user.click(screen.getByRole('radio', { name: '함께 삭제' }));
    await user.click(screen.getByRole('button', { name: '삭제' }));

    const undo = await screen.findByRole('button', { name: '되돌리기' });
    expect(screen.getByRole('status')).toHaveTextContent("'공부'를 삭제했어요");

    await user.click(undo);

    await waitFor(() => expect(useCategoryStore.getState().byId[공부.id]).toBeDefined());
    expect(tables.categories.rows.get(공부.id)?.deletedAt).toBeUndefined();
    expect(todoRow(할일[0].id).deletedAt).toBeUndefined();
    expect(todoRow(할일[0].id).order).toBe(할일[0].order);
    expect(screen.queryByRole('button', { name: '되돌리기' })).toBeNull();
  });

  // 가짜 시계는 `userEvent` 와 섞지 않는다 — 섞으면 이 파일의 **뒤 테스트들이 전부 5초 타임아웃**으로
  // 죽는다(실측). 여기서는 `fireEvent` 로만 조작하고, 실제 시계로 돌아가기 전에 먼저 언마운트한다.
  it('6초가 지나면 창이 닫히고 되감을 값을 버린다', async () => {
    vi.useFakeTimers();
    try {
      render(<Harness />);
      fireEvent.click(screen.getByRole('button', { name: '삭제 열기' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      fireEvent.click(screen.getByRole('radio', { name: '함께 삭제' }));
      fireEvent.click(screen.getByRole('button', { name: '삭제' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByRole('button', { name: '되돌리기' })).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });

      expect(screen.queryByRole('button', { name: '되돌리기' })).toBeNull();
      expect(useCategoryStore.getState().pendingRemoval).toBeNull();
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });
});

describe('종료 제안 (R16)', () => {
  it('N>0 · M>0 일 때만 나오고 누르면 대화상자를 닫고 완료로 종료한다', async () => {
    const user = await open();

    await user.click(screen.getByRole('button', { name: '완료로 종료' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() =>
      expect(useCategoryStore.getState().byId[공부.id]?.status).toBe('completed'),
    );
    expect(tables.categories.rows.get(공부.id)?.deletedAt).toBeUndefined();
  });

  it('남길 기록이 없으면(N=0) 숨긴다', async () => {
    seed([공부, 운동], [할일[0], 할일[2]]);
    await open();

    expect(screen.queryByRole('button', { name: '완료로 종료' })).toBeNull();
  });
});

describe('키보드만으로 (§5·app-shell R14)', () => {
  it('Tab 으로 세 갈래를 모두 지나 [삭제] 까지 닿고 Esc 로 취소한다', async () => {
    const user = await open();

    expect(screen.getByRole('radio', { name: '다른 카테고리로 옮기기' })).toHaveFocus();
    const 순서: string[] = [];
    for (let step = 0; step < 8; step += 1) {
      await user.tab();
      const active = document.activeElement;
      expect(active).not.toBe(document.body);
      순서.push(active instanceof HTMLElement ? (active.textContent ?? active.tagName) : '?');
    }
    expect(dialog().contains(document.activeElement)).toBe(true);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(tables.categories.rows.get(공부.id)?.deletedAt).toBeUndefined();
    expect(screen.getByRole('button', { name: '삭제 열기' })).toHaveFocus();
  });

  // 라디오 그룹 안의 방향키 이동은 **브라우저 기본 동작**이라 jsdom 에는 없다 — 여기서는 포커스 +
  // Space(역시 기본 동작이지만 user-event 가 구현한다)로 "마우스 없이 고를 수 있다"만 확인한다.
  it('키보드로 ③ 을 고르고 Enter 로 실행할 수 있다', async () => {
    const user = await open();

    screen.getByRole('radio', { name: '함께 삭제' }).focus();
    await user.keyboard(' ');
    expect(screen.getByRole('radio', { name: '함께 삭제' })).toBeChecked();

    screen.getByRole('button', { name: '삭제' }).focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(tables.categories.rows.get(공부.id)?.deletedAt).toBeDefined();
  });
});

describe('연타·중복 실행 방지 (R13)', () => {
  // 3선택지 화면의 [삭제] 는 `loading` 으로 비활성이 되지만, **축약(R11)** 은 공용 `ConfirmDialog`
  // 라 [삭제] 가 끝까지 눌린다 — 저장이 끝나기 전 두 번째 실행을 막는 것은 `confirm()` 의
  // `removing` 가드 하나뿐이다.
  //
  // 세는 자리를 `dataset.write` 가 아니라 **스토어 액션**으로 잡은 이유: 두 번째 실행은 쓰기 큐에서
  // 기다렸다가 이미 지워진 카테고리로 계획을 세우므로 write 가 비어 흡수된다(실측 — 저장소 수준에서는
  // 1회로 똑같이 보인다). 막아야 하는 것은 "두 번째 파괴적 실행을 **시작하는 것**" 이고, 그 경계가
  // 여기다. 계획이 비지 않는 순간(예: 큐 순서가 바뀌거나 계획이 멱등이 아니게 되는 순간) 같은 삭제가
  // 두 번 저장된다.
  it('축약 화면에서 [삭제] 를 두 번 눌러도 삭제 실행은 한 번만 시작된다', async () => {
    seed([공부, 운동], [할일[1], 할일[3]]);
    const calls: unknown[] = [];
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const real = useCategoryStore.getState().removeCategory;
    useCategoryStore.setState({
      removeCategory: async (input) => {
        calls.push(input);
        await gate;
        return real(input);
      },
    });

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '삭제 열기' }));
    await screen.findByRole('alertdialog');

    const remove = within(dialog()).getByRole('button', { name: '삭제' });
    fireEvent.click(remove);
    await flush();
    // 저장이 아직 끝나지 않았는데도 버튼은 그대로 눌린다 — 여기서 가드가 유일한 방어다.
    expect(remove).toBeEnabled();
    fireEvent.click(remove);
    await flush(3);

    expect(calls).toHaveLength(1);

    release();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await flush(3);
    expect(calls).toHaveLength(1);
  });
});

describe('되돌리기 뒤 목록 재조회 (R15)', () => {
  // 카테고리 스토어는 투두를 모른다 — 되돌려 놓은 투두가 화면에 다시 나타나려면 보고 있는 날짜를
  // 다시 읽어야 한다. 이 배선이 빠지면 "되돌렸는데 목록은 그대로" 가 된다(저장소만 복구된다).
  it('되돌리면 보고 있는 날짜의 투두가 메모리로 돌아온다', async () => {
    const user = await open();
    await user.click(screen.getByRole('radio', { name: '함께 삭제' }));
    await user.click(screen.getByRole('button', { name: '삭제' }));
    const undo = await screen.findByRole('button', { name: '되돌리기' });

    // 삭제 직후: 지워진 미완료 3건이 메모리에서 내려가 있다.
    await waitFor(() => {
      expect(useTodoStore.getState().byId[할일[0].id]).toBeUndefined();
    });

    await user.click(undo);

    await waitFor(() => {
      expect(useTodoStore.getState().byId[할일[0].id]).toBeDefined();
    });
    expect(useTodoStore.getState().byId[할일[2].id]).toBeDefined();
    expect(useTodoStore.getState().byId[할일[4].id]).toBeDefined();
  });
});

describe('빈틈 메우기 — 리뷰가 생존 변이로 짚은 자리', () => {
  it('② 즉석 생성도 50개 상한을 지킨다 (R12 → R6)', async () => {
    // 활성 50개를 채운 상태에서 그 중 하나를 지우며 ②를 고르면, 만들 자리가 없다.
    // (모집단은 **삭제 시점의 전량** 이라 지우는 카테고리 자신도 아직 세어진다.)
    const many = makeCategories(50, (index) => ({ name: `그룹${index + 1}` }));
    seed(many, [makeTodo({ seq: 1, categoryId: many[0].id, order: 0, done: false })]);
    const user = await open(many[0]);
    // 도메인도 같은 문구를 던지므로 **문구만으로는** 화면 검사의 유무가 갈리지 않는다.
    // 갈리는 것은 "저장을 시도했는가" 다 — 화면에서 걸리면 쓰기가 한 번도 나가지 않는다.
    const writes = countWrites();

    await user.click(screen.getByRole('radio', { name: '새 카테고리를 만들어 옮기기' }));
    await user.type(screen.getByLabelText('이름'), '한 개 더');
    await user.click(screen.getByRole('button', { name: '삭제' }));

    expect(within(dialog()).getByRole('alert')).toHaveTextContent(
      '카테고리는 50개까지 만들 수 있어요',
    );
    await flush(3);
    expect(writes()).toBe(0);
    // 도메인도 같은 문구를 던지지만 그 길로 가면 실행이 시작돼 스토어에 실패가 남는다.
    // 화면이 먼저 걸렀다면 실행 자체가 없었으므로 스토어는 깨끗하다.
    expect(useCategoryStore.getState().error).toBeNull();
    expect(tables.categories.rows.get(many[0].id)?.deletedAt).toBeUndefined();
  });

  it('삭제 대상을 바꿔 다시 열면 ② 의 이름·색이 남아 있지 않다', async () => {
    const user = userEvent.setup();
    render(<TwoTargets />);

    await user.click(screen.getByRole('button', { name: '공부 삭제' }));
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('radio', { name: '새 카테고리를 만들어 옮기기' }));
    await user.type(screen.getByLabelText('이름'), '남으면 안 되는 이름');
    await user.click(screen.getByRole('radio', { name: '민트' }));
    await user.click(within(dialog()).getByRole('button', { name: '취소' }));

    await user.click(screen.getByRole('button', { name: '운동 삭제' }));
    await screen.findByRole('alertdialog');

    // 대상이 바뀌면 폼이 통째로 새로 마운트된다 — 기본값은 ①(옮기기)이라 이름 입력이 없다.
    expect(screen.queryByLabelText('이름')).toBeNull();
    await user.click(screen.getByRole('radio', { name: '새 카테고리를 만들어 옮기기' }));
    expect(screen.getByLabelText('이름')).toHaveValue('');
    expect(screen.getByRole('radio', { name: '민트' })).not.toBeChecked();
  });
});
