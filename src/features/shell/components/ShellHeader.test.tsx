// 헤더의 **팔레트 입구** (T-36 · shortcuts §3-B · app-shell §2-B).
//
// 이 파일이 묻는 것은 "버튼이 있는가" 가 아니라 **"눌렀더니 팔레트가 실제로 열리는가"**, 그리고
// **"Mod+K 와 같은 경로인가"** 둘이다. 존재만 재면 `onClick` 을 떼어도 초록불이 남는다 —
// 이 레포에서 반복해서 난 사고가 정확히 그것이다(팔레트를 다 만들고 배선을 빠뜨린 T-19,
// 토스트 ✕ 를 만들고 배선을 빠뜨린 T-29).
//
// 배선은 셸이 실제로 하는 것 그대로다: `<CommandLayer palette={<CommandPalette/>}/>` 한 번
// (`ShellGlobals`) + 헤더 하나.
//
// 아래쪽 T-56 절도 같은 질문을 한다: **"쓰기 뒤에 날짜 셀이 실제로 다시 읽히는가"**. 그 배선이
// 여기 있는 이유는 `date-strip` 이 feature 그래프의 리프라 `todo`·`backup` 을 스스로 구독할 수 없고
// (`import/no-cycle`) 셸이 세 화살표를 모두 가진 유일한 합성 지점이기 때문이다.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addCivilDays, dayOfWeekOf } from '@/domain/date/civil';
import type { DateKey } from '@/domain/date/date-key';
import { adopt } from '@/domain/meta';
import type { Routine } from '@/domain/routine/routine';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { useBackupStore } from '@/features/backup';
import { CommandLayer, CommandPalette, useCommandStore } from '@/features/command';
import { useDateStripStore } from '@/features/date-strip';
import { ShellHeader } from '@/features/shell/components/ShellHeader';
import type { CompletionSummary } from '@/features/stats';
import { useTimerStore } from '@/features/timer';
import { useTodoStore } from '@/features/todo';
import { makeCategory } from '@/test/fixtures/category';
import { fixtureId, FIXTURE_INSTANT } from '@/test/fixtures/deps';
import { FIXTURE_CATEGORY_ID, makeTodo } from '@/test/fixtures/todo';

const TODAY = '2026-09-16' as DateKey;
const SUMMARY: CompletionSummary = { done: 3, total: 5, rate: 0.6, percent: 60 };
/** 입구의 접근 이름 — 좁은 폭에서도 같아야 한다(문구는 `sr-only` 로 내려갈 뿐 사라지지 않는다). */
const ENTRY_NAME = /할 일 검색 또는 명령/;

