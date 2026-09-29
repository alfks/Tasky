// 루틴 관리 화면 테스트 (routine.md §2·R7·R7-a·R10·R12-b).
//
// 액션은 T-81 이 이미 만든 `useTodoActions` 의 loadRoutines·pauseRoutine·resumeRoutine·removeRoutine
// 을 그대로 쓴다 — 여기서는 그 결과가 **화면에 정확히 반영되는지**(특히 R7-a: 종료일 있는 루틴은
// 메뉴에 중지·재개 항목 자체가 없다)와 포커스 관리만 본다.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';
import { adopt } from '@/domain/meta';
import type { Routine } from '@/domain/routine/routine';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { useDateStripStore } from '@/features/date-strip';
import { RoutineManager } from '@/features/todo/components/RoutineManager';
import { useTodoStore } from '@/features/todo/store/todo-store';
import { makeCategory } from '@/test/fixtures/category';
import { FIXTURE_DATE } from '@/test/fixtures/deps';
import { makeRoutine } from '@/test/fixtures/routine';

import { focusAfterRowRemoval, rowAnchorOf } from '@/lib/focus-fallback';
import type { RowAnchor } from '@/lib/focus-fallback';

const 운동 = makeCategory({ seq: 1, name: '운동', emoji: '🏃', order: 0 });

/**
 * `ShellSidebar` 가 실제로 거는 것과 같은 배선(`useRemovalReturnFocus`) — 여기서는 컴포넌트 훅
 * 없이 같은 순수 함수 두 개로 재현한다(`import/no-restricted-paths` 는 테스트 파일에서 꺼져 있다,
 * code-style §11). 셸을 통째로 마운트하지 않고도 app-shell R14 를 실제로 검증한다.
 */
function makeRemovalFocus() {
  let anchor: RowAnchor | null = null;
  return {
    capture: () => {
      anchor = rowAnchorOf(document.activeElement);
    },
    returnFocus: () => focusAfterRowRemoval(anchor),
  };
}

/** 저장소·스토어를 매 테스트 초기화한다(컴포넌트는 싱글턴 `useTodoStore` 를 쓴다). */
beforeEach(() => {
  setRepositories(createMemoryRepositories());
  useTodoStore.setState({
    byId: {},
    date: null,
    status: 'idle',
    error: null,
    writeRevision: 0,
    routines: {},
    routineStatus: 'idle',
  });
  useDateStripStore.setState({ selectedDate: FIXTURE_DATE, today: FIXTURE_DATE, view: 'week' });
});

async function seedRoutines(...inputs: Array<Partial<Routine> & { seq?: number }>) {
  const routines = inputs.map((input, index) => makeRoutine({ seq: index + 1, ...input }));
  await Promise.all(routines.map((routine) => getRepositories().routines.upsert(adopt(routine))));
  return routines;
}

/**
 * 다이얼로그를 연다 — 열릴 때마다 `loadRoutines()` 가 저장소를 다시 읽는다. 본문(`RoutineManagerDialog`)
 * 은 별도 파일이지만 정적 import 다(`RoutineManager.tsx` 머리 주석) — `findBy` 는 적재 대기용이다.
 */
async function openManager(
  categories = [운동],
  removalFocus?: ReturnType<typeof makeRemovalFocus>,
) {
  const user = userEvent.setup();
  render(
    <RoutineManager
      categories={categories}
      captureRemovalFocus={removalFocus?.capture}
      removalReturnFocus={removalFocus?.returnFocus}
    />,
  );
  await user.click(screen.getByRole('button', { name: '루틴' }));
  await screen.findByRole('dialog', { name: '루틴' });
  // 목록 적재까지 기다린다 — 스켈레톤(`aria-busy`)이 사라진 뒤에야 행·빈 상태 문구가 있다.
  await waitFor(() => expect(screen.queryByRole('button', { name: '+ 루틴 추가' })).not.toBeNull());
  return user;
}

describe('빈 상태 (routine.md §2 상태)', () => {
  it('무기한 루틴이 없으면 빈 상태 문구를 보여준다', async () => {
    await openManager();
    expect(screen.getByText('아직 계속 반복되는 루틴이 없어요')).toBeInTheDocument();
  });

  it('종료일 있는 기록만 있어도 빈 상태 문구가 뜨고, 그 기록은 목록에 같이 보인다', async () => {
    await seedRoutines({ title: '독서', endDate: '2026-10-04' as DateKey });
    await openManager();

    expect(screen.getByText('아직 계속 반복되는 루틴이 없어요')).toBeInTheDocument();
    expect(screen.getByText('독서')).toBeInTheDocument();
    expect(screen.getByText('매주 목 · ~10/4')).toBeInTheDocument();
  });
});

describe('R7-a: 종료일 있는 루틴은 ⋯ 메뉴에 중지·재개가 없다', () => {
  it('삭제만 있고, 중지·재개 항목 자체가 없다(비활성화가 아니라 부재)', async () => {
    await seedRoutines({ title: '독서', endDate: '2026-10-04' as DateKey });
    const user = await openManager();

    await user.click(screen.getByRole('button', { name: '독서 루틴 메뉴' }));
    const menu = screen.getByRole('menu', { name: '독서 루틴 메뉴' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['삭제']);
    expect(within(menu).queryByRole('menuitem', { name: '중지' })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: '재개' })).not.toBeInTheDocument();
  });
});

