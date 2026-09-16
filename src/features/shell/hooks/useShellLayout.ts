// 지금 폭이 어느 갈래인지 (app-shell.md §2-B · R4). 화면에 한 번만 마운트하고 prop 으로 내린다 —
// 여러 컴포넌트가 각자 구독하면 리사이즈 한 번에 리스너가 그 수만큼 돈다.
import { useEffect, useState } from 'react';

import { layoutFor, type ShellLayout } from '@/features/shell/lib/layout';

/** `window` 가 없는 런타임(단위 테스트의 일부)에서는 가장 넓은 갈래로 본다. */
function currentLayout(): ShellLayout {
  return typeof window === 'undefined' ? 'wide' : layoutFor(window.innerWidth);
}

export function useShellLayout(): ShellLayout {
  const [layout, setLayout] = useState<ShellLayout>(currentLayout);

  useEffect(() => {
    // 첫 렌더와 마운트 사이에 폭이 달라졌을 수 있다(스크롤바 등장 등) — 한 번 맞추고 시작한다.
    const sync = (): void => setLayout(currentLayout());
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  return layout;
}
