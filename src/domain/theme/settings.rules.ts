// 설정(테마·강조색·시드·백업 시각) 규칙 (theme.md §3-B·§3-E·§4, category R18, backup R10).
// 레포지토리는 기본값을 만들지 않는다 — 없으면 이 파일의 createSettings(deps) 로 만들어 upsert 한다.
import { DomainError } from '@/domain/errors';
import { createMeta, touch, type MetaDeps, type Persistable } from '@/domain/meta';
import { DEFAULT_ACCENT_COLOR, isPaletteColor, normalizeHexColor } from '@/domain/theme/palette';
import { SETTINGS_ID, type Settings, type ThemeMode } from '@/domain/theme/settings';

/** 저장소에 설정 행이 없을 때 만드는 기본값 (theme R6: 모드 기본 `system`, R3: 강조색 기본 스카이). */
export function createSettings(
  deps: MetaDeps,
  overrides: Partial<Pick<Settings, 'theme' | 'accentColor'>> = {},
): Persistable<Settings> {
  return createMeta<Settings>(deps, {
    id: SETTINGS_ID,
    theme: overrides.theme ?? 'system',
    accentColor: overrides.accentColor ?? DEFAULT_ACCENT_COLOR,
  });
}

/** 테마 모드 변경. */
export function setThemeMode(
  settings: Settings,
  theme: ThemeMode,
  deps: MetaDeps,
): Persistable<Settings> {
  return touch({ ...settings, theme }, deps.now());
}

/**
 * 강조색 변경. 선택지는 팔레트 12색뿐이므로(theme R3) 프리셋 밖의 값은 거부한다 —
 * 가져오기로 들어온 프리셋 밖 색을 **표시**하는 것은 허용이지만(R4) 사용자가 **선택**할 수는 없다.
 */
export function setAccentColor(
  settings: Settings,
  accentColor: string,
  deps: MetaDeps,
): Persistable<Settings> {
  const normalized = normalizeHexColor(accentColor);
  if (normalized === undefined || !isPaletteColor(normalized)) {
    throw new DomainError('CATEGORY_COLOR_INVALID', accentColor);
  }
  return touch({ ...settings, accentColor: normalized }, deps.now());
}

/** 첫 실행 시드를 마쳤다고 표시한다 (category R18). 지워도 재생성하지 않게 하는 플래그다. */
export function markSeeded(settings: Settings, deps: MetaDeps): Persistable<Settings> {
  const at = deps.now();
  return touch({ ...settings, seededAt: at }, at);
}

/** 백업 내보내기 시각 기록 (backup R10). */
export function markBackedUp(settings: Settings, deps: MetaDeps): Persistable<Settings> {
  const at = deps.now();
  return touch({ ...settings, lastBackupAt: at }, at);
}
