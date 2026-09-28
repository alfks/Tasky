// 문서 제목 (app-shell.md R9) — 특히 타이머와 한 자리를 나눠 쓰는 규칙.
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';

import { useShellDocumentTitle } from '@/features/shell/hooks/useShellDocumentTitle';
import { useTimerStore } from '@/features/timer';
import { makeFocusSession } from '@/test/fixtures/focus-session';

const TODAY = '2026-09-16' as DateKey;
const SHELL_TITLE = '9월 16일 (수) · 1/2 · Tasky';

function Probe() {
  useShellDocumentTitle(TODAY, { done: 1, total: 2 });
  return null;
}

function SocialProbe() {
  useShellDocumentTitle(TODAY, { done: 1, total: 2 }, true);
  return null;
}

beforeEach(() => {
  useTimerStore.setState({ session: null, completion: null, todoTitle: null });
  document.title = 'Tasky';
});
afterEach(() => {
  useTimerStore.setState({ session: null, completion: null, todoTitle: null });
  document.title = 'Tasky';
});

describe('useShellDocumentTitle', () => {
  it('친구 화면에서는 친구 제목을 쓰되 실행 중 타이머 제목은 덮지 않는다', () => {
    render(<SocialProbe />);
    expect(document.title).toBe('친구 · Tasky');
    useTimerStore.setState({
      session: makeFocusSession({ startedAt: '2026-09-16T00:00:00.000Z' }),
    });
    document.title = '24:59 · Tasky';
    act(() => {
      useTimerStore.setState({ now: '2026-09-16T00:00:01.000Z' });
    });
    expect(document.title).toBe('24:59 · Tasky');
  });
  it('마운트하면 R9 제목을 쓴다', () => {
    render(<Probe />);
    expect(document.title).toBe(SHELL_TITLE);
  });

  it('타이머 스토어가 움직여도 셸 제목으로 되돌린다 (적재가 제목을 "Tasky" 로 되돌리던 자리)', () => {
    render(<Probe />);
    document.title = 'Tasky';
    act(() => {
      useTimerStore.setState({ now: '2026-09-16T00:00:01.000Z' });
    });
    expect(document.title).toBe(SHELL_TITLE);
  });

  it('세션이 실행 중이면 타이머의 제목을 덮지 않는다 (timer R11 이 이 자리를 쥔다)', () => {
    useTimerStore.setState({
      session: makeFocusSession({ startedAt: '2026-09-16T00:00:00.000Z' }),
      now: '2026-09-16T00:00:01.000Z',
    });
    render(<Probe />);
    const timerTitle = `24:59 · ${SHELL_TITLE}`;
    document.title = timerTitle;
    act(() => {
      useTimerStore.setState({ now: '2026-09-16T00:00:02.000Z' });
    });
    expect(document.title).toBe(timerTitle);
  });

  it('완료 신호가 떠 있으면(깜빡임) 그것도 덮지 않는다 (timer R9 c)', () => {
    useTimerStore.setState({
      session: null,
      completion: {
        session: makeFocusSession({ status: 'completed' }),
        signal: 'full',
        todoTitle: null,
        recordedSeconds: 1500,
      },
    });
    render(<Probe />);
    document.title = '⏰ 끝! · ' + SHELL_TITLE;
    act(() => {
      useTimerStore.setState({ now: '2026-09-16T00:00:03.000Z' });
    });
    expect(document.title).toBe('⏰ 끝! · ' + SHELL_TITLE);
  });
});
