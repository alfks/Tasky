'use client';

// 메인 상단 고정 영역 (app-shell.md §2-A · R3 높이 ≤160px · R15 타이머 칩).
//
// 월 표시·‹ ›·[오늘] 은 `DateStrip` 이 이미 갖고 있다(date-strip §2-A) — 여기서 다시 그리지 않는다.
// 셸이 더하는 것은 그 위 한 줄: ☰ + 앱 이름(사이드바가 컬럼이 아닐 때) · **팔레트 입구** · 타이머 칩 ·
// 달성률(컬럼이 없을 때만, 오버레이를 여는 버튼)이다.
//
// **팔레트 입구가 왜 헤더인가.** 셸에서 **모든 폭에 렌더되는 영역은 이 헤더뿐**이다: 사이드바는
// 모든 폭에서 드로어가 기본이고(calendar-layout.md §1-A), 인사이트 컬럼은 <680(compact) 에서
// 사라진다 — 옛 셸에서는 `단축키 ?` 버튼이 인사이트 컬럼에만 있어서 그 컬럼이 없는 폭(당시 <1280)
// 에서는 팔레트를 가리키는 어포던스가 화면에 **하나도** 없었다(T-36 실측: 5개 폭에서
// 검색/명령 어포던스 0개). 사이드바는 R12 가 "상단에는 앱 이름만, 그 외 진입점을 더하지 않는다" 로
// 이미 닫아 두었고, 인사이트는 접을 수 있어 입구를 둘 자리가 아니다. 남는 자리는 여기 하나다.
//
// **달성률을 헤더에서 두 번 말하지 않는다.** 인사이트 컬럼이 서 있을 때(이제 `wide`·`mid` 양쪽,
// calendar-layout.md R24) 같은 숫자는 선택 날짜 패널의 머리에 링 20px 로 이미 있다
// (calendar-layout.md R5, `ShellDayPanel`) — 그래서 그 갈래에서는 헤더가 **아무것도** 맡지 않는다.
// 컬럼이 없을 때(<680, compact 1열)만 여기 링이 달린 버튼이 되어 오버레이를 연다(R6).
//
// **프로필 카드는 상단 줄과 `DateStrip` 사이의 슬롯이다(profile.md §2, app-shell §2-A).** 두 레이아웃
// (2영역 달력 컬럼·1열 `ShellMain`)이 같은 헤더를 쓰므로 "검색 입구 → 프로필 → 달력" 순서의 마운트
// 지점이 **하나**다. 카드는 어느 폭에서도 자기 높이(카드의 높이 하한, 96px)만 차지한다 —
// 1열에서 달력을 뺀 남는 높이를 채우던 옛 규칙은 휴대폰에서 카드가 달력보다 커지는 비율 붕괴를
// 만들어 걷었다(calendar-layout.md R9 개정 2026-10-04). 달력도 카드 면으로 감싸 세 카드가 같은
// 문법으로 읽히게 한다.
//
// **앱 이름(h1)도 여기로 옮겨 왔다(calendar-layout.md R6).** 사이드바가 드로어가 기본이 되면서
// (calendar-layout.md §1-A) `h1` 이 화면에서 사라지는 자리가 생겼다 — 사이드바가 컬럼일 때는
// `ShellSidebar` 가 보이는 제목을 갖지만, 드로어일 때(이제 대부분의 경우)는 이 줄의 ☰ 오른쪽이
// 그 자리를 맡는다. <768 은 헤더 한 줄 예산(R11) 때문에 `sr-only` 로 남는다 — Tailwind 기본
// `md:` 브레이크포인트(768px)가 그 경계와 정확히 같다.
import type { ReactNode } from 'react';

import type { DateKey } from '@/domain/date/date-key';

import { useBackupStore } from '@/features/backup';
import { ShortcutKeys, chordsOf, useCommandStore } from '@/features/command';
import { DateStrip, useDateStripStore } from '@/features/date-strip';
import { APP_NAME } from '@/features/shell/lib/title';
import { CompletionRing, completionAnnouncement, completionPercentText } from '@/features/stats';
import type { CompletionSummary } from '@/features/stats';
import { useSyncStore } from '@/features/sync';
import { TimerChip } from '@/features/timer';
import { useTodoStore } from '@/features/todo';

import { IconButton } from '@/components/ui/IconButton';

