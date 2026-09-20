/**
 * MVP 명령 목록(shortcuts R7)과 등록 훅.
 *
 * ## 왜 여기에 있나 — 임시 거처다
 * R7 의 문면은 "각 기능이 레지스트리에 등록한다" 이고 그게 옳다. 하지만 T-19 의 `owns` 는
 * `CommandPalette*.tsx` 뿐이라 남의 feature 파일에 `registerCommands` 를 넣을 수 없다. 그래서
 * 지금 **순환 없이 닿을 수 있는** feature 의 명령만 여기 모았다. 명령이 자기 feature 로 옮겨 가면
 * 이 파일은 통째로 사라진다 — 팔레트 화면은 레지스트리만 읽으므로 그때 `CommandPalette.tsx` 는
 * 한 줄도 바뀌지 않는다.
 *
 * ## 못 만든 MVP 명령과 그 이유 — **import 순환**이다(핸드오프에 넘긴다)
 * `TodoList` 가 단축키 때문에 `@/features/command` 를 import 한다. 그래서 **`todo` 에 닿는
 * feature 를 command 가 import 하면 순환**이고, 그 순환은 린트가 아니라 **런타임 초기화**에서
 * 터진다(실측: `timer` 를 import 하자 `timer-store.test.ts` 가
 * `Cannot access '__vite_ssr_import_2__' before initialization` 로 죽었다 —
 * `command → timer → todo → command`. `import/no-cycle` 의 `maxDepth: 4` 를 넘어 린트는 조용했다).
 *
 * | 명령 | 필요한 feature | command 에서의 경로 |
 * |---|---|---|
 * | 타이머 시작/일시정지/재개/중지 | `timer` | `timer → todo → command` ✗ |
 * | 새 할 일 | `todo` | `todo → command` ✗ |
 * | 새 카테고리 | `category` | `category → todo → command` ✗ |
 * | 백업 내보내기·복원 열기 | `backup` | `backup → todo → command` ✗ |
 * | 사이드바·인사이트 접기 | `shell` | 배럴에 `useShellUiStore` 가 없다 |
 *
 * 우회하지 않은 이유: 다섯 전부 **그 feature 가 자기 명령을 등록하면**(R7 의 설계 그대로) 순환이
 * 생기지 않고 배럴도 열 필요가 없다. 여기서 동적 import 로 순환을 숨기면 같은 폭탄이 남는다.
 *
 * ## 훅이 아니라 모듈 상수인 이유
 * 스토어를 구독하지 않고 실행 시점에 `getState()` 로 읽는다. 구독하면 명령 배열이 렌더마다 새
 * 참조가 되어 등록 → 해제 → 등록이 반복되고, 그 사이에 `runCommand` 가 오면 명령이 **없다**.
 */
import { useLayoutEffect } from 'react';

import type { ThemeMode } from '@/domain/theme/settings';

import type { Command } from '@/features/command/store/command-registry';
import { useCommandStore } from '@/features/command/store/command-store';
import { useDateStripStore } from '@/features/date-strip';
import { useReportsStore } from '@/features/reports';
import { useThemeStore } from '@/features/theme';

/** 모드 전환 명령 셋(R7). 지금 모드와 같은 것은 `when` 이 감춘다 — 눌러도 아무 일이 없으니까. */
function themeCommand(mode: ThemeMode, label: string, keywords: readonly string[]): Command {
  return {
    id: `theme.${mode}`,
    label,
    keywords,
    when: () => useThemeStore.getState().mode !== mode,
    run: async () => {
      await useThemeStore.getState().setMode(mode);
    },
  };
}

/** 팔레트가 등록하는 명령 전부. 순서는 최근 실행 기록이 없을 때의 기본 순서다(R12). */
export const PALETTE_COMMANDS: readonly Command[] = [
  {
    id: 'date.today',
    label: '오늘로 이동',
    keywords: ['today', '오늘', '날짜'],
    shortcutId: 'date.today',
    run: () => useDateStripStore.getState().goToToday(),
  },
  {
    id: 'date.prevWeek',
    label: '이전 주로 이동',
    keywords: ['prev week', '지난주', '이전주', '날짜'],
    shortcutId: 'date.prevWeek',
    run: () => useDateStripStore.getState().shiftSelected(-7),
  },
  {
    id: 'date.nextWeek',
    label: '다음 주로 이동',
    keywords: ['next week', '다음주', '날짜'],
    shortcutId: 'date.nextWeek',
    run: () => useDateStripStore.getState().shiftSelected(7),
  },
  {
    id: 'date.prevDay',
    label: '하루 전으로 이동',
    keywords: ['prev day', '어제', '이전', '날짜'],
    shortcutId: 'date.prev',
    run: () => useDateStripStore.getState().shiftSelected(-1),
  },
  {
    id: 'date.nextDay',
    label: '하루 뒤로 이동',
    keywords: ['next day', '내일', '다음', '날짜'],
    shortcutId: 'date.next',
    run: () => useDateStripStore.getState().shiftSelected(1),
  },
  themeCommand('light', '라이트 모드로 전환', ['light', '밝게', '테마']),
  themeCommand('dark', '다크 모드로 전환', ['dark', '어둡게', '테마']),
  themeCommand('system', '시스템 설정 따르기', ['system', '자동', '테마']),
  {
    // `reports` 는 위 표의 다섯과 달리 `todo`(따라서 `command`)에 닿지 않는다 — domain·repositories
    // 만 보고 다른 feature 를 import 하지 않는다(date-strip 은 리프라 예외). 그래서 여기서 바로
    // 등록할 수 있다. 화면을 실제로 그리는 자리(`AppShell.tsx`)도 이 등록과 함께 배선돼 있다 —
    // `open` 을 켜면 `ReportsScreen` 이 그 자리에 그려진다.
    id: 'reports.open',
    label: '통계 보기',
    keywords: ['stats', 'report', '통계', '리포트'],
    run: () => useReportsStore.getState().openReports(),
  },
  {
    id: 'help.open',
    label: '단축키 도움말',
    keywords: ['help', '도움말', '단축키'],
    shortcutId: 'help.open',
    run: () => useCommandStore.getState().openHelp(),
  },
];

/**
 * 팔레트가 떠 있는 동안 명령을 등록한다.
 *
 * `useEffect` 가 아니라 `useLayoutEffect` 인 이유: 패시브 효과는 페인트 **뒤**에 돌아, 팔레트를
 * 연 첫 프레임이 "결과가 없어요" 로 한 번 깜빡인다. 레이아웃 효과에서 등록하면 그 리렌더가
 * 페인트 전에 끝난다.
 */
export function usePaletteCommands(): void {
  useLayoutEffect(() => useCommandStore.getState().registerCommands(PALETTE_COMMANDS), []);
}
