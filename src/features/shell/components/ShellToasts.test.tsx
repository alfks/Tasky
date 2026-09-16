// 토스트 **배선** 테스트 (app-shell.md R8 · T-30).
//
// 왜 따로 있나. `lib/toast-stack.ts`·`lib/top-notice.ts` 는 단위 테스트가 촘촘한데 "셸에 실제로
// 걸려 있는가" 는 아무도 재지 않았다 — PR #33 리뷰의 변이 ②(두 모듈을 통째로 끊기)가 전 스위트를
// 초록으로 통과했다. 여기서는 모듈 안이 아니라 **앱을 통째로 마운트한 뒤 결과**만 본다:
// 뷰포트가 하나인가 · feature 넷의 토스트가 그 하나로 오는가 · 셸이 잰 값이 문서에 올라가는가.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';
import { adopt } from '@/domain/meta';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { useBackupStore } from '@/features/backup';
import { useCategoryStore } from '@/features/category';
import { useDateStripStore } from '@/features/date-strip';
import { usePwaStore } from '@/features/pwa';
import { AppShell } from '@/features/shell/components/AppShell';
import { BOTTOM_BAR_ATTR } from '@/features/shell/components/ShellMain';
import { TOAST_BOTTOM_RESERVE_VAR, TOAST_STACK_GAP_PX } from '@/features/shell/lib/toast-stack';
import { useShellStorageStore } from '@/features/shell/store/shell-storage-store';
import { useShellToastStore } from '@/features/shell/store/shell-toast-store';
import { useShellUiStore } from '@/features/shell/store/shell-ui-store';
import { useTimerStore } from '@/features/timer';
import { useTodoStore } from '@/features/todo';
import { makeCategory } from '@/test/fixtures/category';
import { makeTodo } from '@/test/fixtures/todo';

import { OVERLAY_ALWAYS_LIVE_ATTR } from '@/components/ui/overlay-rules';
import { clearToasts, getToasts } from '@/components/ui/Toast';

const TODAY = '2026-09-16' as DateKey;
const STUDY = makeCategory({ seq: 1, order: 0, name: '공부' });

function setWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
}

async function mount(): Promise<void> {
  render(<AppShell />);
  await screen.findByRole('main');
}

const viewports = (): NodeListOf<Element> =>
  document.querySelectorAll(`[${OVERLAY_ALWAYS_LIVE_ATTR}]`);

const reserve = (): string =>
  document.documentElement.style.getPropertyValue(TOAST_BOTTOM_RESERVE_VAR);

beforeEach(async () => {
  vi.restoreAllMocks();
  setWidth(1440);
  clearToasts();
  document.documentElement.style.removeProperty(TOAST_BOTTOM_RESERVE_VAR);
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
  usePwaStore.setState({
    update: 'idle',
    isUpdateDismissed: false,
    persist: 'unknown',
    estimate: null,
    isStorageNoticeDismissed: false,
  });
  useBackupStore.setState({ result: null });

  const repositories = createMemoryRepositories();
  setRepositories(repositories);
  await repositories.categories.upsert(adopt(STUDY));
  await repositories.todos.upsert(adopt(makeTodo({ seq: 1, categoryId: STUDY.id, date: TODAY })));
  useCategoryStore.setState({ byId: { [STUDY.id]: STUDY }, status: 'ready', error: null });
  useTodoStore.setState({ byId: {}, date: null, status: 'idle', error: null });
});

describe('뷰포트는 앱에 하나뿐이다 (R8)', () => {
  it('셸을 통째로 마운트해도 라이브 영역 묶음은 한 벌이다', async () => {
    await mount();
    expect(viewports()).toHaveLength(1);
    // 상주 영역 둘(polite·assertive)은 그 하나 안에 있다.
    expect(viewports()[0]?.querySelectorAll('[aria-live]')).toHaveLength(2);
  });

  it('feature 가 띄운 토스트가 그 하나에 들어온다 — 백업 결과', async () => {
    await mount();
    act(() => {
      useBackupStore.setState({
        result: {
          counts: { added: 20, updated: 3, kept: 289 },
          source: { categories: 4, todos: 312 },
        },
      });
    });
    const toast = await screen.findByText(/가져왔어요/);
    expect(viewports()[0]).toContainElement(toast);
    expect(viewports()).toHaveLength(1);
  });

  it('feature 가 띄운 토스트가 그 하나에 들어온다 — 투두 쓰기 실패', async () => {
    await mount();
    act(() => {
      useTodoStore.setState({ error: '저장하지 못했어요. 다시 시도해 주세요', status: 'ready' });
    });
    const toast = await screen.findByText('저장하지 못했어요. 다시 시도해 주세요');
    expect(viewports()[0]).toContainElement(toast);
    expect(viewports()).toHaveLength(1);
  });

  it('feature 가 띄운 토스트가 그 하나에 들어온다 — 셸(날짜 이동 되돌리기)', async () => {
    await mount();
    act(() => {
      useShellToastStore.getState().pushToast({ message: '9월 18일로 옮겼어요' });
    });
    const toast = await screen.findByText('9월 18일로 옮겼어요');
    expect(viewports()[0]).toContainElement(toast);
    // 셸 스토어는 받기만 하는 함이다 — 허브로 옮기고 비운다(저장소가 둘이면 R8 이 다시 깨진다).
    await waitFor(() => expect(useShellToastStore.getState().toasts).toHaveLength(0));
  });
});

