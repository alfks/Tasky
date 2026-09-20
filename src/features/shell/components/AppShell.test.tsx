// 앱 셸 조립 (app-shell.md R1·R6·R8·R9·R10·R15 · §2-C).
//
// 이 파일이 지키는 것은 **배선**이다. 각 feature 의 내부 동작은 그 feature 의 테스트가 이미 본다.
// 여기서 묻는 것은 하나뿐이다 — "셸이 그것을 화면에 올렸는가, 그리고 한 번만 올렸는가".
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';
import { adopt } from '@/domain/meta';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { useCategoryStore } from '@/features/category';
import { useCommandStore } from '@/features/command';
import { useDateStripStore } from '@/features/date-strip';
import { useReportsStore } from '@/features/reports';
import { AppShell } from '@/features/shell/components/AppShell';
import {
  EMPTY_CATEGORIES_TEXT,
  EMPTY_TODOS_TEXT,
  SKELETON_DELAY_MS,
} from '@/features/shell/components/ShellMain';
import { STORAGE_FAILURE_TEXT } from '@/features/shell/components/StorageFailureCard';
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
  useTodoStore.setState({ byId: {}, date: null, status: 'idle', error: null, writeRevision: 0 });
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
  // 앞 테스트가 열어 둔 도움말·팔레트가 남으면 다음 테스트는 **대화상자가 열린 채** 돈다
  // (전역 단축키가 막히는 것이 정상이다 — T-44). 이 스토어는 모듈 전역이라 언마운트로 안 돌아간다.
  useCommandStore.setState({ helpOpen: false, paletteOpen: false });
  useReportsStore.setState({ open: false, opener: null });
  // 아래 `저장소 열기 실패` 테스트가 테마를 `error` 로 남긴다. 되돌리지 않으면 그 뒤의 모든
  // 테스트가 **테마 조회가 실패한 앱**을 그린다 — 지금은 그래도 통과하지만(T-49 실측), 그건
  // 조립이 그 조합에 둔감할 뿐이지 테스트가 의도한 상태가 아니다.
  useThemeStore.setState({ status: 'ready', error: null });
  useShellStorageStore.setState({ status: 'storage' });
  useTimerStore.setState({ session: null, todoTitle: null, completion: null });
  await seed();
});

afterEach(() => {
  vi.restoreAllMocks();
  // 가짜 시계·가짜 타이머를 쓴 테스트가 있어도 여기서 원래대로 돌린다(안 썼으면 무해하다).
  vi.useRealTimers();
  document.title = 'Tasky';
});

const SESSION_STARTED_AT = '2026-09-16T00:00:00.000Z';
const SESSION_NOW = '2026-09-16T00:00:10.000Z';

/**
 * 실행 중인 집중 세션을 스토어에 꽂는다 — **시계를 그 세션 안에 멈춰 두고**.
 *
 * 헤더 칩은 타이머 런타임을 걸고, 그 런타임은 1초마다 `tick()` 을 부른다. `tick()` 은 **진짜
 * 시계**를 읽어 이미 끝난 세션을 쓸어 담으므로, 고정 날짜의 픽스처 세션은 오늘의 시계에서 늘
 * "한참 전에 끝난" 세션이다. 그 인터벌이 세션을 꽂은 뒤와 칩을 찾기 전 사이에 끼어들면 세션이
 * 지워지고 칩은 영영 안 뜬다. 예산은 **틱 한 번(1000ms)** 뿐이다.
 *
 * T-55 실측(2026-09-17 · 4코어): 이 배선이 실제로 실패하는 것은 **보지 못했다** — 부하를 건
 * 138회(조건은 아래 `로딩` 블록 주석과 같다)에서 0회다. 대신 창의 존재는 결정적으로 보였다:
 * 세션을 꽂은 뒤 `findByRole` 앞에 **진짜 1.2초**를 끼우면 고친 이 배선 없이는 곧바로 죽고
 * (`Unable to find role="button" and name /집중 타이머/`), 아래처럼 `Date` 를 세워 두면 같은
 * 1.2초에도 통과한다. 즉 "아직 안 터졌을 뿐 시계에 매달린" 단언이라 함께 걷었다.
 *
 * 그래서 **`Date` 만** 가짜로 세운다. 타이머는 진짜 그대로라 인터벌이 몇 번을 돌든 `tick()` 이
 * 읽는 시각은 세션 시작 10초 뒤고, 25분짜리 세션은 그대로 실행 중이다. 되돌리기는 위 `afterEach`.
 */
