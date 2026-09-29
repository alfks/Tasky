// 사이드바 진입점 배선 테스트 (app-shell.md §2-A, routine.md §2 — T-83).
//
// `CategoryList`·`RoutineManager` 자체 동작은 각 feature 의 테스트가 이미 본다. 여기서 묻는 것은
// 셸이 "루틴" 진입점을 실제로 올렸고, 그 다이얼로그가 필요로 하는 `categories` 를 받았는가뿐이다.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';
import { adopt } from '@/domain/meta';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { useDateStripStore } from '@/features/date-strip';
import { useDiaryStore } from '@/features/diary';
import { useProfileStore } from '@/features/profile';
import { ShellSidebar } from '@/features/shell/components/ShellSidebar';
import { useShellUiStore } from '@/features/shell/store/shell-ui-store';
import { useSyncStore } from '@/features/sync';
import { useTodoStore } from '@/features/todo';
import { makeCategory } from '@/test/fixtures/category';
import { makeRoutine } from '@/test/fixtures/routine';

import {
  ToastViewport,
  clearToasts,
  dismissToast,
  pushToast,
  useToasts,
} from '@/components/ui/Toast';

const 운동 = makeCategory({ seq: 1, name: '운동', order: 0 });
const TODAY = '2026-09-17' as DateKey;
const PAST = '2026-09-10' as DateKey;

/** 계정 블록이 요구하는 prop — 이 파일의 관심사(루틴 진입점)와 무관하므로 항상 같은 대역을 준다. */
const exportBackup = () => Promise.resolve(true);

/** `ShellToasts`(app-shell R8 전역 허브)를 축약한 것 — 실제 토스트 DOM 을 만든다. */
function ToastHost() {
  return <ToastViewport toasts={useToasts()} onClose={dismissToast} />;
}

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });
  // 오늘의 기록 카드가 이 안에 서서 마운트마다 `load(date)` 를 부른다 — 스토어는 모듈 전역이라
  // 앞 테스트의 기록이 남으면 다음 테스트가 "작성됨" 상태로 시작한다.
  useDiaryStore.setState({
    date: null,
    entry: undefined,
    status: 'idle',
    error: null,
    pendingRemoval: null,
  });
  useTodoStore.setState({
    byId: {},
    date: null,
    status: 'idle',
    error: null,
    writeRevision: 0,
    routines: {},
    routineStatus: 'idle',
  });
  useShellUiStore.setState({
    sidebarPinned: false,
    insightCollapsed: false,
    drawerOpen: false,
    insightOverlayOpen: false,
  });
  clearToasts();
  window.localStorage.clear();
  useProfileStore.setState({
    name: undefined,
    bio: undefined,
    avatar: undefined,
    status: 'idle',
    hydrated: false,
  });
  useSyncStore.setState({ email: 'millie@example.com' });
});

describe('프로필 카드 (profile.md §2, app-shell §2-A 순서)', () => {
  it('nav "사이드바" 의 첫 카드가 region "프로필" 이고 이름 폴백은 동기화 스토어의 이메일 앞부분이다', async () => {
    render(
      <ShellSidebar
        showTitle
        sidebarPinned={false}
        onTogglePinned={vi.fn()}
        categories={[운동]}
        onSelectCategory={vi.fn()}
        onRemoveCategory={vi.fn()}
        exportBackup={exportBackup}
      />,
    );
    const nav = screen.getByRole('navigation', { name: '사이드바' });
    const regions = within(nav).getAllByRole('region');
    expect(regions[0]).toHaveAccessibleName('프로필');
    expect(regions[1]).toHaveAccessibleName('카테고리');
    expect(await within(regions[0]!).findByText('millie')).toBeInTheDocument();
    expect(within(regions[0]!).getByRole('button', { name: '프로필 편집' })).toBeInTheDocument();
  });
});