describe('동시에 1개 (R8) — T-30 이 고친 것', () => {
  // T-30 전 실측(실 Chromium 1440×900): 투두 삭제 직후 카테고리를 지우면 **두 장이 동시에** 떴다
  // (뷰포트 5개 중 2개가 내용을 들고 있었다). 여기서는 같은 상황을 두 feature 의 스토어로 만든다.
  it('서로 다른 feature 의 토스트가 겹쳐도 화면에는 한 장만 남는다', async () => {
    await mount();
    act(() => {
      useShellToastStore.getState().pushToast({ message: '먼저 뜬 토스트' });
    });
    await screen.findByText('먼저 뜬 토스트');
    act(() => {
      useBackupStore.setState({
        result: { counts: { added: 1, updated: 0, kept: 0 }, source: { categories: 1, todos: 1 } },
      });
    });
    await screen.findByText(/가져왔어요/);
    await waitFor(() => expect(getToasts()).toHaveLength(1));
    expect(screen.queryByText('먼저 뜬 토스트')).not.toBeInTheDocument();
    expect(viewports()).toHaveLength(1);
  });
});

describe('셸이 잰 값이 문서에 올라간다 (useToastStack 배선)', () => {
  it('하단 고정 막대가 있으면 그 높이만큼 CSS 변수를 올린다', async () => {
    // jsdom 은 레이아웃이 없어 높이가 0 이다 — 막대에만 높이를 주입한다.
    const rect = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      if (this.hasAttribute(BOTTOM_BAR_ATTR)) return { height: 53 } as DOMRect;
      return rect.call(this);
    });
    setWidth(400);
    await mount();
    await waitFor(() => expect(document.querySelector(`[${BOTTOM_BAR_ATTR}]`)).not.toBeNull());
    await waitFor(() => expect(reserve()).toBe(`${53 + TOAST_STACK_GAP_PX}px`));
  });

  it('넓은 화면에는 막대가 없으므로 자리를 비우지 않는다', async () => {
    await mount();
    expect(document.querySelector(`[${BOTTOM_BAR_ATTR}]`)).toBeNull();
    expect(reserve()).toBe('');
  });
});

describe('상단 알림 앵커 (top-notice 배선)', () => {
  it('PwaNotices 의 표식을 셸이 찾아 그만큼 자리를 비운다', async () => {
    const rect = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      if (this.parentElement?.hasAttribute('data-top-notice') === true) {
        return { bottom: 72 } as DOMRect;
      }
      return rect.call(this);
    });
    await mount();
    const spacer = document.querySelector<HTMLElement>('[data-shell-notice-spacer]');
    expect(spacer).not.toBeNull();
    expect(spacer?.style.height).toBe('0px');
    act(() => {
      usePwaStore.getState().setPersistState('denied');
    });
    await screen.findByText(/저장 공간을 보장하지 않아요/);
    await waitFor(() => expect(spacer?.style.height).toBe('80px'));
  });
});

describe('되돌리기 도달 가능성 (R8 · T-20 라운드 1 이 고친 것)', () => {
  it('카테고리 삭제 뒤 포커스가 [되돌리기] 로 간다 — 허브를 거쳐도 그대로다', async () => {
    const user = userEvent.setup();
    // 미완료 투두가 없는 카테고리여야 축약(R11) 확인 한 번으로 지워진다. 옮길 곳도 하나 둔다.
    const REST = makeCategory({ seq: 2, order: 1, name: '쉼' });
    const repositories = createMemoryRepositories();
    setRepositories(repositories);
    await repositories.categories.upsert(adopt(STUDY));
    await repositories.categories.upsert(adopt(REST));
    useCategoryStore.setState({
      byId: { [STUDY.id]: STUDY, [REST.id]: REST },
      status: 'ready',
      error: null,
    });
    useTodoStore.setState({ byId: {}, date: null, status: 'idle', error: null });

    await mount();
    const nav = screen.getByRole('navigation');
    await user.click(within(nav).getAllByRole('button', { name: /메뉴/ })[0] as HTMLElement);
    await user.click(await screen.findByRole('menuitem', { name: /삭제/ }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /^삭제$/ }));

    const undo = await screen.findByRole('button', { name: '되돌리기' });
    await waitFor(() => expect(undo).toHaveFocus());
  });
});
