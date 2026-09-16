// 셸이 처리하는 전역 단축키 (shortcuts.md R1 의 `이동`·`화면` 묶음).
//
// 조합은 적지 않는다 — `SHORTCUTS` 카탈로그가 단일 소스이고 여기서는 **id 로만** 핸들러를 건다
// (T-17 핸드오프). 등록하는 순간 도움말 표에 나타난다(R5).
import { useShortcut } from '@/features/command';
import { useDateStripStore } from '@/features/date-strip';

type ShellShortcutTargets = {
  /** `Mod+\` — 사이드바 접기/펼치기. 좁은 화면에서는 드로어 열기/닫기다. */
  toggleSidebar: () => void;
};

export function useShellShortcuts({ toggleSidebar }: ShellShortcutTargets): void {
  const shiftSelected = useDateStripStore((state) => state.shiftSelected);
  const goToToday = useDateStripStore((state) => state.goToToday);

  useShortcut('date.prev', () => shiftSelected(-1));
  useShortcut('date.next', () => shiftSelected(1));
  useShortcut('date.prevWeek', () => shiftSelected(-7));
  useShortcut('date.nextWeek', () => shiftSelected(7));
  useShortcut('date.today', goToToday);
  useShortcut('shell.sidebar', toggleSidebar);
}
