/**
 * 컴포넌트 수명 동안 단축키 하나를 등록한다(R1).
 *
 * 핸들러를 ref 에 담는 이유: 호출처가 인라인 화살표 함수를 주는 것이 자연스러운데, 그러면 렌더마다
 * 새 함수가 되어 등록 → 해제 → 등록이 반복된다. 그 사이의 짧은 틈에 눌린 키는 사라지고, 무엇보다
 * 해제·등록이 교차하면 중복 검사가 오탐을 낸다.
 */
import { useEffect, useRef } from 'react';

import { useCommandStore } from '@/features/command/store/command-store';
import type { ShortcutId } from '@/features/command/store/shortcut-catalog';
import type { ShortcutHandler } from '@/features/command/store/shortcut-registry';

type UseShortcutOptions = {
  /** 거짓이면 등록하지 않는다. 조건부 단축키는 `if` 가 아니라 이 옵션으로(훅 규칙). */
  enabled?: boolean;
};

export function useShortcut(
  id: ShortcutId,
  run: ShortcutHandler,
  options?: UseShortcutOptions,
): void {
  const enabled = options?.enabled ?? true;
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });

  useEffect(() => {
    if (!enabled) return undefined;
    return useCommandStore.getState().registerShortcut(id, (e) => latest.current(e));
  }, [id, enabled]);
}

/**
 * 항목 포커스 단축키(R2)를 **도움말에만** 싣는다. 핸들러는 붙지 않는다 — 어떤 항목이 대상인지는
 * 포커스가 정하므로 그 항목의 컴포넌트가 자기 `keydown` 에서 처리한다.
 */
export function useDocumentedShortcuts(ids: readonly ShortcutId[]): void {
  useEffect(() => {
    const register = useCommandStore.getState().registerShortcut;
    const undo = ids.map((id) => register(id));
    return () => undo.forEach((off) => off());
    // ids 는 모듈 상수다. 배열 리터럴을 매번 새로 주면 등록이 매 렌더 재설치된다.
  }, [ids]);
}
