// 패널 슬롯 통합 — 키보드만으로 고르고·시작하고·멈추고·완료 카드를 닫을 수 있는지 (timer §5 완료 조건 3).
// 접근성 규칙(링은 매초 읽지 않는다, 완료 카드의 역할, 전이 후 포커스가 어디로 가는지)도 여기서 본다.
//
// **포커스는 주입하지 않는다.** `button.focus()` 로 자리를 맞춰 주면 "시작 직후 포커스가 어디 있는가" 를
// 한 번도 묻지 않게 되고, 실제로는 `<body>` 로 떨어져 있어도 통과한다(false green).
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adopt } from '@/domain/meta';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { TimerPanelSection } from '@/features/timer/components/TimerPanelSection';
import { resetTimerRuntime } from '@/features/timer/hooks/useTimerRuntime';
import { resetTimerSignals } from '@/features/timer/hooks/useTimerSignals';
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
/** §2 "미완료 투두만" 을 구분할 수 있는 픽스처. 이것이 없으면 필터를 지워도 테스트가 통과한다. */
const TODO_DONE = makeTodo({ seq: 2, date: todayKey(), title: '설거지', done: true });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  jumpTo(0);
  localStorage.clear();
  setRepositories(createMemoryRepositories());
  resetTimerRuntime();
  resetTimerSignals();
  useTimerStore.setState(initialTimerState(new Date().toISOString()));
  await getRepositories().todos.upsert(adopt(TODO));
  await getRepositories().todos.upsert(adopt(TODO_DONE));
  await useTodoStore.getState().loadDate(TODO.date);
});

afterEach(() => {
  resetTimerRuntime();
  resetTimerSignals();
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

    // 누른 `[집중 시작]` 이 사라지는 전이다 — 포커스는 새 화면의 주 버튼으로 넘어와야 한다.
    const pauseButton = await screen.findByRole('button', { name: '일시정지' });
    expect(pauseButton).toHaveFocus();
    expect(screen.getByRole('timer')).toHaveTextContent('25:00');

    jumpTo(300);
    act(() => {
      useTimerStore.getState().tick();
    });
    expect(screen.getByRole('timer')).toHaveTextContent('20:00');

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

    // 포커스를 옮기지 않는 카드는 `alertdialog` 가 아니라 `status` 다 — 역할과 동작이 어긋나면 안 된다.
    const card = await screen.findByRole('status');
    expect(card).toHaveTextContent('집중 25분이 끝나 있었어요');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(before);
  });

  it('링을 감싼 timer 노드에 접근 이름이 있다 (§5)', async () => {
    const user = userEvent.setup();
    render(<TimerPanelSection />);
    await user.click(await screen.findByRole('button', { name: '집중 시작' }));

    const timer = await screen.findByRole('timer');
    expect(timer).toHaveAccessibleName('집중 타이머, 25분 남음');
  });

  it('직접 입력은 1~180 으로 묶여 있다 (§5)', async () => {
    const user = userEvent.setup();
    render(<TimerPanelSection />);
    await user.click(await screen.findByRole('radio', { name: '직접' }));

    const input = screen.getByRole('spinbutton', { name: '분 단위로 입력' });
    expect(input).toHaveAttribute('min', '1');
    expect(input).toHaveAttribute('max', '180');
  });
});

describe('대기 화면 (§2)', () => {
  it('완료한 할 일은 고를 수 없다 — 미완료만 보여 준다', async () => {
    render(<TimerPanelSection />);
    const select = await screen.findByLabelText('집중할 할 일');

    // `getByRole('option')` 은 접힌 select 안을 보지 못한다 — 실제 옵션 목록을 그대로 읽는다.
    const labels = [...(select as HTMLSelectElement).options].map((option) => option.textContent);
    expect(labels).toEqual(['할 일 없이 집중', '장보기']);
  });

  it('중지하면 포커스가 [집중 시작] 으로 돌아온다 (§5 완료 조건 3)', async () => {
    const user = userEvent.setup();
    render(<TimerPanelSection />);
    await user.click(await screen.findByRole('button', { name: '집중 시작' }));

    const stopButton = await screen.findByRole('button', { name: '중지' });
    stopButton.focus();
    await user.keyboard('{Enter}');

    const startButton = await screen.findByRole('button', { name: '집중 시작' });
    expect(startButton).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);
  });

  it('앱을 열자마자 세션이 복원돼도 포커스는 튀지 않는다 (R2·WCAG 3.2.1)', async () => {
    render(<TimerPanelSection />);
    await screen.findByRole('button', { name: '집중 시작' });
    const before = document.activeElement;

    // 사용자가 누른 것이 아니라 저장소에서 이어 붙은 세션이다.
    await act(async () => {
      await useTimerStore.getState().start();
    });

    await screen.findByRole('button', { name: '일시정지' });
    expect(document.activeElement).toBe(before);
  });
});
