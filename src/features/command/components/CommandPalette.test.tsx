import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adopt } from '@/domain/meta';

import { getRepositories } from '@/repositories/container';

import { CommandLayer } from '@/features/command/components/CommandLayer';
import { CommandPalette } from '@/features/command/components/CommandPalette';
import type { Command } from '@/features/command/store/command-registry';
import { useCommandStore } from '@/features/command/store/command-store';
import { useDateStripStore } from '@/features/date-strip';
import { makeCategory } from '@/test/fixtures/category';
import { makeTodo } from '@/test/fixtures/todo';

const TODO = makeTodo({ seq: 1, title: '장보기', date: '2026-09-03' });
const CATEGORY = makeCategory({ id: TODO.categoryId, name: '생활' });

/** 레지스트리에 미리 넣어 두는 스파이 명령. 팔레트가 등록하는 MVP 명령과 id 가 겹치지 않는다. */
function spyCommand(run = vi.fn()): { command: Command; run: ReturnType<typeof vi.fn> } {
  return { command: { id: 'test.spy', label: '스파이 실행', keywords: ['스파이'], run }, run };
}

/**
 * 셸이 하는 배선 그대로 — `<CommandLayer palette={…}/>` 한 번 + 팔레트를 열 버튼 하나.
 * `data-flip-id` 줄은 투두 목록의 행을 흉내 낸다(`CommandPaletteRun.TODO_ROW_ATTR`).
 */
function Harness() {
  return (
    <>
      <button type="button">열기</button>
      <ul>
        {/* 투두 행이 실제로 tabIndex 를 갖는다(todo.md §5). */}
        <li data-flip-id={TODO.id} tabIndex={-1}>
          장보기
        </li>
      </ul>
      <CommandLayer palette={<CommandPalette />} />
    </>
  );
}

async function openPalette(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  screen.getByRole('button', { name: '열기' }).focus();
  await user.keyboard('{Control>}k{/Control}');
  return screen.getByRole('combobox');
}

function activeOptionText(): string {
  const id = screen.getByRole('combobox').getAttribute('aria-activedescendant') ?? '';
  return document.getElementById(id)?.textContent ?? '';
}

beforeEach(async () => {
  useCommandStore.setState({
    shortcuts: [],
    commands: [],
    recentCommandIds: [],
    helpOpen: false,
    paletteOpen: false,
    commandError: null,
  });
  await getRepositories().categories.upsert(adopt(CATEGORY));
  useDateStripStore.setState({ selectedDate: '2026-09-17', today: '2026-09-17' });
  await getRepositories().todos.upsert(adopt(TODO));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CommandPalette — 열고 닫기 (R11)', () => {
  it('Mod+K 로 열리고 입력칸에 포커스가 간다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = await openPalette(user);
    expect(screen.getByRole('dialog', { name: '명령 팔레트' })).toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it('Esc 로 닫으면 포커스가 열기 전 자리로 돌아간다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openPalette(user);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
    expect(screen.getByRole('button', { name: '열기' })).toHaveFocus();
  });
});

