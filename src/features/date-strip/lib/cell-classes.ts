// 날짜 칸의 상태별 클래스 — 스트립·월 격자(`DateCell`)와 일 피커(`DayPicker`)가 **같은 함수**를
// 부른다(calendar-layout.md §3-A R15-a, features/AGENTS.md 규칙 5 복제 금지). 문자열을 두 컴포넌트에
// 나눠 적으면 한쪽만 고친 뒤 "달력에서 배운 표현을 피커에서 다시 만난다" 는 약속이 조용히 깨진다.
// 이 파일은 React 를 모른다 — 클래스 문자열만 조립한다.
import { cn } from '@/lib/cn';

/** 칸 하나의 상태. `outside` 는 월 격자에서 **보고 있는 달 밖**의 날짜(date-strip R16). */
export type DayCellState = {
  selected: boolean;
  today: boolean;
  outside?: boolean;
};

/**
 * 선택 = 파스텔 채움 + 중립 잉크 안쪽 링(theme.md §3-G R17). 라이트에서 파스텔 채움은 배경과
 * 1.14~2.16:1 뿐이라 채움만으로는 WCAG 1.4.11 의 3:1 에 못 미친다 — 3:1 을 지는 것은
 * `--color-selected-ring`(= --color-text) 링이다. 안쪽 링이라 칸 크기가 변하지 않는다.
 * 채움 유틸은 강조색 이름 그대로 둔다: 선택 채움 토큰이 강조색을 가리켜 렌더 결과가 같은데,
 * 이름만 바꾸면 그 클래스 문자열을 재는 테스트 파일들이 깨진다(그 파일들은 T-49 소유다).
 *
 * 강제 색 모드(Windows 고대비 등)에서는 UA 가 `box-shadow` 를 통째로 `none` 으로 만든다 —
 * 링만 쓰면 선택 표시가 **완전히 사라진다**(실측: 일곱 칸 어디에도 표시가 없었다). 그때만 같은
 * 굵기의 **테두리**로 갈아 단다. `outline` 이 아니라 테두리인 이유는 이 칸이 **포커스를 받기
 * 때문**이다 — 빌드된 CSS 에서 `forced-colors:` 규칙이 `focus-visible:` 보다 뒤에 나와, 윤곽선으로
 * 달면 선택된 칸에서 포커스 링을 덮어써 포커스가 들어와도 화면이 아무 변화가 없다(실측). 테두리는
 * `box-sizing: border-box` 라 칸 크기를 바꾸지 않는다. 색은 지정하지 않는다 — 강제 색 모드는
 * 어차피 시스템 색으로 덮어쓴다.
 */
export const SELECTED_CELL_CLASS =
  'bg-accent text-on-accent ring-[length:var(--control-selected-ring)] ring-selected-ring ring-inset forced-colors:[border-width:var(--control-selected-ring)] forced-colors:[border-style:solid]';

/** 선택 아님 — 투명 배경, hover 는 앱의 다른 클릭 대상과 같은 `--color-surface-2`. */
export const IDLE_CELL_CLASS = 'bg-transparent text-text hover:enabled:bg-surface-2';

/**
 * 오늘(선택 아님) = 강조색 안쪽 링, 채움 없음(date-strip R3 · theme.md §3-G R20). "선택"(채움 +
 * 잉크 링)과는 색도 채움 여부도 달라 겹치지 않는다. 강제 색 모드 대체 표현(테두리)을 두는 이유는
 * `SELECTED_CELL_CLASS` 와 같다 — 이쪽도 `ring`(box-shadow)이 통째로 사라진다.
 */
export const TODAY_CELL_CLASS =
  'ring-2 ring-accent ring-inset forced-colors:[border-width:var(--control-selected-ring)] forced-colors:[border-style:solid]';

/**
 * 칸(버튼)에 붙는 상태 클래스. 오늘이면서 선택이면 강조색 링을 걷어내고 잉크 링만 남긴다 —
 * 두 상태가 같은 칸에서 만나면 채움이 이긴다.
 */
export function dayCellClass({ selected, today }: DayCellState): string {
  return cn(
    selected ? SELECTED_CELL_CLASS : IDLE_CELL_CLASS,
    today && !selected && TODAY_CELL_CLASS,
  );
}

/**
 * 칸 안 날짜 숫자에 붙는 클래스. 오늘은 한 단계 굵고, 이 달 밖 날짜는 **숫자만** 보조 색으로 물린다 —
 * 투명도로 흐리면 대비가 예측 불가능해지고 점·✓ 까지 같이 흐려져 "할 일이 적은 날"처럼 보인다(R16).
 * 선택된 칸은 채움 위 글자색(`text-on-accent`)이 이미 정해져 있어 흐리지 않는다.
 */
export function dayNumberClass({ selected, today, outside = false }: DayCellState): string {
  return cn(today ? 'font-bold' : 'font-semibold', outside && !selected && 'text-muted');
}
