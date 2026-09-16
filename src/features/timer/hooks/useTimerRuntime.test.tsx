// 런타임 배선 (timer R3·R4). 칩과 패널이 함께 마운트돼도 인터벌은 하나여야 하고,
// 탭이 다시 보이는 순간에는 저장소와 다시 맞춰야 한다.
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { resetTimerRuntime, useTimerRuntime } from '@/features/timer/hooks/useTimerRuntime';
import { initialTimerState } from '@/features/timer/store/timer-state';
import { useTimerStore } from '@/features/timer/store/timer-store';

function Consumer() {
  useTimerRuntime();
  return null;
}

let visibility: DocumentVisibilityState = 'visible';

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  resetTimerRuntime();
  useTimerStore.setState(initialTimerState(new Date().toISOString()));
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
});

afterEach(() => {
  resetTimerRuntime();
  vi.restoreAllMocks();
});

describe('useTimerRuntime', () => {
  it('둘이 마운트해도 인터벌·적재는 한 벌뿐이다', () => {
    const setInterval = vi.spyOn(globalThis, 'setInterval');
    const hydrate = vi.spyOn(useTimerStore.getState(), 'hydrate');
    useTimerStore.setState({ hydrate });

    const first = render(<Consumer />);
    const second = render(<Consumer />);

    expect(setInterval).toHaveBeenCalledTimes(1);
    expect(hydrate).toHaveBeenCalledTimes(1);

    const clearInterval = vi.spyOn(globalThis, 'clearInterval');
    first.unmount();
    expect(clearInterval).not.toHaveBeenCalled(); // 아직 한 쪽이 남아 있다
    second.unmount();
    expect(clearInterval).toHaveBeenCalledTimes(1);
  });

  it('탭이 다시 보이면 화면 시각과 저장소를 함께 맞춘다', () => {
    const tick = vi.fn();
    const refresh = vi.fn(async () => {});
    useTimerStore.setState({ tick, refresh });
    render(<Consumer />);

    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(tick).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();

    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(tick).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
