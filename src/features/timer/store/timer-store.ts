// 포커스 타이머 스토어 (timer.md). 이 파일은 **조립만** 한다 —
// 상태 모양은 `timer-state.ts`, 시간 이상 처리는 `timer-sync.ts`, 액션은 `timer-actions.ts`,
// 저장 배선은 `timer-writes.ts`, 화면용 파생 값은 `timer-selectors.ts`.
import { create } from 'zustand';

import type { MetaDeps } from '@/domain/meta';

import { createTimerActions, type TimerActions } from '@/features/timer/store/timer-actions';
import { initialTimerState, type TimerState } from '@/features/timer/store/timer-state';

import { nowIso } from '@/lib/date';
import { newId } from '@/lib/id';

export type { TimerActions };

/** 상태 + 액션. 컴포넌트는 selector 로 필요한 조각만 구독한다. */
export type TimerStore = TimerState & TimerActions;

/** 실제 시계·UUID. 테스트는 `createTimerStore(deps)` 로 결정적인 주입기를 쓴다. */
const defaultDeps: MetaDeps = { now: nowIso, id: newId };

/**
 * 스토어 팩토리. 앱은 아래 `useTimerStore` 하나만 쓰고(code-style §4: feature 당 스토어 1개),
 * 테스트가 격리된 인스턴스를 만들 수 있도록 팩토리를 열어 둔다.
 */
export function createTimerStore(deps: MetaDeps = defaultDeps) {
  return create<TimerStore>()((set, get) => ({
    ...initialTimerState(deps.now()),
    ...createTimerActions({ set, get, deps }),
  }));
}

/** 앱이 쓰는 단 하나의 타이머 스토어. */
export const useTimerStore = createTimerStore();
