import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PALETTE_COMMANDS } from '@/features/command/components/CommandPaletteCommands';
import { availableCommands, type Command } from '@/features/command/store/command-registry';
import { useCommandStore } from '@/features/command/store/command-store';
import { useDateStripStore } from '@/features/date-strip';
import { useThemeStore } from '@/features/theme';

import { todayKey } from '@/lib/date';

function byId(id: string): Command {
  const found = PALETTE_COMMANDS.find((command) => command.id === id);
  if (found === undefined) throw new Error(`명령 '${id}' 가 목록에 없습니다`);
  return found;
}

function availableIds(): string[] {
  return availableCommands(PALETTE_COMMANDS).map((command) => command.id);
}

beforeEach(() => {
  useThemeStore.setState({ mode: 'system' });
  useDateStripStore.setState({ selectedDate: '2026-09-10', today: '2026-09-17' });
  // `도움말 명령이 도움말을 연다` 가 `helpOpen: true` 를 남긴다 — 모듈 전역이라 언마운트로 안 돌아온다.
  useCommandStore.setState({ helpOpen: false, paletteOpen: false });
});

describe('PALETTE_COMMANDS (R7)', () => {
  it('id 가 서로 겹치지 않는다 — 겹치면 등록이 통째로 거절된다', () => {
    const ids = PALETTE_COMMANDS.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('주 이동 명령이 선택 날짜를 ±7 일 옮긴다', async () => {
    await byId('date.prevWeek').run();
    expect(useDateStripStore.getState().selectedDate).toBe('2026-09-03');
    await byId('date.nextWeek').run();
    expect(useDateStripStore.getState().selectedDate).toBe('2026-09-10');
  });

  it('오늘 명령은 기기의 오늘을 고른다 — 스토어에 박힌 today 가 아니다', async () => {
    await byId('date.today').run();
    expect(useDateStripStore.getState().selectedDate).toBe(todayKey());
  });

  it('테마 명령은 지금 모드와 같은 것을 감춘다', () => {
    expect(availableIds()).toContain('theme.dark');
    expect(availableIds()).not.toContain('theme.system');
    useThemeStore.setState({ mode: 'dark' });
    expect(availableIds()).not.toContain('theme.dark');
    expect(availableIds()).toContain('theme.system');
  });

  it('테마 명령이 모드를 바꾼다', async () => {
    await byId('theme.dark').run();
    expect(useThemeStore.getState().mode).toBe('dark');
  });

  it('순환 때문에 빠진 명령은 목록에 아예 없다 — 눌러도 아무 일이 없는 줄을 만들지 않는다', () => {
    // `command → timer|todo|category|backup → todo → command` 가 import 순환이라 이 다섯은
    // 각자의 feature 가 등록해야 한다(파일 머리말 표). 그때까지는 목록에 없어야 한다.
    const ids = PALETTE_COMMANDS.map((command) => command.id);
    expect(ids.filter((id) => /^(timer|todo|category|backup|shell)\./.test(id))).toEqual([]);
  });

  it('도움말 명령이 도움말을 연다', async () => {
    useCommandStore.setState({ helpOpen: false });
    await byId('help.open').run();
    expect(useCommandStore.getState().helpOpen).toBe(true);
  });

  it('단축키가 있는 명령은 카탈로그 id 를 달고 있다 — 팔레트가 오른쪽에 조합을 그린다', () => {
    expect(byId('date.today').shortcutId).toBe('date.today');
    expect(byId('help.open').shortcutId).toBe('help.open');
    expect(byId('theme.dark').shortcutId).toBeUndefined();
  });

  it('`when` 이 던져도 목록 전체가 죽지 않는다', () => {
    const boom: Command = {
      id: 'boom',
      label: '터짐',
      when: () => {
        throw new Error('x');
      },
      run: vi.fn(),
    };
    expect(availableCommands([...PALETTE_COMMANDS, boom]).map((c) => c.id)).not.toContain('boom');
  });
});
