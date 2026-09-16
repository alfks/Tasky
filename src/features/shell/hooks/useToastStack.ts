// 토스트 뷰포트 겹침 방지를 셸 수명에 건다. 자세한 사정은 `lib/toast-stack.ts` 머리주석.
import { useEffect } from 'react';

import { observeToastViewports } from '@/features/shell/lib/toast-stack';

export function useToastStack(): void {
  useEffect(() => observeToastViewports(document), []);
}
