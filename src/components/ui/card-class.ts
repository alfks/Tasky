// 상시 카드 한 장의 면 (app-shell.md §2-A-1 "면과 고도" — 값의 단일 소스는 그 절이다).
//
// 사이드바의 카드 세 장(카테고리·D-day·오늘의 기록)과 도구 줄이 **같은 문자열**을 쓴다 — 한 컬럼
// 안에서 면의 문법이 갈리면 그 자체가 결함이다(FEEL_REPORT §9-2). diary 는 shell 을 import 할 수
// 없으므로(조립 방향) 공용 UI 계층에 둔다. 안쪽 여백은 `--space-3` — 인사이트 카드(`ShellInsights`,
// `--space-4`)만 더 넓은 자기 값을 갖는다.
export const CARD_CLASS =
  'rounded-[var(--radius-xl)] border border-border bg-surface p-[var(--space-3)] shadow-sm';
