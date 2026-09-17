// 헤더의 **팔레트 입구** (T-36 · shortcuts §3-B · app-shell §2-B).
//
// 이 파일이 묻는 것은 "버튼이 있는가" 가 아니라 **"눌렀더니 팔레트가 실제로 열리는가"**, 그리고
// **"Mod+K 와 같은 경로인가"** 둘이다. 존재만 재면 `onClick` 을 떼어도 초록불이 남는다 —
// 이 레포에서 반복해서 난 사고가 정확히 그것이다(팔레트를 다 만들고 배선을 빠뜨린 T-19,
// 토스트 ✕ 를 만들고 배선을 빠뜨린 T-29).
//
// 배선은 셸이 실제로 하는 것 그대로다: `<CommandLayer palette={<CommandPalette/>}/>` 한 번
// (`ShellGlobals`) + 헤더 하나.
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';
import { adopt } from '@/domain/meta';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { CommandLayer, CommandPalette, useCommandStore } from '@/features/command';
import { useDateStripStore } from '@/features/date-strip';
import { ShellHeader } from '@/features/shell/components/ShellHeader';
import type { CompletionSummary } from '@/features/stats';
import { useTimerStore } from '@/features/timer';
import { useTodoStore } from '@/features/todo';
import { makeCategory } from '@/test/fixtures/category';

const TODAY = '2026-09-16' as DateKey;
const SUMMARY: CompletionSummary = { done: 3, total: 5, rate: 0.6, percent: 60 };
/** 입구의 접근 이름 — 좁은 폭에서도 같아야 한다(문구는 `sr-only` 로 내려갈 뿐 사라지지 않는다). */
const ENTRY_NAME = /할 일 검색 또는 명령/;

function Harness({ insightIsColumn = true }: { insightIsColumn?: boolean }) {
  return (
    <>
      <ShellHeader
        summary={SUMMARY}
        sidebarIsColumn
        insightIsColumn={insightIsColumn}
        insightOverlayOpen={false}
        onOpenDrawer={vi.fn()}
        onOpenInsight={vi.fn()}
        onSummaryError={vi.fn()}
        onDropTodo={vi.fn()}
      />
      <CommandLayer palette={<CommandPalette />} />
    </>
  );
}

beforeEach(async () => {
  const repositories = createMemoryRepositories();
  setRepositories(repositories);
  await repositories.categories.upsert(adopt(makeCategory({ seq: 1, name: '공부' })));
  useCommandStore.setState({
    shortcuts: [],
    commands: [],
    recentCommandIds: [],
    helpOpen: false,
    paletteOpen: false,
    commandError: null,
  });
  useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });
  useTodoStore.setState({ status: 'ready' });
  useTimerStore.setState({ session: null });
});

describe('ShellHeader — 팔레트 입구 (T-36)', () => {
  it('입구를 누르면 커맨드 팔레트가 실제로 열린다', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByRole('dialog', { name: '명령 팔레트' })).toBeNull();
    await user.click(screen.getByRole('button', { name: ENTRY_NAME }));

    expect(screen.getByRole('dialog', { name: '명령 팔레트' })).toBeInTheDocument();
    // 열린 팔레트의 입력칸에 포커스가 간다(R11) — 여는 경로가 달라도 이 뒤는 같은 화면이다.
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveFocus());
  });

  it('입구로 열고 Esc 로 닫으면 포커스가 입구로 돌아온다 (R11)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const entry = screen.getByRole('button', { name: ENTRY_NAME });

    await user.click(entry);
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveFocus());
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
    expect(entry).toHaveFocus();
  });

  it('입구와 Mod+K 는 같은 경로다 — 키로 열면 포커스는 키를 누른 자리로 돌아간다', async () => {
    const user = userEvent.setup();
    // 헤더의 **다른** 버튼에 포커스를 두고 키로 연다. 입구가 자기 자신을 복귀 대상으로
    // 끼워 넣었다면(포커스를 가로챘다면) 여기서 갈린다.
    render(<Harness insightIsColumn={false} />);
    const other = screen.getByRole('button', { name: '오늘 요약 열기' });
    other.focus();

    await user.keyboard('{Control>}k{/Control}');
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveFocus());
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
    expect(other).toHaveFocus();
  });

  it('입구는 키보드로 도달 가능하다 (Tab 순서에 있고 Enter 로 열린다)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const entry = screen.getByRole('button', { name: ENTRY_NAME });

    entry.focus();
    expect(entry).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('dialog', { name: '명령 팔레트' })).toBeInTheDocument();
  });

  it('인사이트 컬럼이 없는 좁은 폭에서도 입구는 그대로 있다', () => {
    // 1024px 이하에서 인사이트 컬럼(= `단축키 ?` 버튼이 있던 유일한 자리)이 사라지는 것이
    // T-36 의 발단이다. 그 갈래에서도 입구는 남는다.
    render(<Harness insightIsColumn={false} />);
    expect(screen.getByRole('button', { name: ENTRY_NAME })).toBeInTheDocument();
  });

  it('입구는 `Mod+K` 표기를 카탈로그에서 꺼내 곁들인다 (R3)', () => {
    render(<Harness />);
    const entry = screen.getByRole('button', { name: ENTRY_NAME });
    // jsdom 은 mac 이 아니므로 `Ctrl` 갈래다. 표기 자체는 `ShortcutKeys` 가 만든다.
    expect(entry).toHaveTextContent('Ctrl');
    expect(entry).toHaveTextContent('K');
  });
});