/**
 * 날짜 스트립의 주 요약을 다시 읽게 하는 신호를 **셸이 합성한다** (T-56).
 *
 * 스트립은 자기 투두를 따로 조회해 캐시하므로 저장소가 바뀌면 누군가 알려 줘야 하는데,
 * `date-strip` 은 feature 그래프의 **리프**라(`todo`·`command`·`shell` 이 스트립을 import 한다)
 * 스스로 `@/features/todo`·`@/features/backup` 을 구독할 수 없다 — 하면 `import/no-cycle` 이다.
 * 셸은 세 화살표를 **이미 전부** 갖고 있어 여기서 합치면 새 간선이 0개다.
 *
 * **더하는 이유**: 두 값 모두 단조 증가(쓰기 +1 / 가져오기 성공 +1)라 합도 단조 증가다. 어느 쪽이
 * 올라도 값이 반드시 달라지므로 `useEffect` 가 빠짐없이 다시 돈다. 튜플이나 문자열 결합도 되지만
 * 스트립이 받는 것은 "바뀌었다" 하나뿐이라 수 하나면 충분하고, 참조 동일성 함정도 없다.
 */
function useSummaryRevision(): number {
  const writeRevision = useTodoStore((state) => state.writeRevision);
  const dataRevision = useBackupStore((state) => state.dataRevision);
  // 동기화 엔진이 원격 변경을 채택할 때마다 오른다(sync-engine.ts) — 다른 기기의 변경도 같은
  // 재조회 신호선을 탄다(T94_LAZY_BOUNDARY.md §D-10).
  const syncRevision = useSyncStore((state) => state.dataRevision);
  return writeRevision + dataRevision + syncRevision;
}

/** 오버레이 패널의 id — 여는 버튼의 `aria-controls` 가 가리킨다(열려 있을 때만 존재한다). */
export const INSIGHT_OVERLAY_ID = 'shell-insight-overlay';

/**
 * 접힌 영역의 **자리를 잇는 컨트롤** 표식. 접기 토글이 자기 영역을 없앨 때 셸이 이 표식으로 후임을
 * 찾아 포커스를 넘긴다(`@/lib/focus-fallback`). 접근 이름이 아니라 표식으로 찾는 이유는 문구가
 * 바뀌어도 배선이 끊기지 않게 하려는 것이다.
 */
export const DRAWER_OPENER_ATTR = 'data-shell-drawer-opener';
export const INSIGHT_OPENER_ATTR = 'data-shell-insight-opener';
/** 팔레트 입구의 표식. 문구가 바뀌어도 계측·테스트가 같은 버튼을 집는다(위 두 표식과 같은 이유). */
export const PALETTE_OPENER_ATTR = 'data-shell-palette-opener';

/**
 * 입구의 문구는 **팔레트 입력칸의 접근 이름과 같은 말**이다(`CommandPalette` 의 `aria-label`).
 * 누른 뒤 뜨는 화면이 방금 읽은 말을 되풀이해야 "이걸 눌러서 뭐가 열리는가" 가 한 번에 맞는다.
 */
const PALETTE_ENTRY_LABEL = '할 일 검색 또는 명령';

/**
 * 곁들이는 `⌘K`/`Ctrl+K` 표기는 **단축키 카탈로그에서 꺼낸다**(`chordsOf('palette.open')`).
 * 문자열을 직접 적으면 조합을 바꿀 때 여기만 남고, 플랫폼 갈래(`isMacPlatform`)도 두 벌이 된다 —
 * `ShortcutKeys` 가 이미 그 갈래와 낭독 문장을 함께 갖고 있어 그대로 쓴다(shortcuts R3).
 */
const PALETTE_CHORDS = chordsOf('palette.open');

/**
 * 커맨드 팔레트 입구 (shortcuts §3-B · R11).
 *
 * **`Mod+K` 와 완전히 같은 경로다.** 단축키는 `CommandLayer` 가 `useShortcut('palette.open',
 * openPalette)` 로 이 스토어 액션을 등록해 두었고, 이 버튼도 같은 `openPalette` 를 부른다. 그래서
 * 포커스 복귀 대상이 갈리지 않는다 — 복귀는 `Dialog` 가 **열리는 순간의 `activeElement`** 를 잡아
 * 처리하므로(팔레트 R11), 버튼으로 열면 버튼으로, 키로 열면 그때 포커스가 있던 곳으로 돌아간다.
 * 여기서 포커스를 따로 잡아 두거나 되돌리면 그 경로가 두 벌이 된다.
 *
 * 좁은 폭에서는 문구와 키 칩이 `sr-only` 로 내려가 돋보기만 남는다 — **사라지지는 않는다.**
 * `hidden` 이 아니라 `sr-only` 인 이유: `display:none` 은 접근 이름 계산에서 빠져 버튼 이름이
 * 폭마다 달라진다. 이 방식이면 이름은 모든 폭에서 "할 일 검색 또는 명령 … 컨트롤 + K" 하나다.
 */
