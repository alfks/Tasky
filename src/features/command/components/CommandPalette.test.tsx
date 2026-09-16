import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adopt } from '@/domain/meta';
import type { Todo } from '@/domain/todo/todo';

import { getRepositories } from '@/repositories/container';

import { CommandLayer } from '@/features/command/components/CommandLayer';
import { CommandPalette } from '@/features/command/components/CommandPalette';
import type { Command } from '@/features/command/store/command-registry';
import { useCommandStore } from '@/features/command/store/command-store';
import { useDateStripStore } from '@/features/date-strip';
import { makeCategory } from '@/test/fixtures/category';
import { makeTodo } from '@/test/fixtures/todo';

import { addDays, startOfWeek } from '@/lib/date';

const TODO = makeTodo({ seq: 1, title: '장보기', date: '2026-09-03' });
/** `beforeEach` 가 고정하는 선택 날짜. 주 이동 명령이 이 값을 떠나게 만든다. */
const START_DATE = '2026-09-17';
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
  // 실제 목록처럼 **보고 있는 날짜의 행만** 그린다. 항상 떠 있으면 `goToTodo` 의 폴링 대기 경로가
  // 한 번도 돌지 않아, 날짜를 옮긴 뒤 행이 나타나기를 기다리는 부분이 통째로 미측정으로 남는다.
  const selected = useDateStripStore((state) => state.selectedDate);
  return (
    <>
      <button type="button">열기</button>
      <ul>
        {selected === TODO.date ? (
          // 투두 행이 실제로 tabIndex 를 갖는다(todo.md §5).
          <li data-flip-id={TODO.id} tabIndex={-1}>
            장보기
          </li>
        ) : null}
      </ul>
      <CommandLayer palette={<CommandPalette />} />
    </>
  );
}

/**
 * **여는 요소가 명령의 결과로 사라지는** 화면. 실제 `DateStrip` 의 마크업 계약을 흉내 낸다
 * (`role="radiogroup"` > `role="radio"` + `aria-checked`, date-strip §5). 주를 옮기면 그 주의 셀 7개가
 * 통째로 갈리므로, 셀에 포커스를 둔 채 "다음 주로 이동" 을 실행하면 `Dialog` 가 돌아갈 요소가 없어진다.
 */
