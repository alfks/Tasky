// 투두 명령 등록 (shortcuts R7 · §2).
//
// **"팔레트에 뜬다" 만 재지 않는다.** 등록은 됐는데 `run` 이 빈 함수여도 목록 단언은 통과한다.
// 그래서 통합 테스트는 레지스트리의 `runCommand` 를 거쳐 **입력 행이 실제로 열리는 것**까지 본다.
// 픽스처는 **비대칭**이다: 활성 2개(공부·운동)의 이름·순서가 다르고 종료 1개(요리)와 삭제된
// 카테고리 1개(청소)가 섞여 있다 — 활성만 거르는지, 첫 칸에만 `N` 을 다는지가 드러나야 한다.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Category } from '@/domain/category/category';
import type { DateKey } from '@/domain/date/date-key';
import type { CategoryId } from '@/domain/ids';
import type { Persistable } from '@/domain/meta';
import type { Todo } from '@/domain/todo/todo';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { CommandLayer, CommandPalette, matchCommands, useCommandStore } from '@/features/command';
import { useDateStripStore } from '@/features/date-strip';
import { TodoList } from '@/features/todo/components/TodoList';
import {
  TODO_NEW_COMMAND_PREFIX,
  TODO_QUICK_ADD_ID,
  buildTodoCommands,
  todoNewCommandLabel,
  todoQuickAddLabel,
} from '@/features/todo/hooks/useTodoCommands';
import { TODO_MESSAGES as M } from '@/features/todo/messages';
import { useTodoStore } from '@/features/todo/store/todo-store';
import { makeCategory } from '@/test/fixtures/category';
import { FIXTURE_DATE } from '@/test/fixtures/deps';
import { makeTodo } from '@/test/fixtures/todo';

const 공부 = makeCategory({ seq: 1, name: '공부', order: 0 });
const 운동 = makeCategory({ seq: 2, name: '운동', order: 1 });
const 요리 = makeCategory({
  seq: 3,
  name: '요리',
  order: 2,
  status: 'completed',
  closedAt: '2026-01-20T00:00:00.000Z',
});
const 카테고리: Category[] = [공부, 운동, 요리];

const 수학 = makeTodo({ seq: 1, categoryId: 공부.id, title: '수학' });

function commandIds(): string[] {
  return useCommandStore.getState().commands.map((command) => command.id);
}

/** 오늘. 보고 있는 날짜와 **다르게** 둬야 "오늘에 추가" 가 측정된다. */
const TODAY = '2026-09-17' as DateKey;

