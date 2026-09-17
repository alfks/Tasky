import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Command } from '@/features/command/store/command-registry';
import { useCommandStore } from '@/features/command/store/command-store';
import { RECENT_COMMANDS_KEY } from '@/features/command/store/recent-commands';
import { DuplicateShortcutError } from '@/features/command/store/shortcut-registry';

function reset() {
  localStorage.clear();
  useCommandStore.setState({
    shortcuts: [],
    commands: [],
    // T-53 이 더한 필드다. 여기서 빠지면 빈 결과 줄이 파일 안에서 다음 테스트로 넘어간다.
    quickAdds: [],
    recentCommandIds: [],
    helpOpen: false,
    paletteOpen: false,
    commandError: null,
  });
}

function command(id: string, run: Command['run'] = vi.fn(), extra: Partial<Command> = {}): Command {
  return { id, label: id, run, ...extra };
}

beforeEach(reset);

describe('registerShortcut', () => {
  it('등록하고 해제한다', () => {
    const off = useCommandStore.getState().registerShortcut('date.next', vi.fn());
    expect(useCommandStore.getState().shortcuts).toHaveLength(1);
    off();
    expect(useCommandStore.getState().shortcuts).toHaveLength(0);
  });

  it('두 번 등록하면 던진다', () => {
    useCommandStore.getState().registerShortcut('date.next', vi.fn());
    expect(() => useCommandStore.getState().registerShortcut('date.next', vi.fn())).toThrow(
      DuplicateShortcutError,
    );
  });

  it('해제한 뒤에는 다시 등록할 수 있다', () => {
    const off = useCommandStore.getState().registerShortcut('date.next', vi.fn());
    off();
    expect(() => useCommandStore.getState().registerShortcut('date.next', vi.fn())).not.toThrow();
  });
});

describe('registerCommands', () => {
  it('등록·해제가 짝이 맞는다', () => {
    const off = useCommandStore.getState().registerCommands([command('a'), command('b')]);
    expect(useCommandStore.getState().commands).toHaveLength(2);
    off();
    expect(useCommandStore.getState().commands).toHaveLength(0);
  });
});

describe('runCommand', () => {
  it('실행하고 최근 목록에 남긴다(R12)', async () => {
    const run = vi.fn();
    useCommandStore.getState().registerCommands([command('todo.new', run)]);
    await useCommandStore.getState().runCommand('todo.new');
    expect(run).toHaveBeenCalledTimes(1);
    expect(useCommandStore.getState().recentCommandIds).toEqual(['todo.new']);
    expect(localStorage.getItem(RECENT_COMMANDS_KEY)).toBe('["todo.new"]');
  });

  it('없는 id 는 아무 일도 하지 않는다', async () => {
    await useCommandStore.getState().runCommand('nope');
    expect(useCommandStore.getState().recentCommandIds).toEqual([]);
  });

  it('when() 이 거짓이면 실행하지도 기억하지도 않는다', async () => {
    const run = vi.fn();
    useCommandStore.getState().registerCommands([command('gated', run, { when: () => false })]);
    await useCommandStore.getState().runCommand('gated');
    expect(run).not.toHaveBeenCalled();
    expect(useCommandStore.getState().recentCommandIds).toEqual([]);
  });

  it('비동기 명령이 끝날 때까지 기다린다', async () => {
    let done = false;
    useCommandStore.getState().registerCommands([
      command('slow', async () => {
        await Promise.resolve();
        done = true;
      }),
    ]);
    await useCommandStore.getState().runCommand('slow');
    expect(done).toBe(true);
  });

  it('실패하면 한국어 문구를 남기고 던지지 않는다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    useCommandStore.getState().registerCommands([
      command('boom', () => {
        throw new Error('실패');
      }),
    ]);
    await expect(useCommandStore.getState().runCommand('boom')).resolves.toBeUndefined();
    expect(useCommandStore.getState().commandError).toMatch(/다시 시도/);
    spy.mockRestore();
  });

  it('다음 성공에서 오류 문구가 지워진다', async () => {
    useCommandStore.getState().registerCommands([command('ok')]);
    useCommandStore.setState({ commandError: '이전 실패' });
    await useCommandStore.getState().runCommand('ok');
    expect(useCommandStore.getState().commandError).toBeNull();
  });
});

describe('도움말·팔레트 열림 상태', () => {
  it('열고 닫는다', () => {
    const state = useCommandStore.getState();
    state.openHelp();
    expect(useCommandStore.getState().helpOpen).toBe(true);
    state.closeHelp();
    expect(useCommandStore.getState().helpOpen).toBe(false);
    state.openPalette();
    expect(useCommandStore.getState().paletteOpen).toBe(true);
    state.closePalette();
    expect(useCommandStore.getState().paletteOpen).toBe(false);
  });
});
