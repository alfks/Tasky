// 앱 셸 조립 (app-shell.md R1·R6·R8·R9·R10·R15 · §2-C).
//
// 이 파일이 지키는 것은 **배선**이다. 각 feature 의 내부 동작은 그 feature 의 테스트가 이미 본다.
// 여기서 묻는 것은 하나뿐이다 — "셸이 그것을 화면에 올렸는가, 그리고 한 번만 올렸는가".
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';
import { adopt } from '@/domain/meta';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { useCategoryStore } from '@/features/category';
import { useDateStripStore } from '@/features/date-strip';
import { AppShell } from '@/features/shell/components/AppShell';
import { EMPTY_CATEGORIES_TEXT, EMPTY_TODOS_TEXT } from '@/features/shell/components/ShellMain';
import { STORAGE_FAILURE_TEXT } from '@/features/shell/components/StorageFailureCard';
import { TOAST_STACK_ATTR } from '@/features/shell/lib/toast-stack';
import { useShellStorageStore } from '@/features/shell/store/shell-storage-store';
import { useShellToastStore } from '@/features/shell/store/shell-toast-store';
import { useShellUiStore } from '@/features/shell/store/shell-ui-store';
import { useThemeStore } from '@/features/theme';
import { useTimerStore } from '@/features/timer';
import { useTodoStore } from '@/features/todo';
import { makeCategory } from '@/test/fixtures/category';
import { makeFocusSession } from '@/test/fixtures/focus-session';
import { makeTodo } from '@/test/fixtures/todo';

import { OVERLAY_ALWAYS_LIVE_ATTR } from '@/components/ui/overlay-rules';

const TODAY = '2026-09-16' as DateKey;
const STUDY = makeCategory({ seq: 1, order: 0, name: '공부' });

/** 넓은 화면(3컬럼)으로 고정한다 — jsdom 기본 폭은 1024 라 인사이트 컬럼이 서지 않는다. */
function setWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
}

/**
 * 저장소에 실제로 써 넣는다. 스토어에만 꽂으면 `TodoList` 가 마운트하면서 그 날짜를 다시 읽어
 * 빈 저장소로 덮어쓴다(todo R17) — 셸 조립을 재는 테스트가 그 경로를 피해 갈 이유가 없다.
 */
async function seed(
  todos: readonly ReturnType<typeof makeTodo>[] = [
    makeTodo({ seq: 1, categoryId: STUDY.id, date: TODAY }),
  ],
  categories: readonly ReturnType<typeof makeCategory>[] = [STUDY],
): Promise<void> {
  const repositories = createMemoryRepositories();
  setRepositories(repositories);
  await Promise.all(categories.map((category) => repositories.categories.upsert(adopt(category))));
  await Promise.all(todos.map((todo) => repositories.todos.upsert(adopt(todo))));
  useCategoryStore.setState({
    byId: Object.fromEntries(categories.map((category) => [category.id, category])),
    status: 'ready',
    error: null,
  });
  useTodoStore.setState({ byId: {}, date: null, status: 'idle', error: null });
}

beforeEach(async () => {
  setWidth(1440);
  useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });
  useShellUiStore.setState({
    sidebarCollapsed: false,
    insightCollapsed: false,
    drawerOpen: false,
    insightOverlayOpen: false,
  });
  useShellToastStore.setState({ toasts: [] });
  useShellStorageStore.setState({ status: 'storage' });
  useTimerStore.setState({ session: null, todoTitle: null, completion: null });
  await seed();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.title = 'Tasky';
});

/** 셸을 띄우고 첫 적재 effect 들이 가라앉을 때까지 기다린다. */
async function mount(options: { todos?: boolean } = {}): Promise<void> {
  render(<AppShell />);
  // 투두 목록이 아예 안 그려지는 상태(카테고리 0개·저장소 실패)에서는 기다릴 적재가 없다.
  if (options.todos !== false) {
    await waitFor(() => expect(useTodoStore.getState().status).not.toBe('idle'));
  }
  await act(async () => {
    await Promise.resolve();
  });
}