function startRunningSession(): void {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(SESSION_NOW) });
  useTimerStore.setState({
    session: makeFocusSession({ startedAt: SESSION_STARTED_AT }),
    now: SESSION_NOW,
    todoTitle: null,
  });
}

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

  // T-30 전에는 여기에 "뷰포트가 둘 이상 뜨면 겹치지 않게 밀어 올린다" 가 있었다. 뷰포트가 하나뿐이면
  // 밀어 올릴 것이 없다 — 겹침 방지 대신 **한 장만 남는지**를 본다. 자세한 배선은 ShellToasts.test.tsx.
  it('뷰포트는 앱에 하나뿐이고 토스트도 한 번에 한 장이다 (R8)', async () => {
    await mount();
    act(() => {
      useShellToastStore.getState().pushToast({ message: '먼저 뜬 토스트' });
    });
    expect(await screen.findByText('먼저 뜬 토스트')).toBeInTheDocument();
    act(() => {
      useShellToastStore.getState().pushToast({ message: '나중 토스트' });
    });
    expect(await screen.findByText('나중 토스트')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('먼저 뜬 토스트')).not.toBeInTheDocument());
    expect(document.querySelectorAll(`[${OVERLAY_ALWAYS_LIVE_ATTR}]`)).toHaveLength(1);
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
    expect(headings.map((h) => h.textContent)).toEqual([
      '집중',
      '오늘 달성률',
      '카테고리별',
      'D-day',
    ]);
  });

  it('세션이 없으면 헤더 칩은 렌더되지 않는다 (R15 "자리 차지 없음")', async () => {
    await mount();
    expect(screen.queryByRole('button', { name: /집중 타이머/ })).not.toBeInTheDocument();
  });

  it('세션이 있으면 헤더에 칩이 뜬다', async () => {
    await mount();
    act(startRunningSession);
    expect(await screen.findByRole('button', { name: /집중 타이머/ })).toBeInTheDocument();
  });
});

