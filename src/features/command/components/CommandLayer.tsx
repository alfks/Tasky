import type { ReactNode } from 'react';

import { ShortcutHelpDialog } from '@/features/command/components/ShortcutHelpDialog';
import { useShortcut } from '@/features/command/hooks/useShortcut';
import { useShortcutDispatch } from '@/features/command/hooks/useShortcutDispatch';
import { useCommandStore } from '@/features/command/store/command-store';

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
 * 두 번 마운트하면 `?`·`Mod+K` 가 중복 등록된다 — 개발에서는 `DuplicateShortcutError` 로 즉시
 * 터지고, 프로덕션에서는 먼저 마운트된 쪽이 산다(`lib/duplicate-policy.ts`). 조용히 두 번
 * 실행되는 것보다 낫다 — 그 상태에서는 도움말이 열렸다 닫히는 것처럼 보인다.
 *
 * **항목 포커스 키(R2)는 여기서 등록하지 않는다.** 등록은 곧 "도움말에 싣는다" 이고(R5), 아직
 * 아무도 처리하지 않는 키를 도움말에 실으면 눌러도 아무 일이 없는 문서가 된다. 그 키를 실제로
 * 처리하는 목록(T-15)이 `useDocumentedShortcuts(ITEM_SHORTCUT_IDS)` 를 부르면 도움말에
 * 자동으로 나타난다.
 */
export function CommandLayer({ palette }: CommandLayerProps) {
  useShortcutDispatch();

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
