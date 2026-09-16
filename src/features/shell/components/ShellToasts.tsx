'use client';

// 앱 전역 토스트 뷰포트 (app-shell.md R8 · §5). **셸이 한 번만** 마운트한다.
import { useShellToastStore } from '@/features/shell/store/shell-toast-store';

import { ToastViewport } from '@/components/ui/Toast';

export function ShellToasts() {
  const toasts = useShellToastStore((state) => state.toasts);
  const dismissToast = useShellToastStore((state) => state.dismissToast);

  return <ToastViewport toasts={toasts} onClose={dismissToast} />;
}