describe('달성률 낭독 (R6 판단 — 리뷰 필수항목 7)', () => {
  it('인사이트 컬럼이 서 있으면 링은 패널의 하나뿐이다 — 헤더는 숫자만 맡는다', async () => {
    await mount();
    const rings = screen.getAllByRole('img');
    expect(rings).toHaveLength(1);
    expect(rings[0]?.closest('[aria-live]:not([aria-live="off"])')).toBeNull();
    // 헤더는 같은 값을 숫자로만 보여 준다(R3 "달성률 요약").
    const header = screen.getByRole('main').firstElementChild;
    expect(header?.textContent).toContain('0 / 1');
  });

  it('인사이트 컬럼이 없으면 헤더 버튼이 그 링을 맡는다', async () => {
    setWidth(1100);
    await mount();
    const rings = screen.getAllByRole('img');
    expect(rings).toHaveLength(1);
    expect(rings[0]?.closest('button')).toHaveAccessibleName('오늘 요약 열기');
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
    // 닫혀 있는 동안 패널은 DOM 에 없다 — 없는 id 를 가리키지 않는다.
    expect(opener).not.toHaveAttribute('aria-controls');
  });

  it('오버레이를 열면 그때 `aria-controls` 가 실제 패널을 가리킨다', async () => {
    const user = userEvent.setup();
    setWidth(1100);
    await mount();
    const opener = screen.getByRole('button', { name: '오늘 요약 열기' });
    await user.click(opener);
    await screen.findByRole('dialog', { name: '오늘 요약' });
    expect(opener).toHaveAttribute('aria-controls', 'shell-insight-overlay');
    expect(document.getElementById('shell-insight-overlay')).not.toBeNull();
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

describe('적재 배선 (Blocker: 1024px 미만·사이드바 접힘에서 앱이 비어 있던 자리)', () => {
  /** 카테고리 적재를 거는 유일한 경로가 사이드바였다 — 사이드바가 없는 화면을 전부 훑는다. */
  it.each([
    ['폭 900(드로어)', 900, false],
    ['폭 400(드로어)', 400, false],
    ['폭 1440 + 사이드바 접힘(새로고침해도 남는 상태)', 1440, true],
  ])('%s 에서도 카테고리를 읽고 투두 영역을 그린다', async (_label, width, collapsed) => {
    setWidth(width);
    useShellUiStore.setState({ sidebarCollapsed: collapsed });
    useCategoryStore.setState({ byId: {}, status: 'idle', error: null });
    await mount();
    await waitFor(() => expect(useCategoryStore.getState().status).toBe('ready'));
    expect(screen.queryByRole('navigation')).toBeNull();
    // 투두 영역이 실제로 그려졌다 — 그룹의 입력 행이 그 증거다.
    expect(await screen.findByRole('button', { name: /할 일 추가/ })).toBeInTheDocument();
  });

  it('사이드바가 컬럼이면 적재가 두 번 걸리지 않는다 — 셸과 목록이 같은 자리를 다툰다', async () => {
    // 두 호출부가 같은 스토어 액션을 부르므로 그 액션 자체를 센다(`categories.list` 는 날짜 스트립도 부른다).
    const load = vi.fn(useCategoryStore.getState().load);
    useCategoryStore.setState({ byId: {}, status: 'idle', error: null, load });
    await mount();
    await waitFor(() => expect(useCategoryStore.getState().status).toBe('ready'));
    expect(load).toHaveBeenCalledTimes(1);
  });
});

/**
 * 이 블록은 **가짜 타이머 + 손으로 푸는 조회**로 돈다 — 벽시계를 한 밀리초도 쓰지 않는다.
 *
 * 왜: 스켈레톤이 보이는 구간은 `[100ms, 조회가 끝나는 시각]` 이라 **지나가는 창**이다. 실제
 * `setTimeout(250)` 으로 느린 조회를 흉내 내면 그 창이 150ms 밖에 안 열리고, `waitFor` 의 폴링이
 * 그 안에 한 번도 못 들어가면 창이 **이미 닫힌 뒤** 계속 헛돌다 죽는다. 워크트리 여러 개가 동시에
 * 도는 것이 평상시인 이 레포에서 그것이 실제로 났다.
 *
 * T-55 재현 실측(2026-09-17 · 4코어 · 이 파일 53건 · 고친 **전** 코드). 부하 종류를 바꿔 가며 셌다:
 *   - CPU 바쁜 루프 12개 + 순차 실행 ......... 20회 중 **0회**
 *   - `vitest` 6개 동시 + 바쁜 루프 6개 ...... 54회 중 **2회**
 *   - `vitest` 8개 동시 + 바쁜 루프 4개 ...... 64회 중 **1회**
 * 합계 **138회 중 3회(2.2%)**, 전부 이 블록의 `slowTodoReads(250)` 케이스에서 같은 한 줄로 죽었다
 * (`AssertionError: expected null not to be null`). 부하를 CPU 로만 올리면 안 나고 **같은 파일을
 * 여러 프로세스가 같이 돌 때** 났다 — 이 레포의 평상시가 정확히 그 모양이다. 2%는 티켓이 인용한
 * 수치(20회 중 5회)보다 훨씬 낮지만, 낮은 실패율이야말로 "또 그거네" 로 흘려보내지는 쪽이다.
 *
 * 타임아웃을 늘리는 것은 고치는 게 아니다 — 부하가 더 오르면 창은 또 닫힌다. 그래서 창 자체를
 * 없앤다: 조회는 **우리가 풀 때까지 안 끝나고**(창이 열린 채로 멈춘다), 100ms 문턱은 가짜 시계를
 * 정확히 그만큼 돌려 넘는다. 단언은 오히려 늘었다 — 이제 "100ms 전에는 안 뜬다" 까지 잡는다.
 * 음성 대조로 확인했다: `useDelayedFlag` 에서 문턱을 걷어내면 여기 한 건이 죽는데, **옛 테스트는
 * 같은 결함에 53/53 초록**이었다.
 *
 * 가짜로 만드는 것은 **타이머 넷뿐**이다. `setImmediate` 까지 가짜로 두면 React 의 `act` 가
 * 그것으로 작업을 미루다 영영 깨어나지 않는다.
 */
describe('로딩 (§2-C · Blocker: 스켈레톤이 적재를 진동시키던 자리)', () => {
  const FAKE_TIMERS = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] as const;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: [...FAKE_TIMERS] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** 지금 스켈레톤이 떠 있는가 (§2-C 로딩의 유일한 표식). */
  function skeleton(): Element | null {
    return document.querySelector('[aria-busy="true"]');
  }

  /**
   * 투두 조회를 **붙잡는다**. `release()` 를 부를 때까지 끝나지 않는다 —
   * "느린 조회" 를 밀리초가 아니라 **순서**로 만든다.
   */
  function heldTodoReads(): { calls: () => number; release: () => Promise<void> } {
    const repositories = getRepositories();
    const original = repositories.todos.listByDate.bind(repositories.todos);
    let calls = 0;
    const gates: Array<() => void> = [];
    const results: Array<Promise<unknown>> = [];
    vi.spyOn(repositories.todos, 'listByDate').mockImplementation((date) => {
      calls += 1;
      const held = new Promise<void>((resolve) => gates.push(resolve)).then(() => original(date));
      results.push(held);
      return held;
    });
    return {
      calls: () => calls,
      release: async () => {
        await act(async () => {
          for (const open of gates.splice(0)) open();
          await Promise.all(results);
          // 스토어의 `await` 뒷줄과 그것이 부른 렌더까지 소화시킨다(가짜 시계는 안 움직인다).
          await vi.advanceTimersByTimeAsync(0);
        });
      },
    };
  }

  /** 가짜 시계를 그만큼 돌리고, 그 사이 풀린 약속·렌더를 전부 소화한다. */
  async function advance(ms: number): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it('느린 조회에서도 목록 적재는 한 번이다 — 스켈레톤이 `TodoList` 를 대체하지 않는다', async () => {
    const reads = heldTodoReads();
    render(<AppShell />);
    // 스켈레톤이 실제로 뜬 상태를 지난다 — 진동은 바로 이 순간에 났다.
    await advance(SKELETON_DELAY_MS);
    expect(skeleton()).not.toBeNull();
    await reads.release();
    expect(screen.getByRole('main')).toHaveTextContent(/할 일 추가/);
    // 리뷰 실측에서는 조작 0회에 8회였다.
    expect(reads.calls()).toBe(1);
  });

  it('첫 조회가 100ms 를 넘기면 스켈레톤이 뜨고, 끝나면 사라진다', async () => {
    const reads = heldTodoReads();
    render(<AppShell />);
    // 문턱 전: 짧은 조회에 번쩍이지 않는다(§2-C).
    await advance(SKELETON_DELAY_MS - 1);
    expect(skeleton()).toBeNull();
    await advance(1);
    expect(skeleton()).not.toBeNull();
    await reads.release();
    expect(skeleton()).toBeNull();
  });

  it('스켈레톤이 떠 있는 동안에도 `TodoList` 는 마운트된 채다', async () => {
    const reads = heldTodoReads();
    render(<AppShell />);
    await advance(SKELETON_DELAY_MS);
    expect(skeleton()).not.toBeNull();
    // 숨겨져 있을 뿐 트리에 살아 있다 — 언마운트되면 적재가 취소되고 다시 시작된다.
    expect(screen.getByRole('main').querySelector('[hidden]')).not.toBeNull();
    await reads.release();
  });

  it('날짜를 옮길 때는 스켈레톤이 다시 뜨지 않는다 (첫 적재로만 좁혔다)', async () => {
    const reads = heldTodoReads();
    render(<AppShell />);
    await reads.release();
    // 첫 적재가 끝난 뒤라야 "다시" 를 물을 수 있다.
    expect(useTodoStore.getState().status).toBe('ready');
    act(() => {
      useTodoStore.setState({ status: 'loading' });
    });
    await advance(SKELETON_DELAY_MS + 60);
    expect(skeleton()).toBeNull();
  });
});

describe('하단 고정 [+ 할 일] (§2-B)', () => {
  it('768px 이상에서는 없다', async () => {
    setWidth(900);
    await mount();
    expect(screen.queryByRole('button', { name: '+ 할 일' })).toBeNull();
  });

  it('누르면 첫 그룹의 입력 행이 열린다', async () => {
    const user = userEvent.setup();
    setWidth(400);
    await mount();
    await user.click(screen.getByRole('button', { name: '+ 할 일' }));
    expect(await screen.findByRole('textbox', { name: /할 일 추가/ })).toHaveFocus();
  });

  it('누를 대상이 없으면 비활성이다 — 눌러도 아무 일 없는 버튼을 두지 않는다', async () => {
    setWidth(400);
    await seed([], []);
    useCategoryStore.setState({ byId: {}, status: 'ready', error: null });
    render(<AppShell />);
    await screen.findByText(EMPTY_CATEGORIES_TEXT);
    // 카테고리가 없으면 막대 자체가 없다.
    expect(screen.queryByRole('button', { name: '+ 할 일' })).toBeNull();
  });
});

describe('포커스가 `<body>` 로 떨어지지 않는다 (R14 · §5 — 접근성 리뷰가 3경로에서 실측한 자리)', () => {
  it('카테고리를 삭제해도 포커스가 살아 있다', async () => {
    const user = userEvent.setup();
    await seed([], [STUDY, makeCategory({ seq: 2, order: 1, name: '운동' })]);
    await mount();
    const nav = screen.getByRole('navigation');
    await user.click(within(nav).getAllByRole('button', { name: /메뉴/ })[0] as HTMLElement);
    await user.click(await screen.findByRole('menuitem', { name: /삭제/ }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /^삭제$/ }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.tagName).not.toBe('BODY');
  });

  it('인사이트를 접으면 포커스가 자리를 잇는 `오늘 요약 열기` 로 간다', async () => {
    const user = userEvent.setup();
    await mount();
    const collapse = within(screen.getByRole('complementary')).getByRole('button', {
      name: '접기',
    });
    collapse.focus();
    await user.click(collapse);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '오늘 요약 열기' })),
    );
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('사이드바를 접으면 포커스가 `카테고리 열기` 로 간다', async () => {
    const user = userEvent.setup();
    await mount();
    const menu = within(screen.getByRole('navigation')).getByRole('button', { name: /메뉴/ });
    menu.focus();
    await user.keyboard('{Control>}\\{/Control}');
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '카테고리 열기' })),
    );
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('영역 밖에 포커스가 있으면 접어도 포커스를 뺏지 않는다', async () => {
    const user = userEvent.setup();
    await mount();
    const skip = screen.getByRole('link', { name: '본문으로 건너뛰기' });
    skip.focus();
    await user.keyboard('{Control>}\\{/Control}');
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(document.activeElement).toBe(skip);
  });
});

