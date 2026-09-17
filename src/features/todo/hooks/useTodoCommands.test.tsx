// 투두 명령 등록 (shortcuts R7 · §2).
//
// **"팔레트에 뜬다" 만 재지 않는다.** 등록은 됐는데 `run` 이 빈 함수여도 목록 단언은 통과한다.
// 그래서 통합 테스트는 레지스트리의 `runCommand` 를 거쳐 **입력 행이 실제로 열리는 것**까지 본다.
// 픽스처는 **비대칭**이다: 활성 2개(공부·운동)의 이름·순서가 다르고 종료 1개(요리)와 삭제된
// 카테고리 1개(청소)가 섞여 있다 — 활성만 거르는지, 첫 칸에만 `N` 을 다는지가 드러나야 한다.
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Category } from '@/domain/category/category';
import type { CategoryId } from '@/domain/ids';
import type { Persistable } from '@/domain/meta';
import type { Todo } from '@/domain/todo/todo';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { matchCommands, useCommandStore } from '@/features/command';
import { TodoList } from '@/features/todo/components/TodoList';
import {
  TODO_NEW_COMMAND_PREFIX,
  buildTodoCommands,
  todoNewCommandLabel,
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

beforeEach(async () => {
  setRepositories(createMemoryRepositories());
  useCommandStore.setState({ commands: [], recentCommandIds: [] });
  useTodoStore.setState({ byId: {}, date: null, status: 'idle', error: null });
  await getRepositories().todos.upsert(수학 as Persistable<Todo>);
});

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
