// 저장된 테마를 화면에 올리고 OS 테마 변경을 따라가는 훅 (theme R6~R8). 화면에 한 번만 마운트한다.
import { useEffect } from 'react';

import { watchSystemDark } from '@/features/theme/store/theme-dom';
import type { ThemeLoadStatus } from '@/features/theme/store/theme-state';
import { useThemeStore } from '@/features/theme/store/theme-store';

/** 적재 결과. `status === 'error'` 면 저장소를 못 읽은 것이고, 화면은 첫 페인트 값 그대로다. */
export type ThemeSyncState = { status: ThemeLoadStatus; error: string | null };

/**
 * 마운트 시 저장소 값을 읽어 적용하고(첫 페인트 스크립트가 쓴 미러 값을 저장소 값으로 확정한다),
 * `prefers-color-scheme` 변경을 구독한다(R7).
 *
 * `useEffect` 를 쓰는 이유는 파생 상태 동기화가 아니라 **외부 저장소 읽기와 구독**이기 때문이다
 * (code-style §3 이 금지하는 것은 렌더로 계산할 수 있는 값을 effect 로 맞추는 쪽이다).
 * `init` 은 스토어가 `status` 로 한 번만 돌게 막으므로 두 번 마운트돼도 읽기는 한 번이다.
 */
export function useThemeSync(): ThemeSyncState {
  const status = useThemeStore((state) => state.status);
  const error = useThemeStore((state) => state.error);
  const init = useThemeStore((state) => state.init);
  const setSystemDark = useThemeStore((state) => state.setSystemDark);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => watchSystemDark(setSystemDark), [setSystemDark]);

  return { status, error };
}
