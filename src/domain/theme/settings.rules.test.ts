import { describe, expect, it } from 'vitest';

import { DEFAULT_ACCENT_COLOR, PALETTE } from '@/domain/theme/palette';
import { SETTINGS_ID } from '@/domain/theme/settings';
import {
  createSettings,
  markBackedUp,
  markSeeded,
  setAccentColor,
  setThemeMode,
} from '@/domain/theme/settings.rules';

import { FIXTURE_INSTANT, fixedDeps } from '@/test/fixtures/deps';
import { makeSettings } from '@/test/fixtures/settings';

const LATER = '2026-03-01T00:00:00.000Z';
const deps = fixedDeps();
const laterDeps = fixedDeps({ now: LATER });

describe('createSettings (theme R3·R6)', () => {
  it('기본값은 system 모드 + 스카이 강조색이고 id 는 고정이다', () => {
    const settings = createSettings(deps);
    expect(settings).toMatchObject({
      id: SETTINGS_ID,
      theme: 'system',
      accentColor: DEFAULT_ACCENT_COLOR,
      rev: 1,
    });
    expect(settings.createdAt).toBe(FIXTURE_INSTANT);
    expect(settings.deletedAt).toBeUndefined();
  });

  it('override 로 초기값을 바꿀 수 있다', () => {
    expect(createSettings(deps, { theme: 'dark' }).theme).toBe('dark');
  });
});

describe('변경 함수는 전부 touch 를 거친다 (ADR-0005)', () => {
  it('테마 모드', () => {
    const next = setThemeMode(makeSettings(), 'dark', laterDeps);
    expect(next).toMatchObject({ theme: 'dark', rev: 2, updatedAt: LATER });
  });

  it('강조색은 팔레트 12색만 받고 대문자로 저장한다', () => {
    const coral = PALETTE[0].light;
    expect(setAccentColor(makeSettings(), coral.toLowerCase(), laterDeps).accentColor).toBe(coral);
    expect(() => setAccentColor(makeSettings(), '#123456', laterDeps)).toThrow(
      expect.objectContaining({ code: 'CATEGORY_COLOR_INVALID' }),
    );
  });

  it('시드·백업 시각 기록', () => {
    expect(markSeeded(makeSettings(), laterDeps)).toMatchObject({
      seededAt: LATER,
      updatedAt: LATER,
      rev: 2,
    });
    expect(markBackedUp(makeSettings(), laterDeps).lastBackupAt).toBe(LATER);
  });
});