describe('"루틴" 진입점', () => {
  it('도구 줄에 있고, 누르면 관리 다이얼로그가 열린다', async () => {
    const user = userEvent.setup();
    render(
      <ShellSidebar
        showTitle
        sidebarPinned={false}
        onTogglePinned={vi.fn()}
        categories={[운동]}
        onSelectCategory={vi.fn()}
        onRemoveCategory={vi.fn()}
        exportBackup={exportBackup}
      />,
    );

    await user.click(screen.getByRole('button', { name: '루틴' }));
    expect(await screen.findByRole('dialog', { name: '루틴' })).toBeInTheDocument();
  });

  it('셸이 넘긴 categories 로 기존 루틴의 카테고리를 그대로 보여준다', async () => {
    await getRepositories().routines.upsert(adopt(makeRoutine({ title: '운동하기' })));
    const user = userEvent.setup();
    render(
      <ShellSidebar
        showTitle
        sidebarPinned={false}
        onTogglePinned={vi.fn()}
        categories={[운동]}
        onSelectCategory={vi.fn()}
        onRemoveCategory={vi.fn()}
        exportBackup={exportBackup}
      />,
    );

    await user.click(screen.getByRole('button', { name: '루틴' }));
    await waitFor(() => expect(screen.getByText('운동하기')).toBeInTheDocument());
    // 카테고리 이모지(없음) 대신 이름이 정상적으로 붙어 있다는 것은 `categories` prop 이 실제로
    // `RoutineManager` 까지 닿았다는 뜻이다("+ 루틴 추가" 도 비활성이 아니어야 한다).
    expect(screen.getByRole('button', { name: '+ 루틴 추가' })).toBeEnabled();
  });

  it(
    '무관한 토스트가 떠 있어도 루틴 삭제 포커스를 가로채지 않는다 ' +
      '(리뷰 #104 Major — preferToast: false)',
    async () => {
      await getRepositories().routines.upsert(adopt(makeRoutine({ title: '운동하기' })));
      const user = userEvent.setup();
      render(<ToastHost />);
      render(
        <ShellSidebar
          showTitle
          sidebarPinned={false}
          onTogglePinned={vi.fn()}
          categories={[운동]}
          onSelectCategory={vi.fn()}
          onRemoveCategory={vi.fn()}
          exportBackup={exportBackup}
        />,
      );

      // 이 삭제와 **무관한** 되돌리기 토스트(예: 방금 만든 루틴의 등록 성공)가 떠 있다.
      pushToast({
        message: '3개의 할 일을 만들었어요',
        action: { label: '되돌리기', onAction: vi.fn() },
      });
      const undoButton = await screen.findByRole('button', { name: '되돌리기' });

      await user.click(screen.getByRole('button', { name: '루틴' }));
      await waitFor(() => expect(screen.getByText('운동하기')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: '운동하기 루틴 메뉴' }));
      await user.click(screen.getByRole('menuitem', { name: '삭제' }));

      await waitFor(() => expect(screen.queryByText('운동하기')).not.toBeInTheDocument());
      // 포커스가 무관한 토스트로 튀지 않는다 — 튀었다면 거기서 Enter 가 루틴 삭제가 아니라
      // 그 등록을 되돌린다(파괴적, 리뷰 #104 Major 실측).
      await waitFor(() => expect(undoButton).not.toHaveFocus());
      expect(document.activeElement).not.toBe(document.body);
    },
  );
});

describe('D-day (사용자 결정 — 카테고리쪽 사이드바로 옮겨옴)', () => {
  it('카테고리 목록 아래, 도구 줄 위에 D-day 섹션이 있다', () => {
    render(
      <ShellSidebar
        showTitle
        sidebarPinned={false}
        onTogglePinned={vi.fn()}
        categories={[운동]}
        onSelectCategory={vi.fn()}
        onRemoveCategory={vi.fn()}
        exportBackup={exportBackup}
      />,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'D-day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ D-day 추가' })).toBeInTheDocument();
  });
});

describe('오늘의 기록 (diary.md §2 · app-shell R6-b — 사용자 결정으로 선택 날짜 패널에서 옮겨옴)', () => {
  /** 문서 순서 비교 — `a` 가 `b` 보다 앞에 있으면 참. */
  const precedes = (a: Element, b: Element): boolean =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it('D-day 아래, 도구 줄 위에 있다 — nav 안 순서: 카테고리 → D-day → 오늘의 기록 → 도구 → 계정', async () => {
    render(
      <ShellSidebar
        showTitle
        framed
        sidebarPinned={false}
        onTogglePinned={vi.fn()}
        categories={[운동]}
        onSelectCategory={vi.fn()}
        onRemoveCategory={vi.fn()}
        exportBackup={exportBackup}
      />,
    );
    const diary = screen.getByRole('region', { name: '오늘의 기록' });
    expect(await within(diary).findByRole('button', { name: '+ 기록하기' })).toBeInTheDocument();

    const categories = screen.getByRole('heading', { level: 2, name: '카테고리' });
    const dday = screen.getByRole('heading', { level: 2, name: 'D-day' });
    const tools = screen.getByRole('button', { name: '루틴' });
    expect(precedes(categories, dday)).toBe(true);
    expect(precedes(dday, diary)).toBe(true);
    expect(precedes(diary, tools)).toBe(true);
  });

  it('컬럼(framed)에서는 카드 껍질을 스스로 그리고, 드로어(framed 아님)에서는 벗는다 (R18)', () => {
    const props = {
      showTitle: false,
      sidebarPinned: false,
      onTogglePinned: vi.fn(),
      categories: [운동],
      onSelectCategory: vi.fn(),
      onRemoveCategory: vi.fn(),
      exportBackup,
    };
    const { unmount } = render(<ShellSidebar {...props} framed />);
    expect(screen.getByRole('region', { name: '오늘의 기록' })).toHaveClass('border');
    unmount();

    render(<ShellSidebar {...props} framed={false} />);
    expect(screen.getByRole('region', { name: '오늘의 기록' })).not.toHaveClass('border');
  });

  it('선택 날짜가 오늘이 아니면 제목 아래에 그 날짜를 적고, 오늘이면 적지 않는다', async () => {
    useDateStripStore.setState({ selectedDate: PAST, today: TODAY });
    const { unmount } = render(
      <ShellSidebar
        showTitle
        sidebarPinned={false}
        onTogglePinned={vi.fn()}
        categories={[운동]}
        onSelectCategory={vi.fn()}
        onRemoveCategory={vi.fn()}
        exportBackup={exportBackup}
      />,
    );
    const past = screen.getByRole('region', { name: '오늘의 기록' });
    expect(await within(past).findByText('9월 10일 (목)')).toBeInTheDocument();
    // 접근 이름은 날짜와 무관하게 고정이다 — e2e·단축키 도움말이 이 이름으로 찾는다.
    expect(past).toHaveAccessibleName('오늘의 기록');
    unmount();

    useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });
    render(
      <ShellSidebar
        showTitle
        sidebarPinned={false}
        onTogglePinned={vi.fn()}
        categories={[운동]}
        onSelectCategory={vi.fn()}
        onRemoveCategory={vi.fn()}
        exportBackup={exportBackup}
      />,
    );
    const today = screen.getByRole('region', { name: '오늘의 기록' });
    await within(today).findByRole('button', { name: '+ 기록하기' });
    expect(within(today).queryByText(/\d+월 \d+일/)).not.toBeInTheDocument();
  });
});

