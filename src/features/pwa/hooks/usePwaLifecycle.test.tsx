// 앱 수명주기 배선(R5·R6·R8). navigator.storage 는 jsdom 에 없어 직접 심는다 —
// 심은 값이 실제 브라우저의 동작과 같은지는 이 테스트가 보장하지 못한다(Chromium 확인은 PR 본문).
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createServiceWorkerEnv, usePwaLifecycle } from '@/features/pwa/hooks/usePwaLifecycle';
import { PWA_MEMORY_KEY } from '@/features/pwa/store/pwa-state';
import { usePwaStore } from '@/features/pwa/store/pwa-store';
import { useTodoStore } from '@/features/todo';

import { pushOverlayLayer } from '@/components/ui/overlay-stack';

const persist = vi.fn();
const estimate = vi.fn();
const register = vi.fn();
const loadDate = vi.fn();
let visibility: DocumentVisibilityState = 'visible';

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

beforeEach(() => {
  persist.mockReset().mockResolvedValue(false);
  estimate.mockReset().mockResolvedValue({ usage: 10, quota: 100 });
  register.mockReset().mockResolvedValue({});
  loadDate.mockReset();
  visibility = 'visible';
  localStorage.clear();
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { persist, estimate },
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: Object.assign(new EventTarget(), { controller: null, register }),
  });
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
  usePwaStore.setState({
    update: 'idle',
    isUpdateDismissed: false,
    persist: 'unknown',
    estimate: null,
    isStorageNoticeDismissed: false,
  });
  useTodoStore.setState({ byId: {}, date: null, status: 'idle', error: null, loadDate });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** `ready` → `ready` 이면서 byId 참조가 바뀌는 전이 = 저장. */
function saveTodo(id: string) {
  act(() => {
    useTodoStore.setState({ byId: { [id]: { id } as never } });
  });
}

describe('서비스워커 등록 (R5)', () => {
  it('개발·테스트 빌드에서는 등록하지 않는다', async () => {
    renderHook(() => usePwaLifecycle());
    await waitFor(() => expect(estimate).toHaveBeenCalled());
    expect(register).not.toHaveBeenCalled();
  });
});

describe('조용한 새로고침 가드 (R4)', () => {
  /**
   * 다른 탭이 업데이트를 적용했을 때 **이 탭을 묻지 않고 리로드해도 되는가**. 뒤집히면 사용자가
   * 입력하던 화면이 말없이 날아간다.
   *
   * 실브라우저로는 칠 수 없는 분기다 — 헤드리스 Chromium 이 `visibilityState` 를 `hidden` 으로
   * 만들지 못한다(`usePwaLifecycle.ts` 의 같은 주석에 시도한 수단이 전부 적혀 있다). 그래서
   * **프로덕션이 실제로 넘기는 env** 를 그대로 받아 그 함수를 직접 부른다. 목으로 갈아 끼우면
   * 이 가드는 한 번도 실행되지 않은 채 초록불이 된다.
   */
  function canReloadSilently(): boolean {
    return createServiceWorkerEnv({} as unknown as ServiceWorkerContainer).canReloadSilently();
  }

  it('보고 있는 탭은 말없이 새로고침하지 않는다', () => {
    visibility = 'visible';
    expect(canReloadSilently()).toBe(false);
  });

  it('숨겨져 있고 열린 오버레이가 없을 때만 조용히 새로고침한다', () => {
    visibility = 'hidden';
    expect(canReloadSilently()).toBe(true);
  });

  it('숨겨져 있어도 편집 패널·대화상자가 열려 있으면 새로고침하지 않는다', () => {
    visibility = 'hidden';
    const pop = pushOverlayLayer({ contains: () => false });
    try {
      expect(canReloadSilently()).toBe(false);
    } finally {
      pop();
    }
  });

  it('보이는 데다 오버레이까지 열려 있으면 당연히 안 된다', () => {
    visibility = 'visible';
    const pop = pushOverlayLayer({ contains: () => false });
    try {
      expect(canReloadSilently()).toBe(false);
    } finally {
      pop();
    }
  });
});

describe('용량 확인 (R7)', () => {
  it('앱 시작 시 1회 읽어 상태에 넣는다', async () => {
    renderHook(() => usePwaLifecycle());
    await waitFor(() => expect(usePwaStore.getState().estimate).toEqual({ usage: 10, quota: 100 }));
    expect(estimate).toHaveBeenCalledTimes(1);
  });
});

