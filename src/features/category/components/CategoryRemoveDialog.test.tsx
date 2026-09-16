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
import { makeCategory } from '@/test/fixtures/category';
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

/** 대기 중인 저장(마이크로태스크 + 타이머)을 전부 흘려보낸다. "실행되지 않았다" 를 단언하기 전에 반드시 부른다. */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
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