describe('인사이트 접기 버튼의 상태 (§5)', () => {
  it('`aria-expanded` 와 `aria-controls` 가 둘 다 있다', async () => {
    await mount();
    const collapse = within(screen.getByRole('complementary')).getByRole('button', {
      name: '접기',
    });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    expect(collapse).toHaveAttribute('aria-controls', 'shell-insight-panel');
    expect(document.getElementById('shell-insight-panel')).toBe(screen.getByRole('complementary'));
  });
});

describe('타이머 칩의 "인사이트 열기" (R1)', () => {
  it('컬럼이 서 있으면 오버레이를 띄우지 않는다 — `aside` 가 둘이 되면 R1 위반이다', async () => {
    const user = userEvent.setup();
    await mount();
    act(startRunningSession);
    await user.click(await screen.findByRole('button', { name: /집중 타이머/ }));
    expect(screen.queryByRole('dialog', { name: '오늘 요약' })).toBeNull();
    expect(screen.getAllByRole('complementary')).toHaveLength(1);
    expect(document.activeElement).toBe(screen.getByRole('complementary'));
  });

  it('컬럼이 없으면 오버레이를 연다', async () => {
    const user = userEvent.setup();
    setWidth(1100);
    await mount();
    act(startRunningSession);
    await user.click(await screen.findByRole('button', { name: /집중 타이머/ }));
    expect(await screen.findByRole('dialog', { name: '오늘 요약' })).toBeInTheDocument();
    expect(screen.getAllByRole('complementary')).toHaveLength(1);
  });
});

