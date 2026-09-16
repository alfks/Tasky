// 테마 스토어 (theme.md §3-E R6~R8). 모드·강조색을 저장소에 쓰고, 화면·미러에 반영한다.
//
// 이 파일은 **조립과 액션만** 한다. 상태 모양과 순수 변환은 `theme-state.ts`, DOM·localStorage 는
// `theme-dom.ts`, 첫 페인트 스크립트는 `theme-init-script.ts` 다. 값 변경 규칙(검증·`touch`)은
// `@/domain/theme/settings.rules` 가 갖고 있고 여기서 복제하지 않는다.
//
// **낙관적이다**: 모드·강조색은 누른 자리에서 바로 바뀌어야 하고, 저장이 실패해도 화면을 되돌리지
// 않는다(theme §2 "저장 실패 시 화면은 바뀐 채 토스트, 새로고침 시 이전 값"). 되돌리지 않는 대신
// **미러를 쓰지 않아서** 새로고침하면 저장소에 남은 이전 값으로 돌아간다 — 그 두 문장이 한 쌍이다.
import { create } from 'zustand';

import type { MetaDeps, Persistable } from '@/domain/meta';
import { DEFAULT_ACCENT_COLOR, isPaletteColor } from '@/domain/theme/palette';
import type { Settings, ThemeMode } from '@/domain/theme/settings';
import {
  createSettings,
  setAccentColor as setAccentColorRule,
  setThemeMode as setThemeModeRule,
} from '@/domain/theme/settings.rules';

import { getRepositories } from '@/repositories/container';

import {
  applyTheme,
  readMirror,
  readSystemDark,
  writeMirror,
} from '@/features/theme/store/theme-dom';
import {
  appliedTheme,
  COLOR_REJECTED,
  LOAD_FAILED,
  SAVE_FAILED,
  toMirror,
  type ThemeState,
} from '@/features/theme/store/theme-state';

import { nowIso } from '@/lib/date';
import { newId } from '@/lib/id';

/** 스토어의 액션 부분. 쓰기 액션은 저장 성공 여부를 돌려준다(화면은 실패해도 바뀐 채 남는다). */
export type ThemeActions = {
  /** 미러 → 저장소 순으로 읽어 화면에 적용한다. 화면당 한 번(`useThemeSync`). */
  init: () => Promise<void>;
  /** 모드 변경 (R6). `system` 이면 OS 를 따라간다(R7). */
  setMode: (mode: ThemeMode) => Promise<boolean>;
  /** 강조색 변경 (R3). 팔레트 12색 밖의 값은 도메인 규칙이 거부한다. */
  setAccentColor: (hex: string) => Promise<boolean>;
  /** OS 테마 변경 알림 (R7). 저장하지 않는다 — OS 상태는 우리 값이 아니다. */
  setSystemDark: (dark: boolean) => void;
};

export type ThemeStore = ThemeState & ThemeActions;

const initialState: ThemeState = {
  mode: 'system',
  accentColor: DEFAULT_ACCENT_COLOR,
  systemDark: false,
  status: 'idle',
  error: null,
};

const defaultDeps: MetaDeps = { now: nowIso, id: newId };

/** 저장소의 설정 행. 없으면 기본값을 만들어 넣는다 — 레포지토리는 값을 만들지 않는다(ADR-0005). */
async function loadOrCreateSettings(deps: MetaDeps): Promise<Settings> {
  const repository = getRepositories().settings;
  const found = await repository.get();
  if (found !== undefined) return found;
  const created = createSettings(deps);
  await repository.upsert(created);
  return created;
}

/**
 * 스토어 팩토리. 앱은 아래 `useThemeStore` 하나만 쓰고(code-style §4: feature 당 스토어 1개),
 * 테스트가 결정적인 `deps` 로 격리된 인스턴스를 만들 수 있도록 팩토리를 열어 둔다.
 */
export function createThemeStore(deps: MetaDeps = defaultDeps) {
  return create<ThemeStore>()((set, get) => {
    /** 상태를 화면에 반영한다. 저장 성공 여부와 무관하게 부른다(낙관적 반영). */
    const applyCurrent = () => applyTheme(appliedTheme(get()));

    /** 도메인 규칙으로 값을 바꿔 저장하고, 성공했을 때만 미러를 갱신한다(R8). */
    const save = async (
      change: (settings: Settings) => Persistable<Settings>,
    ): Promise<boolean> => {
      try {
        const settings = await loadOrCreateSettings(deps);
        const next = change(settings);
        await getRepositories().settings.upsert(next);
        writeMirror(toMirror(next.theme, next.accentColor));
        return true;
      } catch {
        set({ error: SAVE_FAILED });
        return false;
      }
    };

    return {
      ...initialState,

      init: async () => {
        if (get().status !== 'idle') return;
        const mirror = readMirror();
        set({
          status: 'loading',
          systemDark: readSystemDark(),
          // 미러가 있으면 첫 페인트 스크립트가 이미 그 값을 그렸다 — 컨트롤의 표시를 화면과 맞춘다.
          ...(mirror === undefined ? {} : { mode: mirror.theme, accentColor: mirror.accent.light }),
        });
        try {
          const settings = await loadOrCreateSettings(deps);
          set({
            mode: settings.theme,
            accentColor: settings.accentColor,
            status: 'ready',
            error: null,
          });
          // 저장소 값이 미러와 다를 수 있다(다른 탭·저장 실패 후 새로고침). 저장소가 우선이다(R8).
          applyCurrent();
          writeMirror(toMirror(settings.theme, settings.accentColor));
        } catch {
          // 화면은 첫 페인트 스크립트가 그린 그대로 둔다 — 못 읽었다고 라이트로 되돌리면 그게 깜빡임이다.
          set({ status: 'error', error: LOAD_FAILED });
        }
      },

      setMode: async (mode) => {
        if (get().mode === mode) return true;
        set({ mode, error: null });
        applyCurrent();
        return save((settings) => setThemeModeRule(settings, mode, deps));
      },

      setAccentColor: async (hex) => {
        // 팔레트 밖 색은 **적용하기 전에** 막는다. 저장 실패와 달리 이건 영영 저장되지 않을 값이라
        // 화면에 남기면 새로고침 때 튄다(theme R3 — 선택지는 12색뿐, 표시만 R4 로 허용).
        if (!isPaletteColor(hex)) {
          set({ error: COLOR_REJECTED });
          return false;
        }
        if (get().accentColor === hex) return true;
        set({ accentColor: hex, error: null });
        applyCurrent();
        return save((settings) => setAccentColorRule(settings, hex, deps));
      },

      setSystemDark: (dark) => {
        if (get().systemDark === dark) return;
        set({ systemDark: dark });
        // `system` 이 아니면 보이는 결과가 바뀌지 않지만, 다시 `system` 으로 돌아갈 때를 위해 값은 둔다.
        if (get().mode === 'system') applyCurrent();
      },
    };
  });
}

/** 앱이 쓰는 단 하나의 테마 스토어. 컴포넌트는 selector 로 필요한 조각만 구독한다. */
export const useThemeStore = createThemeStore();
