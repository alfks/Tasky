import { ShortcutKeys } from '@/features/command/components/ShortcutKeys';
import { isMacPlatform } from '@/features/command/lib/key-label';
import { useCommandStore } from '@/features/command/store/command-store';
import { SHORTCUT_GROUPS, type ShortcutGroup } from '@/features/command/store/shortcut-catalog';
import { helpRows, type HelpRow } from '@/features/command/store/shortcut-registry';

import { Dialog } from '@/components/ui/Dialog';

type ShortcutHelpDialogProps = {
  open: boolean;
  onClose: () => void;
  /** 표기 플랫폼(R3). 기본값은 지금 브라우저. */
  isMac?: boolean;
};

/**
 * 단축키 도움말(R5). **표는 등록된 단축키에서 생성된다** — 이 파일에 손으로 적은 키 목록은 없다.
 * 새 단축키는 `shortcut-catalog.ts` 에 적고 어딘가에서 `useShortcut` 으로 등록하면 여기 나타난다.
 */
export function ShortcutHelpDialog({
  open,
  onClose,
  isMac = isMacPlatform(),
}: ShortcutHelpDialogProps) {
  const shortcuts = useCommandStore((state) => state.shortcuts);
  const rows = helpRows(shortcuts);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="단축키"
      description="입력 중이거나 창이 떠 있을 때는 단축키가 동작하지 않아요."
      className="max-w-[520px]"
    >
      {rows.length === 0 ? (
        <p className="text-base text-muted">아직 등록된 단축키가 없어요.</p>
      ) : (
        <div className="flex flex-col gap-[var(--space-5)]">
          {SHORTCUT_GROUPS.map((group) => (
            <ShortcutHelpGroup
              key={group}
              group={group}
              rows={rows.filter((row) => row.group === group)}
              isMac={isMac}
            />
          ))}
        </div>
      )}
    </Dialog>
  );
}

type ShortcutHelpGroupProps = {
  group: ShortcutGroup;
  rows: readonly HelpRow[];
  isMac: boolean;
};

/** 묶음 하나 = 표 하나. `<caption>` 이 묶음 이름이라 낭독기가 표에 들어갈 때 맥락을 먼저 듣는다. */
function ShortcutHelpGroup({ group, rows, isMac }: ShortcutHelpGroupProps) {
  if (rows.length === 0) return null;
  return (
    <table className="w-full border-collapse text-base">
      <caption className="mb-[var(--space-2)] text-left text-sm font-semibold text-muted">
        {group}
      </caption>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-t border-border first:border-t-0">
            <th
              scope="row"
              className="py-[var(--space-2)] pr-[var(--space-3)] text-left font-normal text-text"
            >
              {row.description}
            </th>
            <td className="py-[var(--space-2)] text-right whitespace-nowrap">
              <ShortcutKeys chords={row.chords} isMac={isMac} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