function Harness({
  insightIsColumn = true,
  dayPanelVisible = false,
}: {
  insightIsColumn?: boolean;
  dayPanelVisible?: boolean;
}) {
  return (
    <>
      <ShellHeader
        summary={SUMMARY}
        sidebarIsColumn
        insightIsColumn={insightIsColumn}
        dayPanelVisible={dayPanelVisible}
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
  useTodoStore.setState({
    byId: {},
    date: null,
    status: 'ready',
    error: null,
    writeRevision: 0,
    routines: {},
    routineStatus: 'idle',
    visibleRange: null,
  });
  useBackupStore.setState({ dataRevision: 0 });
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

describe('ShellHeader — 쓰기 뒤에 주 요약이 다시 읽힌다 (T-56)', () => {
  /**
   * 그날 셀의 접근 이름. 점·✓ 는 `aria-hidden` 이라 **낭독되는 요약은 이 문자열이 전부**이고
   * (date-strip §5), T-45 가 낡은 값을 관측한 자리도 정확히 여기다.
   */
  const cellName = (): string | null =>
    screen.getByRole('radio', { name: /^9월 16일/ }).getAttribute('aria-label');

  it('투두를 체크하면 **같은 화면에서** 날짜 셀 접근성 이름이 따라 바뀐다', async () => {
    const todo = makeTodo({ seq: 1, date: TODAY });
    await getRepositories().todos.upsert(adopt(todo));
    render(<Harness />);
    await act(async () => {
      await useTodoStore.getState().loadDate(TODAY);
    });

    // BEFORE — 적재만으로는 여기까지다. 다시 마운트하지 않고 이 문자열이 바뀌는지를 본다.
    await waitFor(() => expect(cellName()).toContain('할 일 1개 중 0개 완료'));
    const before = cellName();

    await act(async () => {
      await useTodoStore.getState().toggleDone(todo.id, true);
    });

    // AFTER — 같은 마운트, 같은 노드. 쓰기 revision 이 없으면 여기서 BEFORE 가 그대로 남는다.
    await waitFor(() => expect(cellName()).toContain('할 일 1개 중 1개 완료'));
    expect(cellName()).not.toBe(before);
  });

  it('투두를 추가하면 **같은 화면에서** 날짜 셀 접근성 이름이 따라 바뀐다', async () => {
    render(<Harness />);
    await act(async () => {
      await useTodoStore.getState().loadDate(TODAY);
    });
    await waitFor(() => expect(cellName()).toBe('9월 16일 수요일, 오늘'));
    const before = cellName();

    await act(async () => {
      await useTodoStore.getState().addTodo({ categoryId: FIXTURE_CATEGORY_ID, title: '운동' });
    });

    await waitFor(() => expect(cellName()).toContain('할 일 1개 중 0개 완료'));
    expect(cellName()).not.toBe(before);
  });

  it('실패해 되돌아간 쓰기는 요약을 건드리지 않는다 — 낡은 값으로 덮이지 않는다', async () => {
    // 저장이 깨진 저장소. 낙관적 토글은 화면에 먼저 반영됐다가 되돌아간다(R6).
    const base = createMemoryRepositories();
    const todo = makeTodo({ seq: 1, date: TODAY });
    await base.categories.upsert(adopt(makeCategory({ seq: 1 })));
    await base.todos.upsert(adopt(todo));
    setRepositories({
      ...base,
      todos: { ...base.todos, upsert: () => Promise.reject(new Error('저장 실패')) },
    });
    render(<Harness />);
    await act(async () => {
      await useTodoStore.getState().loadDate(TODAY);
    });
    await waitFor(() => expect(cellName()).toContain('할 일 1개 중 0개 완료'));

    await act(async () => {
      await useTodoStore.getState().toggleDone(todo.id, true);
    });

    // 저장소는 변하지 않았으니 요약도 변하지 않는다. revision 도 올라가지 않았다.
    expect(cellName()).toContain('할 일 1개 중 0개 완료');
    expect(useTodoStore.getState().writeRevision).toBe(0);
  });

  it('가져오기로 저장소가 통째로 바뀌면 **같은 화면에서** 요약이 따라 바뀐다', async () => {
    render(<Harness />);
    await waitFor(() => expect(cellName()).toBe('9월 16일 수요일, 오늘'));
    const before = cellName();

    // `runImport` 성공이 하는 것 그대로: 저장소를 바꾸고 `dataRevision` 을 +1 한다
    // (`backup-actions.ts` — `restore` 뒤 `dataRevision: ctx.get().dataRevision + 1`).
    await getRepositories().todos.upsert(adopt(makeTodo({ seq: 1, date: TODAY })));
    act(() => {
      useBackupStore.setState({ dataRevision: useBackupStore.getState().dataRevision + 1 });
    });

    await waitFor(() => expect(cellName()).toContain('할 일 1개 중 0개 완료'));
    expect(cellName()).not.toBe(before);
  });
});

describe('ShellHeader — 무기한 루틴 지연 생성 배선 (routine.md R6)', () => {
  const cellName = (): string | null =>
    screen.getByRole('radio', { name: /^9월 16일/ }).getAttribute('aria-label');

  function makeRoutine(overrides: Partial<Routine> = {}): Routine {
    return {
      id: fixtureId('generated', 900),
      createdAt: FIXTURE_INSTANT,
      updatedAt: FIXTURE_INSTANT,
      rev: 1,
      title: '아침 운동',
      categoryId: FIXTURE_CATEGORY_ID,
      recurrence: { type: 'weekly', daysOfWeek: [dayOfWeekOf(TODAY)] },
      startDate: TODAY,
      active: true,
      fillFloor: addCivilDays(TODAY, -1),
      ...overrides,
    };
  }

  it('날짜 스트립이 보이는 범위를 열면(마운트) 그 안의 무기한 루틴을 조용히 채운다', async () => {
    await getRepositories().routines.upsert(adopt(makeRoutine()));

    render(<Harness />);
    await act(async () => {
      await useTodoStore.getState().loadDate(TODAY);
    });

    // 토스트 없이(routine.md R6) 그 날짜 셀에 인스턴스가 뜬다 — DateStrip 이 `todo` 를 스스로
    // 구독할 수 없어 셸이 콜백으로 이었다는 배선 자체를 이 결과로 확인한다.
    await waitFor(() => expect(cellName()).toContain('할 일 1개 중 0개 완료'));
  });

  it('중지된 루틴은 채우지 않는다(R7) — 이 배선을 타도 성립한다', async () => {
    const routine = makeRoutine({ active: false });
    await getRepositories().routines.upsert(adopt(routine));

    render(<Harness />);
    await act(async () => {
      await useTodoStore.getState().loadDate(TODAY);
    });
    // 지연 생성 배선(마운트 효과)이 저장소를 다녀올 시간을 확보한 **뒤**에 "안 바뀌었다"를 본다 —
    // 그냥 바로 단언하면 아직 안 끝났을 뿐인데 통과하는 거짓 초록불이 난다.
    await waitFor(() => expect(useTodoStore.getState().routines[routine.id]).toBeDefined());

    expect(cellName()).toBe('9월 16일 수요일, 오늘');
  });

  it('백업 가져오기(dataRevision 만 오름) 뒤 같은 범위를 다시 열면 새로 생긴 루틴을 채운다(리뷰 m2)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await act(async () => {
      await useTodoStore.getState().loadDate(TODAY);
    });
    // 아직 루틴이 없다 — 이 방문에서 캐시가 세팅된다.
    await waitFor(() => expect(cellName()).toBe('9월 16일 수요일, 오늘'), { timeout: 2000 });

    // 가져오기가 저장소에 직접 쓴다(todo 스토어의 쓰기 큐를 거치지 않아 writeRevision 은 그대로다)
    // + `runImport` 이 하는 것 그대로 `dataRevision` 만 올린다.
    await getRepositories().routines.upsert(adopt(makeRoutine()));
    act(() => {
      useBackupStore.setState({ dataRevision: useBackupStore.getState().dataRevision + 1 });
    });

    // 같은 범위를 다시 연다(갔다 돌아온다) — writeRevision 은 안 올랐지만 셸이 넘기는 revision
    // (summaryRevision = writeRevision + dataRevision)이 바뀌어 캐시가 깨진다.
    await user.click(screen.getByRole('button', { name: '다음 주' }));
    await user.click(screen.getByRole('button', { name: '이전 주' }));

    await waitFor(() => expect(cellName()).toContain('할 일 1개 중 0개 완료'), { timeout: 2000 });
  });
});

