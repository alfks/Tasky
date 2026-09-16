import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_ACCENT_COLOR } from '@/domain/theme/palette';
import { createSettings } from '@/domain/theme/settings.rules';

import { setRepositories } from '@/repositories/container';
import type { Repositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { useThemeSync } from '@/features/theme/hooks/useThemeSync';
import { useThemeStore } from '@/features/theme/store/theme-store';
import { fixedDeps } from '@/test/fixtures/deps';

type MediaListener = (event: MediaQueryListEvent) => void;

function stubMatchMedia(initial: boolean) {
  const listeners = new Set<MediaListener>();
  const query = {
    matches: initial,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_t: string, fn: MediaListener) => listeners.add(fn),
    removeEventListener: (_t: string, fn: MediaListener) => listeners.delete(fn),
  };
  vi.stubGlobal('matchMedia', () => query as unknown as MediaQueryList);
  return {
    listenerCount: () => listeners.size,
    emit: (matches: boolean) => {
      query.matches = matches;
      for (const fn of listeners) fn({ matches } as MediaQueryListEvent);
    },
  };
}

function Probe() {
  useThemeSync();
  return null;
}

let repositories: Repositories;

beforeEach(() => {
  repositories = createMemoryRepositories();
  setRepositories(repositories);
  window.localStorage.clear();
  document.head.innerHTML = '<meta name="theme-color" content="#FAFAFC">';
  useThemeStore.setState({
    mode: 'system',
    accentColor: DEFAULT_ACCENT_COLOR,
    systemDark: false,
    status: 'idle',
    error: null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
});

describe('useThemeSync (R6~R8)', () => {
  it('마운트하면 저장된 값을 읽어 화면에 적용한다', async () => {
    await repositories.settings.upsert(createSettings(fixedDeps(), { theme: 'dark' }));
    stubMatchMedia(false);

    render(<Probe />);

    await waitFor(() => expect(useThemeStore.getState().status).toBe('ready'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('OS 테마가 바뀌면 system 모드 화면이 따라간다(R7)', async () => {
    const media = stubMatchMedia(false);
    render(<Probe />);
    await waitFor(() => expect(useThemeStore.getState().status).toBe('ready'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    media.emit(true);

    expect(useThemeStore.getState().systemDark).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('언마운트하면 OS 구독을 해지한다', async () => {
    const media = stubMatchMedia(false);
    const view = render(<Probe />);
    await waitFor(() => expect(media.listenerCount()).toBe(1));

    view.unmount();

    expect(media.listenerCount()).toBe(0);
  });

  it('두 번 마운트해도 저장소 읽기는 한 번이다', async () => {
    const spy = vi.spyOn(repositories.settings, 'get');
    stubMatchMedia(false);

    render(<Probe />);
    render(<Probe />);

    await waitFor(() => expect(useThemeStore.getState().status).toBe('ready'));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
