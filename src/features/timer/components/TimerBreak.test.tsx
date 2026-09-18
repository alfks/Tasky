// 휴식 화면·카드 (timer P2·P3·P4). 패널 슬롯 전체를 띄우고 **역할과 접근 이름으로만** 본다.
//
// 시계는 `TimerPanelSection.test.tsx` 와 같은 방식으로 **`Date` 만** 가짜로 세운다. 실시간으로
// 5분을 기다리는 테스트는 부하에서 깨지고(T-55), 여기서는 `jumpTo` + `tick()` 이 그 자리를 대신한다.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { TimerPanelSection } from '@/features/timer/components/TimerPanelSection';
import { resetTimerRuntime } from '@/features/timer/hooks/useTimerRuntime';
import { resetTimerSignals } from '@/features/timer/hooks/useTimerSignals';
import { initialTimerState } from '@/features/timer/store/timer-state';
import { useTimerStore } from '@/features/timer/store/timer-store';

const START_MS = Date.parse('2026-09-16T09:00:00.000Z');
const iso = (seconds: number): string => new Date(START_MS + seconds * 1000).toISOString();
const jumpTo = (seconds: number): void => {
  vi.setSystemTime(new Date(START_MS + seconds * 1000));
};

/** 5분짜리 짧은 휴식이 막 시작된 상태. */
function startBreak(): void {
  useTimerStore.setState({
    pomodoro: true,
    breakSession: { kind: 'short', startedAt: iso(0), plannedSeconds: 300 },
    now: iso(0),
  });
}

/** 한 틱을 돌린다 — 실제 인터벌을 기다리지 않고 같은 경로(`tick`)를 밟는다. */
function tickAt(seconds: number): void {
  jumpTo(seconds);
  act(() => {
    useTimerStore.getState().tick();
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  jumpTo(0);
  localStorage.clear();
  setRepositories(createMemoryRepositories());
  resetTimerRuntime();
  resetTimerSignals();
  useTimerStore.setState(initialTimerState(new Date().toISOString()));
});

afterEach(() => {
  resetTimerRuntime();
  resetTimerSignals();
  vi.useRealTimers();
});

describe('휴식 화면 (P2)', () => {
  it('대기 화면 대신 휴식 타이머가 서고, 남은 시간이 이름에 들어간다', () => {
    render(<TimerPanelSection />);
    act(startBreak);

    const timer = screen.getByRole('timer');
    expect(timer).toHaveAccessibleName('짧은 휴식, 5분 남음');
    expect(timer).toHaveTextContent('5:00');
    // 휴식 중에 길이를 다시 고르게 하면 지금 무엇이 도는지가 흐려진다.
    expect(screen.queryByRole('button', { name: '집중 시작' })).not.toBeInTheDocument();
  });

  it('링은 매초 낭독되지 않는다 (§5)', () => {
    render(<TimerPanelSection />);
    act(startBreak);

    expect(screen.getByRole('timer')).toHaveAttribute('aria-live', 'off');
  });

  it('시간이 지나면 표시가 따라 내려간다', () => {
    render(<TimerPanelSection />);
    act(startBreak);

    tickAt(60);
    expect(screen.getByRole('timer')).toHaveTextContent('4:00');
    expect(screen.getByRole('timer')).toHaveAccessibleName('짧은 휴식, 4분 남음');
  });

  it('긴 휴식은 그렇게 말한다', () => {
    render(<TimerPanelSection />);
    act(() => {
      useTimerStore.setState({
        pomodoro: true,
        breakSession: { kind: 'long', startedAt: iso(0), plannedSeconds: 900 },
        now: iso(0),
      });
    });

    expect(screen.getByRole('timer')).toHaveAccessibleName('긴 휴식, 15분 남음');
  });
});

describe('구간 전환은 낭독된다 (§5·P3·P4)', () => {
  it('휴식이 시작되면 그 사실이 라이브 영역에 들어간다', async () => {
    render(<TimerPanelSection />);
    act(startBreak);

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('짧은 휴식 5분 시작')).toBeInTheDocument();
  });

  it('휴식이 끝나면 다음 걸음을 말한다', async () => {
    render(<TimerPanelSection />);
    act(startBreak);
    tickAt(300);

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('휴식이 끝났어요, 다음 집중을 시작할 수 있어요')).toBeInTheDocument();
  });
});

