/**
 * 단축키·명령 레지스트리 + 도움말/팔레트 열림 상태(shortcuts §3-A, R7·R11·R12).
 *
 * 모듈 전역 스토어인 이유: 등록은 화면 어디서나 일어나고(사이드바·투두 목록·셸) 디스패처는 단 하나다.
 * Context 로 감싸면 `<CommandLayer/>` 가 트리 최상단이어야 한다는 제약이 생기는데, 그 제약을 어긴
 * 등록은 **아무 말 없이 무시**된다 — 지금 구조에서는 그 실수가 불가능하다.
 */
import { create } from 'zustand';

import {
  addCommands,
  addQuickAdd,
  removeCommands,
  removeQuickAdd,
  pushRecent,
  type Command,
  type QuickAdd,
} from '@/features/command/store/command-registry';
import { readRecentCommands, writeRecentCommands } from '@/features/command/store/recent-commands';
import type { ShortcutId } from '@/features/command/store/shortcut-catalog';
import {
  addShortcut,
  removeShortcut,
  type ShortcutEntry,
  type ShortcutHandler,
} from '@/features/command/store/shortcut-registry';

export type CommandState = {
  /** 지금 등록된 단축키. 도움말은 이 목록에서 생성된다(R5). */
  shortcuts: ShortcutEntry[];
  /** 지금 등록된 명령(R7). */
  commands: Command[];
  /**
   * 빈 결과에서 질의를 소비하는 줄(§2). 등록 순서대로 쌓이고 **맨 뒤가 이긴다**
   * (`activeQuickAdd`). 명령과 섞지 않는 이유는 `command-registry.ts` 의 `QuickAdd` 주석.
   */
  quickAdds: QuickAdd[];
  /** 최근 실행 5개, 최신 순(R12). */
  recentCommandIds: string[];
  /** 단축키 도움말 다이얼로그. */
  helpOpen: boolean;
  /** 커맨드 팔레트. 실제 화면은 `<CommandLayer palette={…}/>` 가 받은 노드다. */
  paletteOpen: boolean;
  /** 마지막 명령 실행 실패 문구(한국어). 성공하면 `null`. */
  commandError: string | null;
};

export type CommandActions = {
  /** 단축키 하나 등록. 해제 함수를 돌려준다. 중복이면 `DuplicateShortcutError` 를 던진다. */
  registerShortcut: (id: ShortcutId, run?: ShortcutHandler) => () => void;
  /** 명령 여러 개 등록. 해제 함수를 돌려준다. */
  registerCommands: (commands: readonly Command[]) => () => void;
  /** 빈 결과 줄 하나 등록(§2). 해제 함수를 돌려준다. 중복은 던지지 않고 나중 것이 이긴다. */
  registerQuickAdd: (entry: QuickAdd) => () => void;
  /** id 로 실행 + 최근 목록 갱신(R12). 없는 id·`when()` 거짓이면 아무 일도 하지 않는다. */
  runCommand: (id: string) => Promise<void>;
  openHelp: () => void;
  closeHelp: () => void;
  openPalette: () => void;
  closePalette: () => void;
};

export type CommandStore = CommandState & CommandActions;

export const useCommandStore = create<CommandStore>((set, get) => ({
  shortcuts: [],
  commands: [],
  quickAdds: [],
  recentCommandIds: readRecentCommands(),
  helpOpen: false,
  paletteOpen: false,
  commandError: null,

  registerShortcut: (id, run) => {
    const entry: ShortcutEntry = run === undefined ? { id } : { id, run };
    set((state) => ({ shortcuts: addShortcut(state.shortcuts, entry) }));
    return () => set((state) => ({ shortcuts: removeShortcut(state.shortcuts, entry) }));
  },

  registerCommands: (commands) => {
    set((state) => ({ commands: addCommands(state.commands, commands) }));
    const ids = commands.map((command) => command.id);
    return () => set((state) => ({ commands: removeCommands(state.commands, ids) }));
  },

  registerQuickAdd: (entry) => {
    set((state) => ({ quickAdds: addQuickAdd(state.quickAdds, entry) }));
    return () => set((state) => ({ quickAdds: removeQuickAdd(state.quickAdds, entry) }));
  },

  runCommand: async (id) => {
    const command = get().commands.find((other) => other.id === id);
    if (command === undefined) return;
    if (command.when?.() === false) return;
    const recentCommandIds = pushRecent(get().recentCommandIds, id);
    set({ recentCommandIds, commandError: null });
    writeRecentCommands(recentCommandIds);
    try {
      await command.run();
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') console.error(`명령 '${id}' 실행 실패`, error);
      set({ commandError: '명령을 실행하지 못했어요. 다시 시도해 주세요.' });
    }
  },

  openHelp: () => set({ helpOpen: true }),
  closeHelp: () => set({ helpOpen: false }),
  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
}));
