// 스토어 액션 — 저장소·화면·미러 셋이 한 방향으로 움직이는지. memory 레포지토리로 돌린다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSettings, setThemeMode } from '@/domain/theme/settings.rules';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { THEME_COLOR, THEME_MIRROR_KEY, toMirror } from '@/features/theme/store/theme-state';
import { createThemeStore } from '@/features/theme/store/theme-store';
import { fixedDeps } from '@/test/fixtures/deps';
import { makeSettings } from '@/test/fixtures/settings';

const SKY_LIGHT = '#7CC6FF';
const SKY_DARK = '#6AAEE3';
const CORAL_LIGHT = '#FF8FA3';
const CORAL_DARK = '#E27A8E';

function stubMatchMedia(dark: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({ matches: dark, media: query }) as MediaQueryList,
  );
}

function screen() {
  const el = document.documentElement;
  return {
    theme: el.getAttribute('data-theme'),
    accent: el.style.getPropertyValue('--color-accent'),
    themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
  };
}

function mirror(): unknown {
  const raw = window.localStorage.getItem(THEME_MIRROR_KEY);
  return raw === null ? null : JSON.parse(raw);
}

let repositories = createMemoryRepositories();

beforeEach(() => {
  repositories = createMemoryRepositories();
  setRepositories(repositories);
  window.localStorage.clear();
  document.head.innerHTML = '<meta name="theme-color" content="#FAFAFC">';
  stubMatchMedia(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
});

describe('init (R6·R8)', () => {
  it('설정이 없으면 기본값(system·스카이)을 만들어 저장한다 — 레포지토리는 값을 만들지 않는다', async () => {
    const store = createThemeStore(fixedDeps());
    await store.getState().init();

    expect(await repositories.settings.get()).toMatchObject({
      theme: 'system',
      accentColor: SKY_LIGHT,
      rev: 1,
    });
    expect(store.getState().status).toBe('ready');
  });

  it('저장된 다크 설정을 화면·미러에 확정한다', async () => {
    await repositories.settings.upsert(
      setThemeMode(makeSettings({ accentColor: CORAL_LIGHT }), 'dark', fixedDeps()),
    );
    const store = createThemeStore(fixedDeps());
    await store.getState().init();

    expect(screen()).toEqual({
      theme: 'dark',
      accent: CORAL_DARK,
      themeColor: THEME_COLOR.dark,
    });
    expect(mirror()).toEqual(toMirror('dark', CORAL_LIGHT));
    expect(store.getState().mode).toBe('dark');
  });

  it('저장소 값이 미러를 이긴다 (R8) — 다른 탭이 바꾼 뒤 새로고침한 경우', async () => {
    window.localStorage.setItem(THEME_MIRROR_KEY, JSON.stringify(toMirror('dark', CORAL_LIGHT)));
    await repositories.settings.upsert(
      createSettings(fixedDeps(), { theme: 'light', accentColor: SKY_LIGHT }),
    );

    const store = createThemeStore(fixedDeps());
    await store.getState().init();

    expect(store.getState().mode).toBe('light');
    expect(screen().theme).toBe('light');
    expect(mirror()).toEqual(toMirror('light', SKY_LIGHT));
  });

  it('저장소를 못 읽으면 화면을 건드리지 않는다 — 첫 페인트 값을 되돌리는 것이 곧 깜빡임이다', async () => {
    vi.spyOn(repositories.settings, 'get').mockRejectedValue(new Error('boom'));
    document.documentElement.setAttribute('data-theme', 'dark');

    const store = createThemeStore(fixedDeps());
    await store.getState().init();

    expect(store.getState().status).toBe('error');
    expect(store.getState().error).not.toBeNull();
    expect(screen().theme).toBe('dark');
  });

  it('두 번 불러도 저장소를 한 번만 읽는다(마운트가 겹쳐도)', async () => {
    const spy = vi.spyOn(repositories.settings, 'get');
    const store = createThemeStore(fixedDeps());
    await store.getState().init();
    await store.getState().init();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('setMode (R6·R7)', () => {
  it('명시 선택이 OS 를 이긴다 — OS 가 다크여도 라이트로 그린다', async () => {
    stubMatchMedia(true);
    const store = createThemeStore(fixedDeps());
    await store.getState().init();
    expect(screen().theme).toBe('dark'); // system + OS 다크

    await store.getState().setMode('light');

    expect(screen()).toEqual({
      theme: 'light',
      accent: SKY_LIGHT,
      themeColor: THEME_COLOR.light,
    });
    expect(await repositories.settings.get()).toMatchObject({ theme: 'light' });
  });

  it('다시 system 을 고르면 OS 를 따라간다 — 반대 방향도 이긴다', async () => {
    stubMatchMedia(true);
    const store = createThemeStore(fixedDeps());
    await store.getState().init();
    await store.getState().setMode('light');

    await store.getState().setMode('system');

    expect(screen().theme).toBe('dark');
    expect(await repositories.settings.get()).toMatchObject({ theme: 'system' });
  });

  it('저장에 실패해도 화면은 바뀐 채 두고 미러는 갱신하지 않는다(§2)', async () => {
    const store = createThemeStore(fixedDeps());
    await store.getState().init();
    const before = mirror();
    vi.spyOn(repositories.settings, 'upsert').mockRejectedValue(new Error('disk'));

    const ok = await store.getState().setMode('dark');

    expect(ok).toBe(false);
    expect(store.getState().error).not.toBeNull();
    expect(screen().theme).toBe('dark'); // 화면은 바뀐 채
    expect(mirror()).toEqual(before); // 새로고침하면 이전 값으로 돌아간다
  });

  it('rev 는 도메인 규칙이 올린다 — 스토어가 Meta 를 쓰지 않는다', async () => {
    const store = createThemeStore(fixedDeps());
    await store.getState().init();
    await store.getState().setMode('dark');
    expect(await repositories.settings.get()).toMatchObject({ theme: 'dark', rev: 2 });
  });
});

describe('setAccentColor (R3·R4)', () => {
  it('저장은 라이트 HEX 로, 화면은 모드에 맞는 값으로 (다크)', async () => {
    const store = createThemeStore(fixedDeps());
    await store.getState().init();
    await store.getState().setMode('dark');

    await store.getState().setAccentColor(CORAL_LIGHT);

    expect(await repositories.settings.get()).toMatchObject({ accentColor: CORAL_LIGHT });
    expect(screen().accent).toBe(CORAL_DARK);
    expect(mirror()).toEqual(toMirror('dark', CORAL_LIGHT));
  });

  it('같은 색이 라이트 모드에서는 라이트 HEX 로 적용된다', async () => {
    const store = createThemeStore(fixedDeps());
    await store.getState().init();
    await store.getState().setMode('light');

    await store.getState().setAccentColor(CORAL_LIGHT);

    expect(screen().accent).toBe(CORAL_LIGHT);
  });

  it('팔레트 밖 색은 적용도 저장도 되지 않는다', async () => {
    const store = createThemeStore(fixedDeps());
    await store.getState().init();

    const ok = await store.getState().setAccentColor('#123456');

    expect(ok).toBe(false);
    expect(store.getState().accentColor).toBe(SKY_LIGHT);
    expect(await repositories.settings.get()).toMatchObject({ accentColor: SKY_LIGHT });
  });
});

describe('setSystemDark (R7)', () => {
  it('system 모드에서는 OS 변경이 화면을 바꾼다', async () => {
    const store = createThemeStore(fixedDeps());
    await store.getState().init();
    expect(screen().theme).toBe('light');

    store.getState().setSystemDark(true);

    expect(screen()).toEqual({ theme: 'dark', accent: SKY_DARK, themeColor: THEME_COLOR.dark });
  });

  it('명시 모드에서는 OS 가 바뀌어도 화면이 그대로다', async () => {
    const store = createThemeStore(fixedDeps());
    await store.getState().init();
    await store.getState().setMode('light');

    store.getState().setSystemDark(true);

    expect(screen().theme).toBe('light');
    expect(store.getState().systemDark).toBe(true); // 값은 기억한다 — system 으로 돌아갈 때를 위해
  });

  it('OS 값을 기억해 뒀다가 system 으로 돌아가면 그 값으로 그린다', async () => {
    const store = createThemeStore(fixedDeps());
    await store.getState().init();
    await store.getState().setMode('light');
    store.getState().setSystemDark(true);

    await store.getState().setMode('system');

    expect(screen().theme).toBe('dark');
  });
});

describe('reloadFromStorage (T94_LAZY_BOUNDARY.md §D-10 — 동기화가 settings 를 채택했을 때)', () => {
  it('저장소의 새 값을 화면·미러에 반영한다 — init 의 "한 번만" 가드가 없다', async () => {
    const store = createThemeStore(fixedDeps());
    await store.getState().init();
    expect(store.getState().mode).toBe('system');

    // 다른 기기가 원격에서 올린 값을 엔진이 로컬 저장소에 적용했다고 가정 — 스토어 밖에서 바뀐다.
    await repositories.settings.upsert(
      setThemeMode(makeSettings({ accentColor: CORAL_LIGHT }), 'dark', fixedDeps()),
    );

    await store.getState().reloadFromStorage();

    expect(store.getState().mode).toBe('dark');
    expect(store.getState().accentColor).toBe(CORAL_LIGHT);
    expect(screen()).toEqual({ theme: 'dark', accent: CORAL_DARK, themeColor: THEME_COLOR.dark });
    expect(mirror()).toEqual(toMirror('dark', CORAL_LIGHT));
  });

  it('settings 행이 없으면 화면을 건드리지 않는다', async () => {
    const store = createThemeStore(fixedDeps());
    await store.getState().reloadFromStorage();
    expect(store.getState().status).toBe('idle');
  });

  it('저장소를 못 읽으면 화면은 그대로 두고 에러만 남긴다', async () => {
    const store = createThemeStore(fixedDeps());
    await store.getState().init();
    vi.spyOn(repositories.settings, 'get').mockRejectedValueOnce(new Error('boom'));

    await store.getState().reloadFromStorage();

    expect(store.getState().error).not.toBeNull();
    expect(store.getState().mode).toBe('system'); // 안 바뀜
  });
});
