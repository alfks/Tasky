'use client';

// 앱 전역 토스트 뷰포트 (app-shell.md R8 · §5). **앱을 통틀어 여기 한 번만** 마운트한다.
//
// T-30 전에는 뷰포트가 다섯이었다(여기 + `TodoList`·`CategoryRemoveDialog`·`BackupLauncher`·
// `PwaNotices`). 그래서 R8 "동시에 1개" 는 셸 것만 제한했고 실 Chromium 에서 **두 장이 동시에**
// 떴다(투두 삭제 + 카테고리 삭제, 1440px). 이제 모두 `components/ui/Toast.tsx` 의 허브로 들어오고
// 화면에 남는 수는 그 허브가 자른다.
import { useEffect } from 'react';

import { useShellToastStore } from '@/features/shell/store/shell-toast-store';

import { ToastViewport, dismissToast, pushToast, useToasts } from '@/components/ui/Toast';

/**
 * 셸 스토어로 들어온 토스트를 허브로 옮기고 스토어를 비운다.
 *
 * `store/shell-toast-store.ts` 는 T-30 의 `owns` 밖이고, 그것을 쓰는 호출부 둘
 * (`AppShell` 의 요약 실패 · `useTodoDropToDate` 의 날짜 이동 되돌리기)도 마찬가지다. 저장소가
 * 둘로 남으면 각자 한 장씩 들고 있어 R8 이 다시 깨지므로, 스토어를 **받기만 하는 함**으로 쓰고
 * 실제 상태는 허브 하나에 둔다. 호출부 둘이 허브를 직접 부르게 바뀌면 이 훅과 스토어를 함께 지운다.
 */
function useShellToastInbox(): void {
  const inbox = useShellToastStore((state) => state.toasts);
  const clearToasts = useShellToastStore((state) => state.clearToasts);

  useEffect(() => {
    if (inbox.length === 0) return;
    for (const { id: _storeId, ...toast } of inbox) pushToast(toast);
    clearToasts();
  }, [inbox, clearToasts]);
}

export function ShellToasts() {
  useShellToastInbox();
  const toasts = useToasts();

  return <ToastViewport toasts={toasts} onClose={dismissToast} />;
}
