import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_ACCENT_COLOR } from '@/domain/theme/palette';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { ThemeSettingsPopover } from '@/features/theme/components/ThemeSettingsPopover';
import { useThemeStore } from '@/features/theme/store/theme-store';

const CORAL_LIGHT = '#FF8FA3';
const CORAL_DARK = '#E27A8E';

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

async function openPopover() {
  render(<ThemeSettingsPopover />);
  await userEvent.click(screen.getByRole('button', { name: '테마 설정' }));
}

describe('ThemeSettingsPopover (§2·§5)', () => {
  it('3모드 라디오와 12색 강조색 그룹을 보여준다', async () => {
    await openPopover();

    const modes = screen.getByRole('radiogroup', { name: '테마' });
    expect(modes).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '시스템' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '라이트' })).not.toBeChecked();
    expect(
      screen.getByRole('radiogroup', { name: '강조색' }).querySelectorAll('[role="radio"]'),
    ).toHaveLength(12);
  });

  it('모드를 고르면 즉시 적용되고 저장된다', async () => {
    await openPopover();

    await userEvent.click(screen.getByRole('radio', { name: '다크' }));

    expect(useThemeStore.getState().mode).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(await getRepositories().settings.get()).toMatchObject({ theme: 'dark' });
  });

  it('"시스템" 을 다시 고르면 OS 를 따라간다 — 토글로 고정한 뒤에도', async () => {
    useThemeStore.setState({ mode: 'light', systemDark: true });
    await openPopover();

    await userEvent.click(screen.getByRole('radio', { name: '시스템' }));

    expect(useThemeStore.getState().mode).toBe('system');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('강조색을 고르면 저장은 라이트 HEX, 적용은 모드에 맞는 값이다', async () => {
    useThemeStore.setState({ mode: 'dark' });
    await openPopover();

    await userEvent.click(screen.getByRole('radio', { name: '코랄' }));

    expect(await getRepositories().settings.get()).toMatchObject({ accentColor: CORAL_LIGHT });
    expect(document.documentElement.style.getPropertyValue('--color-accent')).toBe(CORAL_DARK);
  });

  it('스와치에 보이는 색은 현재 모드의 값이다(다크에서는 다크 HEX)', async () => {
    useThemeStore.setState({ mode: 'dark' });
    await openPopover();

    const coral = screen.getByRole('radio', { name: '코랄' });
    expect(coral.style.getPropertyValue('--cat-color')).toBe(CORAL_DARK);
  });

  it('Esc 로 닫히고 포커스가 설정 버튼으로 돌아온다', async () => {
    await openPopover();
    expect(screen.getByRole('radiogroup', { name: '테마' })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('radiogroup', { name: '테마' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '테마 설정' })).toHaveFocus();
  });

  it('키보드만으로 모드를 바꿀 수 있다(방향키 — 네이티브 라디오)', async () => {
    await openPopover();
    screen.getByRole('radio', { name: '시스템' }).focus();

    await userEvent.keyboard('{ArrowDown}');

    expect(screen.getByRole('radio', { name: '라이트' })).toBeChecked();
    expect(useThemeStore.getState().mode).toBe('light');
  });
});
