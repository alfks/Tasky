// 앱 전역 토스트 허브 (app-shell.md R8: 하단 중앙 · 액션 6초 / 무액션 3초 · 동시 1개).
//
// **뷰포트는 셸이 하나만 마운트한다**(`ShellToasts`). feature 는 자기 뷰포트를 띄우지 말고 여기에
// 밀어 넣는다 — 지금 그러지 못하는 넷의 사정은 `lib/toast-stack.ts` 머리주석에 적었다.
//
// 슬롯을 하나로 두지 **않는다**: 배열로 갖되 화면에 남는 수를 `MAX_VISIBLE` 로 제한한다. 슬롯 하나면
// 앞 토스트의 `[되돌리기]` 가 뒤 토스트로 바뀌는 순간 사용자가 누르려던 대상이 사라진다. 배열이면
// 오래된 것부터 밀려나므로 눌리는 것과 보이는 것이 항상 같다.
import { create } from 'zustand';

import type { ToastItem } from '@/components/ui/Toast';

/** R8 "동시에 1개" 의 이행. 새 토스트가 오면 오래된 것을 밀어낸다. */
export const MAX_VISIBLE_TOASTS = 1;

export type ShellToastState = {
  toasts: readonly ToastItem[];
  /** 띄운 토스트의 id — 호출부가 나중에 직접 닫고 싶을 때 쓴다. */
  pushToast: (toast: Omit<ToastItem, 'id'>) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
};

let sequence = 0;

export const useShellToastStore = create<ShellToastState>((set) => ({
  toasts: [],
  pushToast: (toast) => {
    sequence += 1;
    const id = `shell-toast-${sequence}`;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }].slice(-MAX_VISIBLE_TOASTS) }));
    return id;
  },
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  clearToasts: () => set({ toasts: [] }),
}));