describe('붕괴와 오버레이의 상호작용 (§2-B · R4)', () => {
  it('폭이 넓어지면 컬럼이 서고 오버레이는 닫힌다', async () => {
    const user = userEvent.setup();
    setWidth(1100);
    await mount();
    await user.click(screen.getByRole('button', { name: '오늘 요약 열기' }));
    await screen.findByRole('dialog', { name: '오늘 요약' });
    act(() => {
      setWidth(1440);
      window.dispatchEvent(new Event('resize'));
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });

  it('폭이 줄면 컬럼이 내려간다 — 리사이즈를 구독하지 않으면 붕괴가 멈춘다 (R4)', async () => {
    await mount();
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    act(() => {
      setWidth(900);
      window.dispatchEvent(new Event('resize'));
    });
    await waitFor(() => expect(screen.queryByRole('complementary')).toBeNull());
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});

describe('상단 고정 알림 자리 비우기', () => {
  it('배너가 뜨면 그 높이만큼 셸이 자리를 비운다', async () => {
    await mount();
    const spacer = document.querySelector<HTMLElement>('[data-shell-notice-spacer]');
    expect(spacer).not.toBeNull();
    expect(spacer?.style.height).toBe('0px');

    const region = screen.getByLabelText('저장 공간 알림');
    const banner = document.createElement('div');
    vi.spyOn(banner, 'getBoundingClientRect').mockReturnValue({ bottom: 74 } as DOMRect);
    act(() => {
      region.append(banner);
    });
    await waitFor(() => expect(spacer?.style.height).toBe('82px'));
  });
});

describe('삭제된 카테고리의 이름·색 복원 배선 (category R17·R22)', () => {
  const DELETED = makeCategory({
    seq: 2,
    order: 1,
    name: '요리',
    color: '#FFB38A',
    deletedAt: '2026-09-01T00:00:00.000Z',
  });

  it('본문 목록·인사이트 패널이 같은 tombstone 이름·색을 보여준다', async () => {
    await seed(
      [
        makeTodo({ seq: 1, categoryId: STUDY.id, date: TODAY }),
        makeTodo({ seq: 2, categoryId: DELETED.id, date: TODAY, done: true }),
      ],
      [STUDY],
    );
    // `seed()` 는 넘긴 카테고리만 `repositories.categories.upsert` 한다 — tombstone 은
    // 스토어(byId)에 없어야 하므로 저장소에만 직접 심는다(실제로 삭제된 뒤의 모양과 같다).
    await getRepositories().categories.upsert(adopt(DELETED));

    await mount();

    const group = await screen.findByRole('region', { name: '요리 (삭제됨)' });
    expect(group).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('complementary')).toHaveTextContent('요리 (삭제됨)'),
    );
  });

  it('사이드바·선택지에는 여전히 나오지 않는다', async () => {
    await seed(
      [
        makeTodo({ seq: 1, categoryId: STUDY.id, date: TODAY }),
        makeTodo({ seq: 2, categoryId: DELETED.id, date: TODAY, done: true }),
      ],
      [STUDY],
    );
    await getRepositories().categories.upsert(adopt(DELETED));

    await mount();
    await screen.findByRole('region', { name: '요리 (삭제됨)' });

    expect(within(screen.getByRole('navigation')).queryByText('요리')).toBeNull();
  });
});

describe('통계 화면 배선 (T-85, stats.md "메인 컬럼 전체 대체")', () => {
  it('커맨드 팔레트 "통계 보기"를 키보드만으로 실행하면 통계 화면이 뜨고, 닫으면 원래 화면으로 돌아온다', async () => {
    const user = userEvent.setup();
    await mount();

    // Ctrl+K 로 팔레트를 열고(CommandPalette.test.tsx 와 같은 단축키), 입력 없이 화살표로
    // "통계 보기" 까지 정확히 내려가 Enter 로 실행한다(마우스를 전혀 쓰지 않는다).
    await user.keyboard('{Control>}k{/Control}');
    const palette = await screen.findByRole('dialog', { name: '명령 팔레트' });
    const options = within(palette).getAllByRole('option');
    const targetIndex = options.findIndex((el) => /통계 보기/.test(el.textContent ?? ''));
    expect(targetIndex).toBeGreaterThanOrEqual(0);
    // 첫 항목(index 0)은 이미 선택돼 있다(팔레트 기본 선택) — 그래서 targetIndex 번만큼만 내려간다.
    for (let i = 0; i < targetIndex; i += 1) {
      await user.keyboard('{ArrowDown}');
    }
    await user.keyboard('{Enter}');

    // 통계 화면이 메인 컬럼을 대체했다 — ShellMain 의 표식(투두 영역)은 사라지고 통계 카드가 보인다.
    expect(await screen.findByRole('heading', { level: 2, name: '통계' })).toBeInTheDocument();
    // 카드 제목은 h3 다(review m9) — "통계"(h2) 아래 항목이라 h2 를 또 쓰면 중복이다.
    expect(screen.getByRole('heading', { level: 3, name: '달성률 추이' })).toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);

    // 키보드만으로 닫는다 — 화면이 뜨면 포커스가 main 랜드마크로 가고(§5), 거기서 Tab 한 번이면
    // 첫 조작 지점인 [통계 닫기] 다.
    await user.keyboard('{Tab}');
    expect(screen.getByRole('button', { name: '통계 닫기' })).toHaveFocus();
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(screen.queryByRole('heading', { level: 2, name: '통계' })).not.toBeInTheDocument(),
    );
    // 원래 화면(ShellMain)으로 돌아왔다 — main 랜드마크는 여전히 하나, id 도 그대로다.
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(document.getElementById('shell-main')).toBe(screen.getByRole('main'));
  });

  it('닫으면 포커스가 열었던 요소(팔레트를 연 지점)로 돌아온다', async () => {
    await mount();
    const skip = screen.getByRole('link', { name: '본문으로 건너뛰기' });
    skip.focus();

    act(() => useReportsStore.getState().openReports());
    await screen.findByRole('heading', { level: 2, name: '통계' });

    act(() => useReportsStore.getState().closeReports());

    await waitFor(() => expect(document.activeElement).toBe(skip));
  });

  it('열었던 요소가 이미 사라졌으면 본문 랜드마크로 돌아온다(대체 대상 없음)', async () => {
    await mount();
    // ShellMain 자체가 통계로 갈리므로 그 안의 옛 opener 는 항상 이 경로를 탄다.
    const openerInsideShellMain = screen.getByRole('main').querySelector('button');
    expect(openerInsideShellMain).not.toBeNull();
    openerInsideShellMain?.focus();

    act(() => useReportsStore.getState().openReports());
    await screen.findByRole('heading', { level: 2, name: '통계' });

    act(() => useReportsStore.getState().closeReports());

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('main')));
  });
});
