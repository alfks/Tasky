// 테마 스토어의 **상태 모양과 순수 변환** — React·zustand·DOM·레포지토리를 모르는 부분만 모았다.
// DOM 적용은 `theme-dom.ts`, 첫 페인트 스크립트는 `theme-init-script.ts`, 액션은 `theme-store.ts`.
import { resolvePaletteColor } from '@/domain/theme/palette';
import type { ThemeMode } from '@/domain/theme/settings';

/** 실제로 화면에 적용되는 두 값. `system` 은 여기까지 오면 이미 풀려 있다. */
export type ResolvedTheme = 'light' | 'dark';

/**
 * localStorage 미러 키 (theme R6). 저장소(IndexedDB)는 비동기라 첫 페인트 전에 읽을 수 없어서,
 * 같은 값을 동기적으로 읽을 수 있는 이 키에 복사해 둔다. **캐시일 뿐이고 저장소 값이 우선한다**(R8).
 */
export const THEME_MIRROR_KEY = 'tasky.theme.v1';

/**
 * `meta[name="theme-color"]` 에 넣는 값 (pwa R9: 현재 테마의 `--color-bg`).
 * 첫 페인트 스크립트는 스타일시트 파싱 전에 돌 수 있어 `getComputedStyle` 로 토큰을 읽을 수 없다 —
 * 그래서 값을 여기 복사하고, `theme-state.test.ts` 가 `src/styles/tokens.css` 와 대조해 드리프트를 막는다.
 */
export const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#FAFAFC',
  dark: '#141418',
};

/** 설정 적재 상태. `error` 는 적재 실패와 저장 실패가 함께 쓴다. */
export type ThemeLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/** 스토어의 상태 부분. `accentColor` 는 **라이트 HEX**(저장 표기)이고 모드별 값은 파생이다(theme R3). */
export type ThemeState = {
  /** 사용자가 고른 모드. 기본 `system`(theme R6). */
  mode: ThemeMode;
  /** 강조색 저장값(라이트 HEX). */
  accentColor: string;
  /** OS 가 다크를 선호하는지(`prefers-color-scheme`). `system` 모드일 때만 결과를 바꾼다(R7). */
  systemDark: boolean;
  status: ThemeLoadStatus;
  /** 사용자에게 그대로 보여줄 한국어 문구. 성공한 액션은 `null` 로 지운다. */
  error: string | null;
};

/** 저장 실패 공통 문구 (theme §2). 원인이 아니라 다음 행동을 안내한다. */
export const SAVE_FAILED = '테마를 저장하지 못했어요. 다시 시도해 주세요';

/** 적재 실패 문구. 화면은 미러(첫 페인트) 값 그대로 남는다. */
export const LOAD_FAILED = '테마 설정을 읽지 못했어요. 다시 시도해 주세요';

/** 팔레트 밖 색을 고르려 했을 때 (theme R3). UI 는 12색만 보여주므로 보통은 닿지 않는 경로다. */
export const COLOR_REJECTED = '고를 수 없는 색이에요. 팔레트에서 선택해 주세요';

/** 모드 + OS 선호 → 실제 적용할 테마. `system` 일 때만 OS 를 따른다(R7). */
export function resolveTheme(mode: ThemeMode, systemDark: boolean): ResolvedTheme {
  if (mode === 'system') return systemDark ? 'dark' : 'light';
  return mode;
}

/** 지금 화면에 적용되어야 하는 값 한 쌍. */
export type AppliedTheme = {
  resolved: ResolvedTheme;
  /** 모드에 맞게 푼 강조색 HEX. 프리셋 밖 색은 두 모드에서 그대로다(R4). */
  accent: string;
};

/** 상태 → 적용값. `theme-dom.ts` 가 그대로 DOM 에 쓴다. */
export function appliedTheme(state: Pick<ThemeState, 'mode' | 'accentColor' | 'systemDark'>) {
  const resolved = resolveTheme(state.mode, state.systemDark);
  return {
    resolved,
    accent: resolvePaletteColor(state.accentColor, resolved),
  } satisfies AppliedTheme;
}

/** `☾` 버튼이 누를 다음 모드 — 지금 보이는 것의 반대를 **명시 모드**로 고정한다(theme §2). */
export function toggledMode(state: Pick<ThemeState, 'mode' | 'systemDark'>): ThemeMode {
  return resolveTheme(state.mode, state.systemDark) === 'dark' ? 'light' : 'dark';
}

/** 미러에 담기는 값. 모드별 강조색을 **미리 풀어** 두어 첫 페인트 스크립트가 팔레트를 몰라도 되게 한다. */
export type ThemeMirror = {
  theme: ThemeMode;
  accent: Record<ResolvedTheme, string>;
};

/** 저장에 성공한 값을 미러 표현으로. */
export function toMirror(mode: ThemeMode, accentColor: string): ThemeMirror {
  return {
    theme: mode,
    accent: {
      light: resolvePaletteColor(accentColor, 'light'),
      dark: resolvePaletteColor(accentColor, 'dark'),
    },
  };
}

const MODES: readonly ThemeMode[] = ['system', 'light', 'dark'];

function isMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && MODES.includes(value as ThemeMode);
}

/**
 * 미러 문자열 → 값. 손상·구버전·다른 탭이 쓴 쓰레기여도 예외를 던지지 않고 `undefined` 를 준다 —
 * 미러는 캐시라서 못 읽으면 기본값으로 시작하면 그만이다(R8).
 */
export function parseMirror(raw: string | null): ThemeMirror | undefined {
  if (raw === null) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const { theme, accent } = parsed as { theme?: unknown; accent?: unknown };
  if (!isMode(theme)) return undefined;
  if (typeof accent !== 'object' || accent === null) return undefined;
  const { light, dark } = accent as { light?: unknown; dark?: unknown };
  if (typeof light !== 'string' || typeof dark !== 'string') return undefined;
  return { theme, accent: { light, dark } };
}