describe('지속성 요청 (R6)', () => {
  it('첫 투두 저장 전에는 묻지 않는다', async () => {
    renderHook(() => usePwaLifecycle());
    act(() => {
      useTodoStore.setState({ status: 'ready' });
    });
    await waitFor(() => expect(estimate).toHaveBeenCalled());
    expect(persist).not.toHaveBeenCalled();
  });

  it('적재(loadDate)는 저장이 아니다 — loading 을 거친 전이로는 묻지 않는다', async () => {
    renderHook(() => usePwaLifecycle());
    act(() => {
      useTodoStore.setState({ status: 'loading', byId: {} });
      useTodoStore.setState({ status: 'ready', byId: { a: { id: 'a' } as never } });
    });
    await waitFor(() => expect(estimate).toHaveBeenCalled());
    expect(persist).not.toHaveBeenCalled();
  });

  it('ready 인 채 날짜만 바뀌는 전이는 저장이 아니다 — byId 참조가 그대로다', async () => {
    renderHook(() => usePwaLifecycle());
    act(() => {
      useTodoStore.setState({ status: 'ready', date: '2026-09-16' });
    });
    act(() => {
      useTodoStore.setState({ date: '2026-09-17' });
    });
    await waitFor(() => expect(estimate).toHaveBeenCalled());
    expect(persist).not.toHaveBeenCalled();
  });

  it('첫 저장 직후 1회만 묻고, 거부되면 상태로 드러난다', async () => {
    renderHook(() => usePwaLifecycle());
    act(() => {
      useTodoStore.setState({ status: 'ready' });
    });
    saveTodo('a');
    saveTodo('b');
    await waitFor(() => expect(usePwaStore.getState().persist).toBe('denied'));
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('승인되면 배너를 띄우지 않는다', async () => {
    persist.mockResolvedValue(true);
    renderHook(() => usePwaLifecycle());
    act(() => {
      useTodoStore.setState({ status: 'ready' });
    });
    saveTodo('a');
    await waitFor(() => expect(usePwaStore.getState().persist).toBe('granted'));
  });

  it('이 기기에서 이미 물었으면 다시 묻지 않는다', async () => {
    localStorage.setItem(PWA_MEMORY_KEY, JSON.stringify({ persistAsked: true }));
    renderHook(() => usePwaLifecycle());
    act(() => {
      useTodoStore.setState({ status: 'ready' });
    });
    saveTodo('a');
    await waitFor(() => expect(estimate).toHaveBeenCalled());
    expect(persist).not.toHaveBeenCalled();
  });

  it('배너를 닫으면 기기별 기억에 남는다', async () => {
    const { result } = renderHook(() => usePwaLifecycle());
    act(() => {
      result.current.dismissStorageNotice();
    });
    expect(usePwaStore.getState().isStorageNoticeDismissed).toBe(true);
    expect(localStorage.getItem(PWA_MEMORY_KEY)).toContain('"noticeDismissed":true');
  });

  it('배너를 닫는다고 "물어봤다" 로 기록하지는 않는다', async () => {
    // 닫기가 persistAsked 까지 켜 버리면, 아직 묻지 않은 기기에서 R6 요청이 통째로 건너뛰어진다.
    const { result } = renderHook(() => usePwaLifecycle());
    act(() => {
      result.current.dismissStorageNotice();
    });
    expect(localStorage.getItem(PWA_MEMORY_KEY)).toContain('"persistAsked":false');
  });
});

describe('다중 탭 재조회 (R8)', () => {
  it('다시 보이면 선택 날짜를 재조회한다', () => {
    useTodoStore.setState({ date: '2026-09-16' });
    renderHook(() => usePwaLifecycle());
    setVisibility('hidden');
    expect(loadDate).not.toHaveBeenCalled();
    setVisibility('visible');
    expect(loadDate).toHaveBeenCalledWith('2026-09-16');
  });

  it('선택된 날짜가 없으면 재조회하지 않는다', () => {
    renderHook(() => usePwaLifecycle());
    setVisibility('visible');
    expect(loadDate).not.toHaveBeenCalled();
  });

  it('언마운트 뒤에는 듣지 않는다', () => {
    useTodoStore.setState({ date: '2026-09-16' });
    const { unmount } = renderHook(() => usePwaLifecycle());
    unmount();
    setVisibility('visible');
    expect(loadDate).not.toHaveBeenCalled();
  });
});