function WeekHarness({ withStrip = true }: { withStrip?: boolean }) {
  const selected = useDateStripStore((state) => state.selectedDate);
  const monday = startOfWeek(selected);
  const days = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  return (
    <>
      <main tabIndex={-1}>본문</main>
      {withStrip ? (
        <div role="radiogroup" aria-label="날짜 선택">
          {days.map((date) => (
            <button
              key={date}
              type="button"
              role="radio"
              aria-checked={date === selected}
              aria-label={date}
              tabIndex={-1}
            />
          ))}
        </div>
      ) : (
        // 스트립이 없는 화면. 이 버튼도 **날짜가 바뀌면 사라진다** — 그래야 "돌아갈 곳이 아무것도
        // 없는" 상태가 `Dialog` 의 복귀 시점에 성립한다.
        selected === START_DATE && <button type="button">사라질 버튼</button>
      )}
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
  useDateStripStore.setState({ selectedDate: START_DATE, today: START_DATE });
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

  it('선택된 줄은 앱의 선택 언어(강조색 채움)를 쓴다 — 리뷰 Major 4', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openPalette(user);
    const [first, second] = screen.getAllByRole('option');
    // jsdom 은 Tailwind CSS 를 계산하지 않으므로 대비를 여기서 잴 수 없다(실제 수치는 실브라우저로
    // 재어 PR 본문에 적었다). 여기서 지키는 것은 "선택 행이 날짜 스트립과 **같은 토큰**으로
    // 칠해진다" 는 계약이다 — 회색 `bg-surface-2` 로 돌아가면(대비 1.11:1) 이 단언이 깨진다.
    expect(first).toHaveClass('bg-accent');
    expect(first).toHaveClass('text-on-accent');
    expect(second).not.toHaveClass('bg-accent');
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
    // 투두 가지에서도 팔레트는 닫힌다(§2 "실행 후 팔레트는 닫힌다"). 명령 가지와 달리 여기는
    // `closePalette()` 를 지워도 `highlightRow` 의 `focus()` 가 먹어서 포커스 단언만으로는 안 잡힌다.
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
    await waitFor(() =>
      expect(document.querySelector(`[data-flip-id="${TODO.id}"]`)).toHaveFocus(),
    );
    // "한때 포커스였다" 가 아니라 "가라앉은 뒤에도 포커스다" — 이 테스트의 이름이 주장하는 것이
    // 그것이다. 400ms 하이라이트가 걷히는 시점 너머까지 본다.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(document.querySelector(`[data-flip-id="${TODO.id}"]`)).toHaveFocus();
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

describe('CommandPalette — 여는 요소가 사라지는 명령 (R11)', () => {
  it('주를 옮겨 날짜 칸이 사라져도 포커스가 body 로 떨어지지 않고 새 선택 칸으로 간다', async () => {
    const user = userEvent.setup();
    render(<WeekHarness />);
    const opener = screen.getByRole('radio', { checked: true });
    opener.focus();
    await user.keyboard('{Control>}k{/Control}');
    await user.type(screen.getByRole('combobox'), '다음 주로');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());

    // 명령이 여는 요소를 언마운트시켰다 — 이 전제가 무너지면 이 테스트는 아무것도 재지 않는다.
    expect(opener.isConnected).toBe(false);
    expect(document.body).not.toHaveFocus();
    expect(screen.getByRole('radio', { checked: true })).toHaveFocus();
  });

  it('돌아갈 날짜 칸조차 없으면 본문(main)으로 간다 — body 로는 떨어지지 않는다', async () => {
    const user = userEvent.setup();
    render(<WeekHarness withStrip={false} />);
    const opener = screen.getByRole('button', { name: '사라질 버튼' });
    opener.focus();
    await user.keyboard('{Control>}k{/Control}');
    await user.type(screen.getByRole('combobox'), '다음 주로');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());

    expect(opener.isConnected).toBe(false);
    expect(document.body).not.toHaveFocus();
    expect(screen.getByRole('main')).toHaveFocus();
  });
});

describe('CommandPalette — 스펙 §5 가 문면으로 요구하는 마크업', () => {
  it('결과 수를 라이브 영역으로 알린다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openPalette(user);
    const live = screen.getByRole('status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent(`결과 ${screen.getAllByRole('option').length}개`);
  });

  it('목록은 listbox 다 — 항목의 role="option" 이 붙을 자리다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = await openPalette(user);
    const listbox = screen.getByRole('listbox');
    expect(input).toHaveAttribute('aria-controls', listbox.id);
    expect(within(listbox).getAllByRole('option').length).toBeGreaterThan(0);
  });
});

describe('CommandPalette — 응답 전 구간 (리뷰 Major 3)', () => {
  it('아직 답이 없는 질의에 "결과가 없어요" 라고 먼저 말하지 않는다', async () => {
    const user = userEvent.setup();
    let settle: (todos: Todo[]) => void = () => {};
    vi.spyOn(getRepositories().todos, 'search').mockImplementation(
      () =>
        new Promise<Todo[]>((resolve) => {
          settle = resolve;
        }),
    );
    render(<Harness />);
    const input = await openPalette(user);
    await user.type(input, '장보기'); // 명령과는 하나도 안 맞는 질의
    await waitFor(() => expect(getRepositories().todos.search).toHaveBeenCalled());

    expect(screen.queryByText(/결과가 없어요 — /)).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('');

    act(() => settle([]));
    await screen.findByText(/결과가 없어요 — /);
    expect(screen.getByRole('status')).toHaveTextContent('결과가 없어요');
  });

  it('글자를 더 쳐도 직전 결과가 남아 목록이 비었다 돌아오지 않는다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = await openPalette(user);
    await user.type(input, '장보기');
    await screen.findByRole('group', { name: '할 일 (1)' });

    const search = vi
      .spyOn(getRepositories().todos, 'search')
      .mockImplementation(() => new Promise(() => {}) as Promise<never>);
    await user.type(input, ' 하기');
    await waitFor(() => expect(search).toHaveBeenCalled());
    expect(screen.getByRole('group', { name: '할 일 (1)' })).toBeInTheDocument();
  });
});