function PaletteEntry() {
  const openPalette = useCommandStore((state) => state.openPalette);
  // `sm:` 폭(272)은 **상한**이지 고정 폭이 아니다(`sm:shrink sm:min-w-0`): 2영역의 하한(680,
  // calendar-layout.md R10)에서 달력 컬럼은 336px 뿐이라 ☰ 32 + 간격 8 + 272 = 312 로 이미 꽉 차,
  // 입구가 `shrink-0` 이면 타이머 칩(R15)이 컬럼 밖으로 밀려 패널 머리 위에 겹쳤다(720 실측,
  // FEEL_REPORT §14). 줄어들 때는 안내 문구만 말줄임된다 — 🔍·단축키 표시는 그대로다.
  return (
    <button
      type="button"
      {...{ [PALETTE_OPENER_ATTR]: '' }}
      onClick={openPalette}
      className="flex h-[var(--control-hit-min)] w-[var(--control-hit-min)] shrink-0 items-center justify-center gap-[var(--space-2)] rounded-[var(--radius-full)] border border-border bg-surface px-0 text-sm text-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:w-[17rem] sm:min-w-0 sm:shrink sm:justify-start sm:px-[var(--space-3)]"
    >
      <span aria-hidden="true">🔍</span>
      <span className="sr-only sm:not-sr-only sm:min-w-0 sm:truncate">{PALETTE_ENTRY_LABEL}</span>
      <ShortcutKeys chords={PALETTE_CHORDS} className="ml-auto shrink-0 max-sm:sr-only" />
    </button>
  );
}

type ShellHeaderProps = {
  summary: CompletionSummary;
  /** 상단 줄과 날짜 스트립 사이의 프로필 카드(머리주석). 없으면 슬롯 자체를 그리지 않는다. */
  profile?: ReactNode;
  /** 사이드바가 컬럼으로 서 있는가. 아니면 ☰ 버튼을 낸다(§2-B). */
  sidebarIsColumn: boolean;
  /** 인사이트가 컬럼으로 서 있는가. 아니면 달성률이 오버레이를 여는 버튼이 된다(R6). */
  insightIsColumn: boolean;
  /**
   * 2영역(≥680)이라 **선택 날짜 패널이 항상 같이 떠 있는가** — `AppShell` 의 `threeRegion`
   * 그대로다. 인사이트를 접어도(`insightIsColumn` 이 거짓이어도) `wide`·`mid` 에서는 패널 머리가
   * 이미 같은 달성률 링을 보여주므로(calendar-layout.md R5), 그 갈래에서는 이 헤더가 **링을
   * 반복하지 않는다** — 텍스트만 있는 버튼으로 낮춘다(리뷰 Minor, R5 중복 방지). <680(compact —
   * 패널이 아예 없는 1열)에서만 이 버튼이 유일한 자리라 원래대로 링+퍼센트를 보여준다.
   */
  dayPanelVisible: boolean;
  insightOverlayOpen: boolean;
  onOpenDrawer: () => void;
  /** 타이머 칩·달성률 버튼이 인사이트를 "연다" — 컬럼이면 그리로 데려가고, 아니면 오버레이다. */
  onOpenInsight: () => void;
  onSummaryError: (message: string) => void;
  onDropTodo: (todoId: string, date: DateKey) => void;
};

