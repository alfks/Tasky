// 조립된 앱에서의 업데이트 토스트 (pwa.md R4).
//
// **왜 셸을 통째로 마운트하는 별도 파일인가**: `PwaNotices.test.tsx` 는 PWA 슬라이스만 세운다.
// 그 세계에는 커맨드 레이어가 없어 오버레이 스택이 비어 있고, 그래서 "오버레이가 닫히면 띄운다" 가
// 언제나 통과한다. 실제 앱에는 셸이 `CommandLayer` 를 상주시키는데 그것이 스택에 **DOM 없는 레이어**
// 하나를 앱 수명 내내 눌러 두어, 스택이 비는 순간이 없었다 — 토스트가 영영 뜨지 않았다(T-44,
// 실측 `overlayLayerCount() === 1` 상수). 단독 테스트로는 잡히지 않는 조립 버그라 여기서 잡는다.
import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { useCategoryStore } from '@/features/category';
import { useCommandStore } from '@/features/command';
import { useDateStripStore } from '@/features/date-strip';
import { UPDATE_NOTICE_TEXT } from '@/features/pwa/store/pwa-state';
import { usePwaStore } from '@/features/pwa/store/pwa-store';
import { AppShell } from '@/features/shell';
import { useTodoStore } from '@/features/todo';

import { overlayLayerCount } from '@/components/ui/overlay-stack';

const TODAY = '2026-09-16' as DateKey;

/** `useOverlayDeferral` 의 폴링 간격(400ms)보다 넉넉하게 — 실타이머로 돌린다. */
const WAIT = { timeout: 3_000 } as const;

function setUpdateWaiting(): void {
  act(() => {
    usePwaStore.getState().setUpdateStage('waiting');
  });
}

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  useCategoryStore.setState({ byId: {}, status: 'ready', error: null });
  useTodoStore.setState({ byId: {}, date: null, status: 'idle', error: null });
  useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });
  usePwaStore.setState({
    update: 'idle',
    isUpdateDismissed: false,
    persist: 'unknown',
    estimate: null,
    isStorageNoticeDismissed: false,
  });
});

afterEach(() => {
  usePwaStore.setState({ update: 'idle' });
  useCommandStore.setState({ helpOpen: false, paletteOpen: false });
});

describe('조립된 앱의 업데이트 토스트 (R4)', () => {
  it('아무 오버레이도 열려 있지 않으면 오버레이 스택이 비어 있다', () => {
    render(<AppShell />);
    // 이 숫자가 0 이 아니면 아래 두 테스트는 **원인을 모른 채** 실패한다 — 그래서 따로 잰다.
    expect(overlayLayerCount()).toBe(0);
  });

  it('오버레이가 없으면 뜬다 — 앱이 살아 있는 내내 미뤄지지 않는다', async () => {
    render(<AppShell />);
    setUpdateWaiting();
    await waitFor(() => {
      expect(screen.getByText(UPDATE_NOTICE_TEXT)).toBeInTheDocument();
    }, WAIT);
  });

  it('대화상자가 떠 있는 동안에는 미루고, 닫으면 띄운다', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    // 진짜 오버레이(단축키 도움말)를 키보드로 연다 — 가짜 레이어를 밀어 넣지 않는다.
    await user.keyboard('?');
    await screen.findByRole('dialog', { name: '단축키' });
    expect(overlayLayerCount()).toBe(1);

    setUpdateWaiting();
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(screen.queryByText(UPDATE_NOTICE_TEXT)).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.getByText(UPDATE_NOTICE_TEXT)).toBeInTheDocument();
    }, WAIT);
  });
});