describe('달성률 열기 버튼의 링 중복 방지 (calendar-layout.md R5 · 리뷰 Minor)', () => {
  it('3영역이지만 인사이트를 접었으면(패널 머리에 이미 링이 있다) 이 버튼은 링 없이 텍스트만이다', () => {
    render(<Harness insightIsColumn={false} dayPanelVisible />);
    const opener = screen.getByRole('button', { name: '오늘 요약 열기' });
    expect(within(opener).queryByRole('img')).toBeNull();
    expect(opener).toHaveTextContent('오늘 요약');
  });

  it('1열(패널이 아예 없는 폭)에서는 원래대로 링 + 퍼센트다', () => {
    render(<Harness insightIsColumn={false} dayPanelVisible={false} />);
    const opener = screen.getByRole('button', { name: '오늘 요약 열기' });
    expect(within(opener).getByRole('img')).toBeInTheDocument();
    expect(opener).toHaveTextContent('60%');
  });
});

describe('프로필 슬롯 (profile.md §2 · app-shell §2-A)', () => {
  it('profile 은 상단 줄(팔레트 입구) 뒤·날짜 스트립 앞에 온다', () => {
    render(
      <ShellHeader
        summary={SUMMARY}
        profile={<p>프로필 슬롯</p>}
        sidebarIsColumn
        insightIsColumn
        dayPanelVisible={false}
        insightOverlayOpen={false}
        onOpenDrawer={vi.fn()}
        onOpenInsight={vi.fn()}
        onSummaryError={vi.fn()}
        onDropTodo={vi.fn()}
      />,
    );
    const entry = screen.getByRole('button', { name: ENTRY_NAME });
    const slot = screen.getByText('프로필 슬롯');
    const strip = screen.getByLabelText('날짜 선택');
    const FOLLOWS = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(entry.compareDocumentPosition(slot) & FOLLOWS).toBeTruthy();
    expect(slot.compareDocumentPosition(strip) & FOLLOWS).toBeTruthy();
  });

  it('profile 을 넘기지 않으면 슬롯 자체가 없다', () => {
    render(<Harness />);
    expect(screen.queryByText('프로필 슬롯')).toBeNull();
    expect(screen.getByLabelText('날짜 선택')).toBeInTheDocument();
  });
});
