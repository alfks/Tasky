import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_ACCENT_COLOR } from '@/domain/theme/palette';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { ThemeModeToggle } from '@/features/theme/components/ThemeModeToggle';
import { useThemeStore } from '@/features/theme/store/theme-store';

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  window.localStorage.clear();
  useThemeStore.setState({
    mode: 'system',
    accentColor: DEFAULT_ACCENT_COLOR,
    systemDark: false,
    status: 'ready',
    error: null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
});

describe('ThemeModeToggle (§2·§5)', () => {
  it('라이트에서는 다크로 바꾸는 버튼이고 aria-pressed 는 false 다', () => {
    render(<ThemeModeToggle />);
    const button = screen.getByRole('button', { name: '다크 모드로 전환' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('누르면 다크가 되고 이름·aria-pressed 가 뒤집힌다', async () => {
    render(<ThemeModeToggle />);
    await userEvent.click(screen.getByRole('button', { name: '다크 모드로 전환' }));

    expect(useThemeStore.getState().mode).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(screen.getByRole('button', { name: '라이트 모드로 전환' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('system 모드에서 OS 가 다크면 "라이트로 전환" 이고, 누르면 라이트로 고정된다', async () => {
    useThemeStore.setState({ mode: 'system', systemDark: true });
    render(<ThemeModeToggle />);

    await userEvent.click(screen.getByRole('button', { name: '라이트 모드로 전환' }));

    expect(useThemeStore.getState().mode).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('키보드로 조작할 수 있다(Tab → Enter)', async () => {
    render(<ThemeModeToggle />);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: '다크 모드로 전환' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(useThemeStore.getState().mode).toBe('dark');
  });
});
