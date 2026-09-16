// 패널 슬롯 통합 — 키보드만으로 고르고·시작하고·멈추고·완료 카드를 닫을 수 있는지 (timer §5 완료 조건 3).
// 접근성 규칙(링은 매초 읽지 않는다, 완료 카드는 alertdialog)도 여기서 본다.
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adopt } from '@/domain/meta';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { TimerPanelSection } from '@/features/timer/components/TimerPanelSection';
import { resetTimerRuntime } from '@/features/timer/hooks/useTimerRuntime';
import { initialTimerState } from '@/features/timer/store/timer-state';
import { useTimerStore } from '@/features/timer/store/timer-store';
import { useTodoStore } from '@/features/todo';
import { makeTodo } from '@/test/fixtures/todo';

import { todayKey } from '@/lib/date';

const START_MS = Date.parse('2026-09-16T09:00:00.000Z');
const jumpTo = (seconds: number): void => {
  vi.setSystemTime(new Date(START_MS + seconds * 1000));
};

const TODO = makeTodo({ date: todayKey(), title: '장보기' });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  jumpTo(0);
  localStorage.clear();
  setRepositories(createMemoryRepositories());
  resetTimerRuntime();
  useTimerStore.setState(initialTimerState(new Date().toISOString()));
  await getRepositories().todos.upsert(adopt(TODO));
  await useTodoStore.getState().loadDate(TODO.date);
});

afterEach(() => {
  resetTimerRuntime();
  vi.useRealTimers();
});

describe('키보드만으로 한 바퀴', () => {
  it('할 일 선택 → 시작 → 일시정지 → 완료 카드 닫기', async () => {
    const user = userEvent.setup();
    render(<TimerPanelSection />);

    const todoSelect = await screen.findByLabelText('집중할 할 일');
    await user.tab();
    expect(todoSelect).toHaveFocus();
    await user.selectOptions(todoSelect, TODO.id);

    await user.tab(); // 라디오 그룹은 선택된 항목 하나가 탭 정지점이다
    expect(screen.getByRole('radio', { name: '25분' })).toHaveFocus();

    await user.tab(); // 소리 토글
    expect(screen.getByRole('checkbox', { name: '끝났을 때 소리로 알리기' })).toHaveFocus();

    await user.tab();
    const startButton = screen.getByRole('button', { name: '집중 시작' });
    expect(startButton).toHaveFocus();
    await user.keyboard('{Enter}');

    const pauseButton = await screen.findByRole('button', { name: '일시정지' });
    expect(screen.getByRole('timer')).toHaveTextContent('25:00');

    jumpTo(300);
    act(() => {
      useTimerStore.getState().tick();
    });
    expect(screen.getByRole('timer')).toHaveTextContent('20:00');

    pauseButton.focus();
    await user.keyboard(' ');
    await screen.findByRole('button', { name: '재개' });

    // 일시정지 중에는 시간이 흐르지 않는다.
    jumpTo(900);
    act(() => {
      useTimerStore.getState().tick();
    });
    expect(screen.getByRole('timer')).toHaveTextContent('20:00');

    await user.click(screen.getByRole('button', { name: '재개' }));
    jumpTo(2100); // 재개 후 계획 시간을 다 채운다(600초 멈춰 있었다)
    act(() => {
      useTimerStore.getState().tick();
    });

    const card = await screen.findByRole('alertdialog');
    expect(card).toHaveTextContent('집중 25분 끝!');
    expect(card).toHaveTextContent('장보기에 25분을 기록했어요');
    expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});

describe('접근성 (§5)', () => {
  it('링은 매초 읽히지 않고, 낭독은 별도 polite 영역이 맡는다', async () => {
    const user = userEvent.setup();
    render(<TimerPanelSection />);
    await user.click(await screen.findByRole('button', { name: '집중 시작' }));

    const timer = await screen.findByRole('timer');
    expect(timer).toHaveAttribute('aria-live', 'off');

    const live = document.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    await waitFor(() => expect(live).toHaveTextContent('집중 25분 시작'));
  });

  it('오래된 완료 카드는 포커스를 빼앗지 않는다 (R9-a 의 취지)', async () => {
    render(<TimerPanelSection />);
    await screen.findByRole('button', { name: '집중 시작' });
    const before = document.activeElement;

    act(() => {
      useTimerStore.setState({
        completion: {
          session: { ...TODO, plannedSeconds: 1500 } as never,
          signal: 'record-only',
          todoTitle: '장보기',
          recordedSeconds: 1500,
        },
      });
    });

    const card = await screen.findByRole('alertdialog');
    expect(card).toHaveTextContent('집중 25분이 끝나 있었어요');
    expect(document.activeElement).toBe(before);
  });
});