describe('CommandPalette — 목록 (§2 · R8·R12)', () => {
  it('빈 질의는 명령만 싣고 최근 실행한 것을 앞세운다', async () => {
    const user = userEvent.setup();
    useCommandStore.setState({ recentCommandIds: ['help.open'] });
    render(<Harness />);
    await openPalette(user);
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveTextContent('단축키 도움말');
    expect(screen.queryByRole('group', { name: /할 일/ })).toBeNull();
  });

  it('한글로 치면 명령이 걸러진다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = await openPalette(user);
    await user.type(input, '어둡게');
    const group = screen.getByRole('group', { name: '명령' });
    expect(within(group).getAllByRole('option')).toHaveLength(1);
    expect(within(group).getByRole('option')).toHaveTextContent('다크 모드로 전환');
  });

  it('투두는 제목으로 찾고 카테고리·날짜를 함께 보여 준다 (R9)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = await openPalette(user);
    await user.type(input, '장보기');
    const group = await screen.findByRole('group', { name: '할 일 (1)' });
    expect(within(group).getByRole('option')).toHaveTextContent('생활 · 9월 3일');
  });

  it('검색이 실패하면 투두 섹션이 사라지고 명령만 남는다 (§2 에러)', async () => {
    const user = userEvent.setup();
    vi.spyOn(getRepositories().todos, 'search').mockRejectedValue(new Error('저장소 실패'));
    render(<Harness />);
    const input = await openPalette(user);
    await user.type(input, '어둡게');
    await waitFor(() => expect(getRepositories().todos.search).toHaveBeenCalled());
    expect(screen.queryByRole('group', { name: /할 일/ })).toBeNull();
    expect(screen.getByRole('group', { name: '명령' })).toBeInTheDocument();
  });

  it('같은 일을 하는 단축키가 있으면 줄 오른쪽에 조합을 그린다 (§2)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = await openPalette(user);
    await user.type(input, '오늘로');
    const option = screen.getByRole('option', { name: /오늘로 이동/ });
    expect(option).toHaveTextContent('T');
    expect(within(option).getByText('T', { selector: 'kbd' })).toBeInTheDocument();
  });

  it('선택된 줄만 aria-selected 다 (§5)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openPalette(user);
    const selected = screen
      .getAllByRole('option')
      .filter((option) => option.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]?.id).toBe(
      screen.getByRole('combobox').getAttribute('aria-activedescendant'),
    );
  });

  it('날짜로 읽히는 질의는 이동 명령을 맨 앞에 세운다 (R7)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = await openPalette(user);
    await user.type(input, '9/18');
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('9월 18일로 이동');
  });
});

describe('CommandPalette — 키보드 (§2 · §5)', () => {
  it('↑/↓ 가 선택을 옮기고 양끝에서 돌아온다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openPalette(user);
    const first = activeOptionText();
    await user.keyboard('{ArrowDown}');
    const second = activeOptionText();
    expect(second).not.toBe(first);
    await user.keyboard('{ArrowUp}');
    expect(activeOptionText()).toBe(first);
    await user.keyboard('{ArrowUp}');
    const last = activeOptionText();
    expect(last).not.toBe(first);
    expect(last).toBe(screen.getAllByRole('option').at(-1)?.textContent);
  });

  it('Enter 가 고른 명령을 실행하고 팔레트를 닫는다 (R11)', async () => {
    const user = userEvent.setup();
    const { command, run } = spyCommand();
    useCommandStore.getState().registerCommands([command]);
    render(<Harness />);
    const input = await openPalette(user);
    await user.type(input, '스파이');
    await user.keyboard('{Enter}');
    expect(run).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
    expect(useCommandStore.getState().recentCommandIds[0]).toBe('test.spy');
  });

  it('한글 조합 중의 Enter 는 실행이 아니다', async () => {
    const user = userEvent.setup();
    const { command, run } = spyCommand();
    useCommandStore.getState().registerCommands([command]);
    render(<Harness />);
    const input = await openPalette(user);
    await user.type(input, '스파이');
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('한글 조합 중의 ↓ 는 선택을 옮기지 않는다 (R6)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = await openPalette(user);
    const before = activeOptionText();
    fireEvent.keyDown(input, { key: 'ArrowDown', isComposing: true });
    expect(activeOptionText()).toBe(before);
    fireEvent.keyDown(input, { key: 'ArrowDown', keyCode: 229 });
    expect(activeOptionText()).toBe(before);
  });
});

describe('CommandPalette — 실행 (§2)', () => {
  it('투두를 고르면 그 날짜로 옮기고 그 행에 포커스한다 — 포커스 복귀에 뺏기지 않는다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = await openPalette(user);
    await user.type(input, '장보기');
    const group = await screen.findByRole('group', { name: '할 일 (1)' });
    await user.click(within(group).getByRole('option'));

    expect(useDateStripStore.getState().selectedDate).toBe('2026-09-03');
    await waitFor(() =>
      expect(document.querySelector(`[data-flip-id="${TODO.id}"]`)).toHaveFocus(),
    );
  });

  it('날짜 이동 명령이 그 날짜를 고른다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = await openPalette(user);
    await user.type(input, '2026-11-02');
    await user.keyboard('{Enter}');
    expect(useDateStripStore.getState().selectedDate).toBe('2026-11-02');
  });
});
