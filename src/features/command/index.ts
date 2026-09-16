// 공개 API 배럴 — src/ 에서 index.ts 가 허용되는 유일한 위치(code-style.md §2). 명시 export 만 둔다.
//
// 이 feature 가 파는 이음새(TECH_PLAN §3):
// - 셸(T-20)은 `<CommandLayer/>` 를 **한 번** 마운트하고, 도움말 버튼에 `openHelp` 를 건다.
// - 기능(T-15·T-20·T-23)은 `useShortcut('<id>', handler)` 로 조합이 아니라 **id 로** 핸들러를 건다.
//   조합·설명·묶음은 `SHORTCUTS` 카탈로그가 단일 소스이고 도움말은 거기서 생성된다(R5).
// - 항목 포커스 키(R2)는 그 키를 실제로 처리하는 목록(T-15)이
//   `useDocumentedShortcuts(ITEM_SHORTCUT_IDS)` 로 한 번 등록한다 — 등록하는 순간 도움말에 나타난다.
// - 팔레트(T-19)는 `registerCommands` 로 명령을 등록하고, `<CommandLayer palette={…}/>` 로 화면을 끼운다.
//   검색·정렬·최근 실행은 `matchCommands`·`orderByRecent`·`recentCommandIds` 가 이미 있다.
export { CommandLayer } from '@/features/command/components/CommandLayer';
// 셸이 `<CommandLayer palette={<CommandPalette/>}/>` 로 끼운다(T-19). 이 한 줄이 없으면 `Mod+K` 는
// 상태만 바꾸고 아무것도 그리지 않는다 — 배선은 셸 파일이라 T-19 의 `owns` 밖이다(핸드오프 참조).
export { CommandPalette } from '@/features/command/components/CommandPalette';
export { PALETTE_COMMANDS } from '@/features/command/components/CommandPaletteCommands';
export { ShortcutHelpDialog } from '@/features/command/components/ShortcutHelpDialog';
export { ShortcutKeys } from '@/features/command/components/ShortcutKeys';

export { useShortcut, useDocumentedShortcuts } from '@/features/command/hooks/useShortcut';

export { useCommandStore } from '@/features/command/store/command-store';
export type {
  CommandActions,
  CommandState,
  CommandStore,
} from '@/features/command/store/command-store';

export {
  DuplicateCommandError,
  availableCommands,
  matchCommands,
  normalizeQuery,
  orderByRecent,
  type Command,
} from '@/features/command/store/command-registry';

export {
  ITEM_SHORTCUT_IDS,
  SHORTCUTS,
  SHORTCUT_GROUPS,
  SHORTCUT_IDS,
  type ShortcutGroup,
  type ShortcutId,
} from '@/features/command/store/shortcut-catalog';
export {
  DuplicateShortcutError,
  chordsOf,
  helpRows,
  type HelpRow,
  type ShortcutEntry,
} from '@/features/command/store/shortcut-registry';

export { isMacPlatform } from '@/features/command/lib/key-label';
export type { Chord } from '@/features/command/lib/key-chord';