describe('랜드마크와 골격 (R1·R10)', () => {
  it('nav·main·aside 가 각각 하나씩이다', async () => {
    await mount();
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('complementary')).toHaveLength(1);
    expect(screen.getByRole('navigation')).toHaveAccessibleName('카테고리');
    expect(screen.getByRole('complementary')).toHaveAccessibleName('오늘 요약');
  });

  it('첫 포커스 가능 요소는 본문으로 건너뛰기 링크다 (R10)', async () => {
    await mount();
    const focusables = document.querySelectorAll<HTMLElement>('a[href], button, input, select');
    expect(focusables[0]).toHaveAccessibleName('본문으로 건너뛰기');
    expect(focusables[0]?.getAttribute('href')).toBe('#shell-main');
    expect(document.getElementById('shell-main')).toBe(screen.getByRole('main'));
  });

  it('h1 은 문서에 하나뿐이다', async () => {
    await mount();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('토스트 뷰포트 통합 (R8 · 리뷰 필수항목 1)', () => {
  it('셸이 허브에 밀어 넣은 토스트를 그린다', async () => {
    await mount();
    act(() => {
      useShellToastStore.getState().pushToast({ message: '옮겼어요' });
    });
    expect(await screen.findByText('옮겼어요')).toBeInTheDocument();
  });

  it('뷰포트가 둘 이상 뜨면 셸이 서로 겹치지 않게 밀어 올린다', async () => {
    await mount();
    // feature 가 자기 뷰포트를 띄우는 상황을 그대로 재현한다(지금 넷이 그렇게 한다).
    const extra = document.createElement('div');
    extra.setAttribute(OVERLAY_ALWAYS_LIVE_ATTR, '');
    const region = document.createElement('div');
    region.append(document.createElement('div'));
    extra.append(region, document.createElement('div'));
    vi.spyOn(extra, 'getBoundingClientRect').mockReturnValue({ height: 55 } as DOMRect);
    act(() => {
      useShellToastStore.getState().pushToast({ message: '먼저 뜬 토스트' });
      document.body.append(extra);
    });
    await waitFor(() => expect(extra.hasAttribute(TOAST_STACK_ATTR)).toBe(true));
    expect(extra.style.bottom).not.toBe('');
  });
});

describe('한 번만 서는 전역 레이어 (리뷰 필수항목 2·3)', () => {
  it('PwaNotices 가 마운트돼 저장 공간 알림 영역이 있다', async () => {
    await mount();
    expect(screen.getByLabelText('저장 공간 알림')).toBeInTheDocument();
  });

  it('CommandLayer 가 마운트돼 `?` 로 도움말이 열린다', async () => {
    const user = userEvent.setup();
    await mount();
    await user.keyboard('?');
    expect(await screen.findByRole('dialog', { name: '단축키' })).toBeInTheDocument();
  });

  it('인사이트 패널의 [단축키] 버튼도 같은 도움말을 연다', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(
      within(screen.getByRole('complementary')).getByRole('button', { name: /단축키/ }),
    );
    expect(await screen.findByRole('dialog', { name: '단축키' })).toBeInTheDocument();
  });

  it('전역 단축키가 날짜를 옮긴다 (shortcuts R1)', async () => {
    const user = userEvent.setup();
    await mount();
    await user.keyboard('{ArrowRight}');
    expect(useDateStripStore.getState().selectedDate).toBe('2026-09-17');
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}');
    expect(useDateStripStore.getState().selectedDate).toBe('2026-09-10');
  });
});

describe('카테고리 삭제 배선 (리뷰 필수항목 4)', () => {
  it('사이드바 카테고리 메뉴에 "삭제" 가 있다', async () => {
    const user = userEvent.setup();
    await mount();
    const nav = screen.getByRole('navigation');
    await user.click(within(nav).getByRole('button', { name: /메뉴/ }));
    expect(await screen.findByRole('menuitem', { name: /삭제/ })).toBeInTheDocument();
  });

  it('"삭제" 를 누르면 확인 대화상자가 뜬다 — 제어기와 대화상자가 같은 것이어야 한다', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(within(screen.getByRole('navigation')).getByRole('button', { name: /메뉴/ }));
    await user.click(await screen.findByRole('menuitem', { name: /삭제/ }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('공부');
  });
});

describe('에러 바운더리 (리뷰 필수항목 6)', () => {
  it('렌더 중 예외가 나도 #root 가 비지 않는다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // 날짜 파싱을 깨뜨리면 헤더가 렌더 중에 던진다 — 바운더리가 없으면 트리 전체가 사라진다.
    useDateStripStore.setState({ selectedDate: '깨진-날짜' as DateKey });
    render(<AppShell />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('화면을 그리지 못했어요'),
    );
  });
});

describe('타이머 슬롯 (리뷰 필수항목 5 · R15)', () => {
  it('인사이트 패널 맨 위가 집중 섹션이다 (R6 순서)', async () => {
    await mount();
    const headings = within(screen.getByRole('complementary')).getAllByRole('heading');
    expect(headings.map((h) => h.textContent)).toEqual(['집중', '오늘 달성률', '카테고리별']);
  });

  it('세션이 없으면 헤더 칩은 렌더되지 않는다 (R15 "자리 차지 없음")', async () => {
    await mount();
    expect(screen.queryByRole('button', { name: /집중 타이머/ })).not.toBeInTheDocument();
  });

  it('세션이 있으면 헤더에 칩이 뜬다', async () => {
    await mount();
    act(() => {
      useTimerStore.setState({
        session: makeFocusSession({ startedAt: '2026-09-16T00:00:00.000Z' }),
        now: '2026-09-16T00:00:10.000Z',
        todoTitle: null,
      });
    });
    expect(await screen.findByRole('button', { name: /집중 타이머/ })).toBeInTheDocument();
  });
});

describe('달성률 낭독 (R6 판단 — 리뷰 필수항목 7)', () => {
  it('링은 헤더와 패널 둘이지만 같은 값을 읽고, 둘 다 라이브 영역 밖이다', async () => {
    await mount();
    const rings = screen.getAllByRole('img');
    expect(rings).toHaveLength(2);
    // 같은 훅에서 나온 같은 숫자여야 한다(completion-rate R8).
    expect(new Set(rings.map((ring) => ring.getAttribute('aria-label'))).size).toBe(1);
    // 링이 라이브 영역 안에 있으면 체크 한 번에 링 수만큼 다시 낭독된다 — 그 자리를 막는다.
    for (const ring of rings) {
      expect(ring.closest('[aria-live]:not([aria-live="off"])')).toBeNull();
    }
  });

  it('달성률을 알리는 라이브 영역은 헤더의 하나뿐이다 (R6 3연속 낭독 판단)', async () => {
    await mount();
    // 고정 영역(헤더)만 본다 — 목록의 순서 변경 낭독은 달성률과 다른 얘기를 하는 다른 영역이다.
    const header = screen.getByRole('main').firstElementChild;
    expect(header?.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
  });
});

describe('문서 제목 (R9)', () => {
  it('투두가 있으면 날짜 · 비율 · 앱 이름', async () => {
    await seed([
      makeTodo({ seq: 1, categoryId: STUDY.id, date: TODAY, done: true }),
      makeTodo({ seq: 2, categoryId: STUDY.id, date: TODAY }),
    ]);
    await mount();
    expect(document.title).toBe('9월 16일 (수) · 1/2 · Tasky');
  });

  it('투두가 0개면 비율을 빼고 쓴다', async () => {
    await seed([]);
    await mount();
    expect(document.title).toBe('9월 16일 (수) · Tasky');
  });
});

describe('상태 (§2-C)', () => {
  it('카테고리가 0개면 안내와 [첫 카테고리 만들기] 가 뜬다', async () => {
    await seed([], []);
    await mount({ todos: false });
    expect(screen.getByText(EMPTY_CATEGORIES_TEXT)).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: '첫 카테고리 만들기' }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('카테고리는 있고 그날 투두가 0개면 한 줄 안내가 뜬다', async () => {
    await seed([]);
    await mount();
    expect(screen.getByText(EMPTY_TODOS_TEXT)).toBeInTheDocument();
  });

  it('저장소를 열지 못하면 메인이 안내 카드로 바뀐다', async () => {
    useShellStorageStore.setState({ status: 'failed' });
    await mount({ todos: false });
    expect(screen.getByText(STORAGE_FAILURE_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_TODOS_TEXT)).not.toBeInTheDocument();
  });

  it('첫 조회 둘(카테고리·테마)이 함께 실패하면 저장소 열기 실패로 본다', async () => {
    useCategoryStore.setState({ byId: {}, status: 'error', error: '읽지 못했어요' });
    useThemeStore.setState({ status: 'error', error: '읽지 못했어요' });
    await mount({ todos: false });
    await waitFor(() => expect(screen.getByText(STORAGE_FAILURE_TEXT)).toBeInTheDocument());
  });

  it('카테고리만 실패했을 때는 안내 카드로 바꾸지 않는다 — 조회 하나의 실패는 열기 실패가 아니다', async () => {
    useCategoryStore.setState({ byId: {}, status: 'error', error: '읽지 못했어요' });
    useThemeStore.setState({ status: 'ready', error: null });
    await mount({ todos: false });
    expect(screen.queryByText(STORAGE_FAILURE_TEXT)).not.toBeInTheDocument();
  });

  it('메모리 모드에서는 상시 배너가 뜬다', async () => {
    useShellStorageStore.setState({ status: 'memory' });
    await mount();
    expect(screen.getByText('지금 적는 내용은 새로고침하면 사라져요')).toBeInTheDocument();
  });
});

describe('붕괴 순서 (§2-B · R4)', () => {
  it('1024~1279 에서는 인사이트가 컬럼에서 내려가고 여는 버튼이 생긴다', async () => {
    setWidth(1100);
    await mount();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    const opener = screen.getByRole('button', { name: '오늘 요약 열기' });
    // 접힘/펼침 버튼은 상태를 말해야 한다(§5).
    expect(opener).toHaveAttribute('aria-expanded', 'false');
    expect(opener).toHaveAttribute('aria-controls', 'shell-insight-overlay');
  });

  it('768~1023 에서는 사이드바가 ☰ 로 내려간다', async () => {
    setWidth(900);
    await mount();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '카테고리 열기' })).toBeInTheDocument();
  });

  it('☰ 를 누르면 드로어가 열리고 그 안에 카테고리 목록이 있다 (R7)', async () => {
    const user = userEvent.setup();
    setWidth(900);
    await mount();
    await user.click(screen.getByRole('button', { name: '카테고리 열기' }));
    const drawer = await screen.findByRole('dialog', { name: 'Tasky' });
    expect(within(drawer).getByRole('navigation')).toHaveAccessibleName('카테고리');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('오버레이는 Esc 로 닫히고 포커스가 열었던 버튼으로 돌아온다 (R7)', async () => {
    const user = userEvent.setup();
    setWidth(1100);
    await mount();
    const opener = screen.getByRole('button', { name: '오늘 요약 열기' });
    await user.click(opener);
    expect(await screen.findByRole('dialog', { name: '오늘 요약' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(opener);
  });

  it('768px 미만에서는 하단 고정 [+ 할 일] 이 붙는다', async () => {
    setWidth(400);
    await mount();
    expect(screen.getByRole('button', { name: '+ 할 일' })).toBeInTheDocument();
  });
});