export function ShellHeader({
  summary,
  profile,
  sidebarIsColumn,
  insightIsColumn,
  dayPanelVisible,
  insightOverlayOpen,
  onOpenDrawer,
  onOpenInsight,
  onSummaryError,
  onDropTodo,
}: ShellHeaderProps) {
  const summaryRevision = useSummaryRevision();
  // 지연 생성 배선(routine.md R6): 스트립이 새 범위를 열 때마다 그 범위 안의 무기한 루틴을
  // 조용히 채운다. `date-strip` 은 `todo` 를 import 할 수 없어(리프, 위 `useSummaryRevision` 주석과
  // 같은 이유) 셸이 콜백으로 받아 스토어 액션에 잇는다. `today` 는 도메인·스토어가 시계를 스스로
  // 읽지 않게 하려고 호출부(날짜 스트립 스토어)가 준다. `revision` 으로 `summaryRevision` 을 그대로
  // 넘긴다 — 낭비 방지 캐시(`todo-routine-fill.ts`)가 `writeRevision` 만 보면 백업 가져오기
  // (`dataRevision` 만 오른다)뒤 재확인이 늦어진다(리뷰 m2).
  const materializeRoutines = useTodoStore((state) => state.materializeRoutines);
  const today = useDateStripStore((state) => state.today);
  return (
    <div className="flex flex-col gap-[var(--space-3)]">
      <div className="flex min-h-[var(--control-hit-min)] shrink-0 items-center gap-[var(--space-2)]">
        {sidebarIsColumn ? null : (
          <>
            <IconButton
              {...{ [DRAWER_OPENER_ATTR]: '' }}
              label="사이드바 열기"
              onClick={onOpenDrawer}
            >
              ☰
            </IconButton>
            <h1 className="sr-only shrink-0 text-lg font-bold text-text md:not-sr-only">
              {APP_NAME}
            </h1>
          </>
        )}
        <PaletteEntry />
        <div className="flex-1" />
        {/*
          R15: 세션이 없으면 칩은 아무것도 렌더하지 않는다 — 자리를 차지하지 않는다.

          `min-w-0` 은 **이 줄에서 유일하게 줄어들 수 있는 것이 칩**이기 때문이다. 400px 에서
          ☰ · 입구 · 칩(최대 224px) · 달성률을 한 줄에 놓으면 388px 이라 336px 를 넘는데, 칩의
          `min-width:auto` 가 내용 폭에서 버티면 **달성률 버튼이 화면 밖으로 밀려 가로 스크롤이
          생긴다**(R4·R11 위반 — 입구를 넣고 실측하다 잡았다). `min-w-0` 을 주면 칩이 먼저 줄고,
          줄어드는 것은 칩 안에서 이미 `truncate` 인 투두 제목이라 시계는 그대로 읽힌다.
        */}
        <TimerChip onOpen={onOpenInsight} className="min-w-0" />
        {insightIsColumn ? null : (
          <button
            type="button"
            {...{ [INSIGHT_OPENER_ATTR]: '' }}
            aria-label="오늘 요약 열기"
            aria-expanded={insightOverlayOpen}
            /* 닫혀 있는 동안 오버레이 패널은 DOM 에 없다 — 없는 id 를 가리키면 보조기술이
               "제어 대상 없음" 으로 읽는다. 열렸을 때만 연결한다(§5). */
            aria-controls={insightOverlayOpen ? INSIGHT_OVERLAY_ID : undefined}
            onClick={onOpenInsight}
            className="flex h-[var(--control-hit-min)] shrink-0 items-center gap-[var(--space-2)] rounded-[var(--radius-full)] border border-border bg-surface px-[var(--space-3)] text-base font-semibold text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {dayPanelVisible ? (
              // 선택 날짜 패널 머리가 이미 같은 숫자를 링으로 보여준다 — 여기서 또 링을 그리면
              // R5 가 금지하는 중복이다. 버튼 자체(오늘 요약 오버레이를 여는 기능)는 남긴다.
              <span aria-hidden="true">오늘 요약</span>
            ) : (
              <>
                <CompletionRing summary={summary} size={20} thickness={3} />
                <span aria-hidden="true">{completionPercentText(summary)}</span>
              </>
            )}
          </button>
        )}
        {/* 달성률을 읽는 라이브 영역은 어느 갈래에서도 **여기 하나**다(§5). */}
        <span aria-live="polite" className="sr-only">
          {completionAnnouncement(summary)}
        </span>
      </div>

      {profile === undefined ? null : <div className="flex">{profile}</div>}

      {/* 달력도 프로필·인사이트와 같은 카드 면이다 — 면 없이 두 카드 사이에 끼면 가장 빽빽해 보였다
          (2026-10-04). 안쪽 여백은 한 단계 좁은 `--space-2`(<768 에서 360 폭의 격자 304px 가 328 가터
          - 테두리 2 - 여백 16 = 310 안에 든다), ≥768 에서 `--space-3` 다. */}
      <div className="rounded-[var(--radius-xl)] border border-border bg-surface p-[var(--space-2)] shadow-sm md:p-[var(--space-3)]">
        <DateStrip
          summaryRevision={summaryRevision}
          onDropTodo={onDropTodo}
          onSummaryError={onSummaryError}
          onVisibleRange={(from, to) =>
            void materializeRoutines({ from, to, today, revision: summaryRevision })
          }
        />
      </div>
    </div>
  );
}
