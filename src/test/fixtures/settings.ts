// 설정 픽스처 팩토리. 단일 행이므로 id 는 항상 'default' 다 (ADR-0005 규칙 1).
import { DEFAULT_ACCENT_COLOR } from '@/domain/theme/palette';
import { SETTINGS_ID, type Settings } from '@/domain/theme/settings';

import { FIXTURE_INSTANT } from '@/test/fixtures/deps';

/** 기본 설정 한 행. */
export function makeSettings(overrides: Partial<Omit<Settings, 'id'>> = {}): Settings {
  return {
    id: SETTINGS_ID,
    createdAt: FIXTURE_INSTANT,
    updatedAt: FIXTURE_INSTANT,
    rev: 1,
    theme: 'system',
    accentColor: DEFAULT_ACCENT_COLOR,
    ...overrides,
  };
}