describe('중지 → 재개 (R7, 소급 없음은 도메인 테스트가 고정 — 여기서는 화면 반영만 본다)', () => {
  it('활성 무기한 루틴은 중지·삭제만 있고, 중지하면 메뉴가 재개·삭제로 바뀐다', async () => {
    await seedRoutines({ title: '운동' });
    const user = await openManager();

    await user.click(screen.getByRole('button', { name: '운동 루틴 메뉴' }));
    let menu = screen.getByRole('menu', { name: '운동 루틴 메뉴' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['중지', '삭제']);
    expect(screen.getByText('매주 목 · 계속')).toBeInTheDocument();

    await user.click(within(menu).getByRole('menuitem', { name: '중지' }));
    await waitFor(() => expect(screen.getByText('매주 목 · 중지됨')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: '운동 루틴 메뉴' }));
    menu = screen.getByRole('menu', { name: '운동 루틴 메뉴' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['재개', '삭제']);

    await user.click(within(menu).getByRole('menuitem', { name: '재개' }));
    await waitFor(() => expect(screen.getByText('매주 목 · 계속')).toBeInTheDocument());
  });
});

describe('삭제 (R10) + 포커스 (app-shell R14, ShellSidebar 의 useRemovalReturnFocus 배선 재현)', () => {
  it('삭제하면 행이 사라지고, 포커스는 남은 형제 행으로 옮겨간다', async () => {
    await seedRoutines({ title: '운동' }, { title: '독서', endDate: '2026-10-04' as DateKey });
    const removalFocus = makeRemovalFocus();
    const user = await openManager([운동], removalFocus);

    await user.click(screen.getByRole('button', { name: '독서 루틴 메뉴' }));
    await user.click(screen.getByRole('menuitem', { name: '삭제' }));

    await waitFor(() => expect(screen.queryByText('독서')).not.toBeInTheDocument());
    expect(screen.getByText('운동')).toBeInTheDocument();
    // 포커스가 `<body>` 로 떨어지지 않는다(app-shell R14) — 남은 형제 행(운동)의 첫 컨트롤로 옮겨간다.
    // 행이 손잡이(R13)로 시작하므로 그 손잡이다(`focusAfterRowRemoval` 은 행의 첫 포커스 가능 요소를
    // 고른다 — 카테고리 사이드바 행과 같은 결과).
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '운동 순서 변경 (Alt+위/아래)' })).toHaveFocus(),
    );
  });

  it('마지막 루틴을 지워도 포커스가 body 로 떨어지지 않고 목록 컨테이너로 옮겨간다', async () => {
    await seedRoutines({ title: '운동' });
    const removalFocus = makeRemovalFocus();
    const user = await openManager([운동], removalFocus);

    await user.click(screen.getByRole('button', { name: '운동 루틴 메뉴' }));
    await user.click(screen.getByRole('menuitem', { name: '삭제' }));

    await waitFor(() => expect(screen.queryByText('운동')).not.toBeInTheDocument());
    await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
      expect(document.body.contains(document.activeElement)).toBe(true);
    });
  });
});

describe('+ 루틴 추가 (R12-b, 두 번째 진입점)', () => {
  it('T-82 의 RoutineDialog 를 항목 없이(빈 제목·오늘 하루·첫 카테고리) 연다', async () => {
    const user = await openManager();

    await user.click(screen.getByRole('button', { name: '+ 루틴 추가' }));

    const dialog = await screen.findByRole('dialog', { name: '루틴 등록' });
    expect(within(dialog).getByLabelText('제목')).toHaveValue('');
    expect(within(dialog).getByLabelText('메모')).toHaveValue('');
    expect(within(dialog).getByLabelText('카테고리')).toHaveValue(운동.id);
    expect(within(dialog).getByLabelText('시작일')).toHaveValue(FIXTURE_DATE);
  });

  it('카테고리가 하나도 없으면 추가 버튼이 비활성이다', async () => {
    await openManager([]);
    expect(screen.getByRole('button', { name: '+ 루틴 추가' })).toBeDisabled();
  });
});

describe('키보드만으로: 진입 → 중지 → 재개 → 삭제', () => {
  it('탭으로 열고, 메뉴를 키보드로 조작해 중지·재개·삭제까지 마친다', async () => {
    await seedRoutines({ title: '운동' });
    const removalFocus = makeRemovalFocus();
    const user = userEvent.setup();
    render(
      <RoutineManager
        categories={[운동]}
        captureRemovalFocus={removalFocus.capture}
        removalReturnFocus={removalFocus.returnFocus}
      />,
    );

    await user.tab();
    expect(screen.getByRole('button', { name: '루틴' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await screen.findByRole('dialog', { name: '루틴' });

    const menuButton = await screen.findByRole('button', { name: '운동 루틴 메뉴' });
    menuButton.focus();
    // `Menu` 는 열리며 첫 항목에 포커스한다(autoFocus 기본값) — 활성 루틴의 첫 항목은 "중지".
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getByRole('menu', { name: '운동 루틴 메뉴' })).toBeInTheDocument(),
    );
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByText('매주 목 · 중지됨')).toBeInTheDocument());
    // 메뉴를 선택하면 포커스는 다시 `⋯` 버튼으로 돌아온다(Popover 의 앵커 복귀) — 클릭 없이 이어간다.
    expect(screen.getByRole('button', { name: '운동 루틴 메뉴' })).toHaveFocus();

    // 재개도 이제 첫 항목이다(항목이 '재개'·'삭제'로 바뀌었다).
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getByRole('menu', { name: '운동 루틴 메뉴' })).toBeInTheDocument(),
    );
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByText('매주 목 · 계속')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '운동 루틴 메뉴' })).toHaveFocus();

    // 삭제는 둘째 항목('중지' 다음)이라 한 번 내려간다.
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getByRole('menu', { name: '운동 루틴 메뉴' })).toBeInTheDocument(),
    );
    await user.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(screen.queryByText('운동')).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).not.toBe(document.body));
  });
});