beforeEach(async () => {
  setRepositories(createMemoryRepositories());
  useCommandStore.setState({
    shortcuts: [],
    commands: [],
    quickAdds: [],
    recentCommandIds: [],
    paletteOpen: false,
  });
  useTodoStore.setState({ byId: {}, date: null, status: 'idle', error: null });
  useDateStripStore.setState({ selectedDate: FIXTURE_DATE, today: TODAY });
  await getRepositories().todos.upsert(수학 as Persistable<Todo>);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * 셸이 하는 배선 그대로: 날짜 스트립이 고른 날짜를 `TodoList` 가 받고, 팔레트는 한 번 끼워진다.
 * **`date` 를 고정하지 않는 것이 요점이다** — 빈 결과 줄은 날짜를 오늘로 옮긴 뒤 추가하므로,
 * 고정해 버리면 그 이동이 목록에 반영되지 않아 "오늘에 들어갔는가" 를 잴 수 없다.
 */
function QuickAddHarness({ categories = 카테고리 }: { categories?: Category[] }) {
  const selected = useDateStripStore((state) => state.selectedDate);
  return (
    <>
      <button type="button">열기</button>
      <TodoList date={selected} categories={categories} />
      <CommandLayer palette={<CommandPalette />} />
    </>
  );
}

async function openPaletteAndType(
  user: ReturnType<typeof userEvent.setup>,
  query: string,
): Promise<HTMLElement> {
  screen.getByRole('button', { name: '열기' }).focus();
  await user.keyboard('{Control>}k{/Control}');
  const input = screen.getByRole('combobox');
  await user.type(input, query);
  return input;
}

/** 저장소에 실제로 남은 그 날짜의 할 일들. 스토어가 아니라 **저장소**를 본다. */
async function storedTitles(date: DateKey): Promise<string[]> {
  const todos = await getRepositories().todos.listByDate(date);
  return todos.map((todo) => todo.title);
}

describe('buildTodoCommands (R7 "새 할 일(활성 카테고리별)")', () => {
  it('카테고리마다 하나씩, 이름을 라벨과 키워드 양쪽에 싣는다', () => {
    const commands = buildTodoCommands([공부, 운동], () => {});

    expect(commands.map((command) => command.id)).toEqual([
      `${TODO_NEW_COMMAND_PREFIX}${공부.id}`,
      `${TODO_NEW_COMMAND_PREFIX}${운동.id}`,
    ]);
    expect(commands.map((command) => command.label)).toEqual([
      '새 할 일 (공부)',
      '새 할 일 (운동)',
    ]);
  });

  it('라벨에 없는 말(`추가`)로도 찾힌다 — 키워드는 그것만 싣는다 (R8)', () => {
    const commands = buildTodoCommands([공부, 운동], () => {});

    expect(matchCommands(commands, '추가')).toHaveLength(2);
  });

  it('`N` 조합은 첫 카테고리에만 붙는다 (R1 — N 은 첫 활성 카테고리를 연다)', () => {
    const commands = buildTodoCommands([공부, 운동], () => {});

    expect(commands[0]?.shortcutId).toBe('todo.new');
    expect(commands[1]?.shortcutId).toBeUndefined();
  });

  it('run 은 자기 카테고리 id 로 입력 행을 연다', () => {
    const open = vi.fn<(id: CategoryId) => void>();
    const commands = buildTodoCommands([공부, 운동], open);

    commands[1]?.run();

    expect(open).toHaveBeenCalledWith(운동.id);
  });

  it('카테고리가 0개면 명령도 0개다 (R7 "카테고리 0개면 거짓")', () => {
    expect(buildTodoCommands([], () => {})).toEqual([]);
  });
});

describe('TodoList 가 등록한다 (R7)', () => {
  it('활성 카테고리만 팔레트에 올린다 — 종료된 카테고리는 없다', async () => {
    render(<TodoList date={FIXTURE_DATE} categories={카테고리} />);

    await waitFor(() => expect(commandIds()).toContain(`${TODO_NEW_COMMAND_PREFIX}${공부.id}`));
    expect(commandIds()).toContain(`${TODO_NEW_COMMAND_PREFIX}${운동.id}`);
    expect(commandIds()).not.toContain(`${TODO_NEW_COMMAND_PREFIX}${요리.id}`);
  });

  it('한글 카테고리 이름으로 찾힌다 (R8 부분 일치)', async () => {
    render(<TodoList date={FIXTURE_DATE} categories={카테고리} />);
    await waitFor(() => expect(commandIds().length).toBe(2));

    const hits = matchCommands(useCommandStore.getState().commands, '운동');

    expect(hits.map((command) => command.label)).toEqual([todoNewCommandLabel('운동')]);
  });

  it('Enter 로 실행하면 그 카테고리의 입력 행이 **실제로** 열린다', async () => {
    render(<TodoList date={FIXTURE_DATE} categories={카테고리} />);
    await waitFor(() => expect(commandIds().length).toBe(2));
    expect(screen.queryByLabelText(M.addLabel('운동'))).not.toBeInTheDocument();

    await useCommandStore.getState().runCommand(`${TODO_NEW_COMMAND_PREFIX}${운동.id}`);

    await waitFor(() => expect(screen.getByLabelText(M.addLabel('운동'))).toBeInTheDocument());
    // 다른 그룹의 행은 열리지 않는다 — 한 번에 하나다.
    expect(screen.queryByLabelText(M.addLabel('공부'))).not.toBeInTheDocument();
  });

  it('목록이 사라지면 명령도 사라진다 — 죽은 명령이 Enter 를 먹지 않게', async () => {
    const view = render(<TodoList date={FIXTURE_DATE} categories={카테고리} />);
    await waitFor(() => expect(commandIds().length).toBe(2));

    view.unmount();

    expect(commandIds()).toEqual([]);
  });

  it('카테고리 이름이 바뀌면 라벨도 따라간다', async () => {
    const view = render(<TodoList date={FIXTURE_DATE} categories={카테고리} />);
    await waitFor(() => expect(commandIds().length).toBe(2));

    view.rerender(
      <TodoList date={FIXTURE_DATE} categories={[{ ...공부, name: '수학 공부' }, 운동, 요리]} />,
    );

    await waitFor(() =>
      expect(useCommandStore.getState().commands.map((command) => command.label)).toEqual([
        todoNewCommandLabel('수학 공부'),
        todoNewCommandLabel('운동'),
      ]),
    );
  });
});

describe('빈 결과 줄 — Enter 로 **실제로 할 일이 생긴다** (§2)', () => {
  it('아무 것도 안 걸린 질의에서 Enter 를 누르면 그 제목의 할 일이 저장소에 생긴다', async () => {
    const user = userEvent.setup();
    render(<QuickAddHarness />);
    await waitFor(() => expect(commandIds().length).toBe(2));
    expect(await storedTitles(TODAY)).toEqual([]);

    await openPaletteAndType(user, '장보기');
    // 이름을 **문자열 그대로** 찾는다. `todoQuickAddLabel()` 로 찾으면 라벨이 질의를 안 싣게
    // 바뀌어도 기대값이 함께 바뀌어 통과한다(음성 대조에서 실제로 살아남았다).
    await screen.findByRole('option', { name: "'장보기'를 오늘 할 일로 추가" });
    await user.keyboard('{Enter}');

    await waitFor(async () => expect(await storedTitles(TODAY)).toEqual(['장보기']));
  });

  it('그 줄의 이름은 §2 의 문면 그대로다 — 질의가 이름에 들어간다', () => {
    expect(todoQuickAddLabel('장보기')).toBe("'장보기'를 오늘 할 일로 추가");
  });

  it('느린 조회가 끝난 **뒤에** 쓴다 — 조회 응답이 방금 만든 할 일을 덮지 않는다', async () => {
    const user = userEvent.setup();
    const todos = getRepositories().todos;
    const realList = todos.listByDate.bind(todos);
    let release: (() => void) | null = null;
    vi.spyOn(todos, 'listByDate').mockImplementation(async (date) => {
      if (date !== TODAY) return realList(date);
      // **기다리기 전에** 지금 스냅샷을 뜬다. 쓰기가 끼어든 뒤에 읽으면 덮어쓰기가 안 보인다.
      const snapshot = realList(date);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return snapshot;
    });
    render(<QuickAddHarness />);
    await waitFor(() => expect(commandIds().length).toBe(2));

    await openPaletteAndType(user, '장보기');
    await screen.findByRole('option', { name: /오늘 할 일로 추가/ });
    await user.keyboard('{Enter}');

    // 오늘 조회가 아직 끝나지 않았다. 이 틈에 쓰면 뒤늦은 응답이 그 할 일을 화면에서 지운다.
    await waitFor(() => expect(release).not.toBeNull());
    await act(async () => {
      release?.();
      await Promise.resolve();
    });

    // 저장소 조회는 **가짜를 거치지 않은** 것으로 확인한다 — 두 번째 호출은 아무도 풀어 주지 않는다.
    await waitFor(async () =>
      expect((await realList(TODAY)).map((todo) => todo.title)).toEqual(['장보기']),
    );
    // 그리고 화면에 남아 있다. 뒤늦은 조회 응답이 덮었다면 여기서 사라진다.
    await waitFor(() => expect(screen.getByText('장보기')).toBeInTheDocument());
  });

  it('보고 있던 날짜가 아니라 **오늘**에 들어간다 (§2 "오늘 할 일로 추가")', async () => {
    const user = userEvent.setup();
    render(<QuickAddHarness />);
    await waitFor(() => expect(commandIds().length).toBe(2));

    await openPaletteAndType(user, '장보기');
    await screen.findByRole('option', { name: /오늘 할 일로 추가/ });
    await user.keyboard('{Enter}');

    await waitFor(async () => expect(await storedTitles(TODAY)).toEqual(['장보기']));
    // 보고 있던 날짜에는 원래 있던 것만 남는다 — 엉뚱한 날짜에 쓰지 않았다.
    expect(await storedTitles(FIXTURE_DATE)).toEqual(['수학']);
    // 화면도 오늘로 따라가서 방금 만든 것이 보인다 — 막다른 길이 아니다.
    expect(useDateStripStore.getState().selectedDate).toBe(TODAY);
    await waitFor(() => expect(screen.getByText('장보기')).toBeInTheDocument());
  });

  it('**첫 활성 카테고리**에 들어간다 — `N` 이 여는 그 카테고리다 (§2 "첫 카테고리에 추가")', async () => {
    const user = userEvent.setup();
    render(<QuickAddHarness />);
    await waitFor(() => expect(commandIds().length).toBe(2));

    await openPaletteAndType(user, '장보기');
    await screen.findByRole('option', { name: /오늘 할 일로 추가/ });
    await user.keyboard('{Enter}');

    await waitFor(async () =>
      expect((await getRepositories().todos.listByDate(TODAY))[0]?.categoryId).toBe(공부.id),
    );
  });

  it('이미 오늘을 보고 있어도 생긴다 — 날짜를 옮길 것이 없는 경로', async () => {
    const user = userEvent.setup();
    useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });
    render(<QuickAddHarness />);
    await waitFor(() => expect(commandIds().length).toBe(2));

    await openPaletteAndType(user, '장보기');
    await screen.findByRole('option', { name: /오늘 할 일로 추가/ });
    await user.keyboard('{Enter}');

    await waitFor(async () => expect(await storedTitles(TODAY)).toEqual(['장보기']));
  });

  it('한글 조합 중의 Enter 로는 할 일이 생기지 않는다 — "ㅈ" 만 치고 추가되면 안 된다', async () => {
    const user = userEvent.setup();
    render(<QuickAddHarness />);
    await waitFor(() => expect(commandIds().length).toBe(2));
    const input = await openPaletteAndType(user, 'ㅈ');
    await screen.findByRole('option', { name: todoQuickAddLabel('ㅈ') });

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });

    // **팔레트가 아직 열려 있다**는 것이 판별선이다. 실행됐다면 `runOption` 이 곧바로 닫으므로
    // 이 단언은 동기적으로 깨진다. "할 일이 아직 없다" 만 보면 저장이 늦게 도착할 때 그냥
    // 통과한다 — 실제로 두 가드를 모두 지운 변이가 그렇게 살아남았다.
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(await storedTitles(TODAY)).toEqual([]);

    // 조합이 끝난 Enter 는 실행된다 — 가드가 키를 영영 먹어 버리지 않는다.
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(async () => expect(await storedTitles(TODAY)).toEqual(['ㅈ']));
  });

  it('카테고리가 0개면 그 줄이 아예 없다 (§2 "카테고리 0개면 이 줄 없음")', async () => {
    const user = userEvent.setup();
    render(<QuickAddHarness categories={[]} />);
    await waitFor(() =>
      expect(useCommandStore.getState().quickAdds.map((entry) => entry.id)).toEqual([
        TODO_QUICK_ADD_ID,
      ]),
    );

    await openPaletteAndType(user, '장보기');
    await screen.findByText(/결과가 없어요 — 다른 말로/);

    expect(screen.queryByRole('option', { name: /오늘 할 일로 추가/ })).toBeNull();
    await user.keyboard('{Enter}');
    expect(await storedTitles(TODAY)).toEqual([]);
  });

  it('목록이 사라지면 그 줄도 사라진다 — 죽은 줄이 Enter 를 먹지 않게', async () => {
    const view = render(<QuickAddHarness />);
    await waitFor(() => expect(useCommandStore.getState().quickAdds).toHaveLength(1));

    view.unmount();

    expect(useCommandStore.getState().quickAdds).toEqual([]);
  });

  it('카테고리가 바뀌어도 줄을 다시 걸지 않는다 — 다시 걸면 그 프레임에 줄이 사라진다', async () => {
    const view = render(<QuickAddHarness />);
    await waitFor(() => expect(useCommandStore.getState().quickAdds).toHaveLength(1));
    const first = useCommandStore.getState().quickAdds[0];

    view.rerender(<QuickAddHarness categories={[{ ...공부, name: '수학 공부' }, 운동, 요리]} />);

    await waitFor(() => expect(commandIds().length).toBe(2));
    expect(useCommandStore.getState().quickAdds[0]).toBe(first);
  });
});