describe('사이드바 고정 토글 (calendar-layout.md §1-A · R23~R24, 리뷰 Major 2·4)', () => {
  it('showTitle·showPinToggle 둘 다 아니면(드로어인데 wide 도 아닐 때) 렌더되지 않는다', () => {
    render(
      <ShellSidebar
        showTitle={false}
        sidebarPinned={false}
        onTogglePinned={vi.fn()}
        categories={[운동]}
        onSelectCategory={vi.fn()}
        onRemoveCategory={vi.fn()}
        exportBackup={exportBackup}
      />,
    );
    expect(screen.queryByRole('button', { name: /사이드바 고정/ })).not.toBeInTheDocument();
  });

  it('showPinToggle 이면 showTitle 이 아니어도(드로어 본문 첫 줄) 뜬다 — 제목 없이 버튼만', () => {
    render(
      <ShellSidebar
        showTitle={false}
        showPinToggle
        sidebarPinned={false}
        onTogglePinned={vi.fn()}
        categories={[운동]}
        onSelectCategory={vi.fn()}
        onRemoveCategory={vi.fn()}
        exportBackup={exportBackup}
      />,
    );
    expect(screen.getByRole('button', { name: '사이드바 고정' })).toBeInTheDocument();
    // 제목은 드로어(Dialog)가 갖는다 — 여기서는 h1 을 그리지 않는다(문서에 h1 은 하나여야 한다).
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('고정돼 있지 않으면 "사이드바 고정" 이다 — aria-pressed 는 쓰지 않는다(리뷰 Major)', () => {
    render(
      <ShellSidebar
        showTitle
        sidebarPinned={false}
        onTogglePinned={vi.fn()}
        categories={[운동]}
        onSelectCategory={vi.fn()}
        onRemoveCategory={vi.fn()}
        exportBackup={exportBackup}
      />,
    );
    const toggle = screen.getByRole('button', { name: '사이드바 고정' });
    // 글자가 이미 상태와 목적지를 함께 말한다(DateStripHeader 의 주/월 보기 토글과 같은 이유) —
    // `aria-pressed` 를 더하면 같은 상태가 두 번 낭독된다.
    expect(toggle).not.toHaveAttribute('aria-pressed');
  });

  it('고정돼 있으면 "사이드바 고정 해제" 이고, 누르면 넘겨받은 콜백을 그대로 부른다', async () => {
    const onTogglePinned = vi.fn();
    const user = userEvent.setup();
    render(
      <ShellSidebar
        showTitle
        sidebarPinned
        onTogglePinned={onTogglePinned}
        categories={[운동]}
        onSelectCategory={vi.fn()}
        onRemoveCategory={vi.fn()}
        exportBackup={exportBackup}
      />,
    );
    const toggle = screen.getByRole('button', { name: '사이드바 고정 해제' });
    expect(toggle).not.toHaveAttribute('aria-pressed');

    await user.click(toggle);
    // 인계 로직(`handoffFocus`)은 이제 `useShellPanels.toggleSidebarPinned` 하나에만 있다 — 이
    // 컴포넌트는 그 함수를 그대로 부를 뿐 스스로 store 를 만지거나 포커스를 옮기지 않는다.
    expect(onTogglePinned).toHaveBeenCalledTimes(1);
  });
});