describe('끝난 휴식 카드 (P3·P4)', () => {
  it('막 끝나면 카드가 뜨고 초기 포커스는 파괴적이지 않은 쪽이다', () => {
    render(<TimerPanelSection />);
    act(startBreak);
    tickAt(300);

    const card = screen.getByRole('alertdialog');
    expect(card).toHaveAccessibleName('짧은 휴식 끝!');
    // `Enter` 를 잘못 눌러 집중이 시작되지 않게 `[나중에]` 가 첫 포커스다.
    expect(screen.getByRole('button', { name: '나중에' })).toHaveFocus();
  });

  it('다음 집중은 사용자가 눌러야 시작된다', async () => {
    const user = userEvent.setup();
    render(<TimerPanelSection />);
    act(startBreak);
    tickAt(300);

    // 카드가 떠 있는 동안에는 아직 아무 세션도 없다.
    expect(useTimerStore.getState().session).toBeNull();

    await user.click(screen.getByRole('button', { name: '다음 집중 시작' }));
    expect(useTimerStore.getState().session).not.toBeNull();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('Esc 로 닫으면 대기 화면으로 돌아간다', async () => {
    const user = userEvent.setup();
    render(<TimerPanelSection />);
    act(startBreak);
    tickAt(300);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '집중 시작' })).toBeInTheDocument();
  });
});

describe('휴식에서 빠져나가기 (P3)', () => {
  it('끝내면 대기 화면으로 돌아가고 포커스가 그 화면의 주 버튼으로 넘어간다', async () => {
    const user = userEvent.setup();
    render(<TimerPanelSection />);
    act(startBreak);

    await user.click(screen.getByRole('button', { name: '휴식 끝내기' }));

    const start = screen.getByRole('button', { name: '집중 시작' });
    expect(start).toBeInTheDocument();
    // 누른 버튼이 사라지는 전이다 — 그대로 두면 포커스가 `<body>` 로 떨어진다.
    expect(start).toHaveFocus();
  });

  it('건너뛰고 바로 집중할 수 있다', async () => {
    const user = userEvent.setup();
    render(<TimerPanelSection />);
    act(startBreak);

    await user.click(screen.getByRole('button', { name: '건너뛰고 집중' }));

    expect(useTimerStore.getState().breakSession).toBeNull();
    expect(useTimerStore.getState().session).not.toBeNull();
  });
});

describe('완료 카드와의 관계 (P3)', () => {
  it('휴식이 도는 동안 완료 카드는 기록만 말한다', () => {
    render(<TimerPanelSection />);
    act(() => {
      startBreak();
      useTimerStore.setState({
        completion: {
          session: {
            id: 'f1',
            createdAt: iso(0),
            updatedAt: iso(0),
            rev: 1,
            date: '2026-09-16',
            plannedSeconds: 1500,
            startedAt: iso(-1500),
            pausedTotalSeconds: 0,
            elapsedSeconds: 1500,
            status: 'completed',
          },
          signal: 'full',
          todoTitle: null,
          recordedSeconds: 1500,
        },
      });
    });

    expect(screen.getByRole('alertdialog', { name: '집중 25분 끝!' })).toBeInTheDocument();
    // 다음 걸음은 휴식 화면이 말한다 — 두 화면이 서로 다른 곳을 가리키지 않게.
    expect(screen.queryByRole('button', { name: '5분 더' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다음 할 일 고르기' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument();
  });
});
