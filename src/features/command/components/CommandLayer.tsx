import type { ReactNode } from 'react';

import { ShortcutHelpDialog } from '@/features/command/components/ShortcutHelpDialog';
import { useDocumentedShortcuts, useShortcut } from '@/features/command/hooks/useShortcut';
import { useShortcutDispatch } from '@/features/command/hooks/useShortcutDispatch';
import { useCommandStore } from '@/features/command/store/command-store';
import { ITEM_SHORTCUT_IDS } from '@/features/command/store/shortcut-catalog';

type CommandLayerProps = {
  /**
   * 커맨드 팔레트(T-19). **열려 있을 때만** 렌더되므로 팔레트는 열림 상태를 따로 읽지 않아도 되고,
   * 닫기는 `useCommandStore(s => s.closePalette)` 를 부르면 된다. 이 prop 을 주지 않으면 `Mod+K` 는
   * 상태만 바꾸고 아무것도 그리지 않는다 — 팔레트가 컷 라인을 넘어가도 셸은 그대로 돈다.
   */
  palette?: ReactNode;
};

/**
 * 앱 전체에서 **한 번만** 마운트하는 단축키 레이어(T-20 이 셸에 놓는다).
 *
 * 두 번 마운트하면 `?`·`Mod+K` 가 중복 등록되어 `DuplicateShortcutError` 로 즉시 터진다. 조용히
 * 두 번 실행되는 것보다 낫다 — 그 상태에서는 도움말이 열렸다 닫히는 것처럼 보인다.
 */
export function CommandLayer({ palette }: CommandLayerProps) {
  useShortcutDispatch();
  // 항목 포커스 키(R2)는 처리하지 않고 도움말에만 싣는다 — 처리는 투두·카테고리 행이 한다.
  useDocumentedShortcuts(ITEM_SHORTCUT_IDS);

  const openHelp = useCommandStore((state) => state.openHelp);
  const closeHelp = useCommandStore((state) => state.closeHelp);
  const openPalette = useCommandStore((state) => state.openPalette);
  const helpOpen = useCommandStore((state) => state.helpOpen);
  const paletteOpen = useCommandStore((state) => state.paletteOpen);

  useShortcut('help.open', openHelp);
  useShortcut('palette.open', openPalette);

  return (
    <>
      <ShortcutHelpDialog open={helpOpen} onClose={closeHelp} />
      {paletteOpen ? palette : null}
    </>
  );
}
