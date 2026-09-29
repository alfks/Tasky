// `main` 랜드마크의 id — 단일 소스 (app-shell.md R1, calendar-layout.md R1(c)).
//
// `ShellMain.tsx`(<680, 1열)과 `ShellDayPanel.tsx`(≥680, 2영역)가 같은 값을 이 파일에서 가져다 쓴다. 전에는
// 두 파일이 같은 문자열 `'shell-main'` 을 각자 복제해 두고 있었다 — 오타 한 글자면 건너뛰기
// 링크(`SkipLink`)와 e2e 12스펙의 `main#shell-main` 대기가 통째로 죽는데, 어떤 도구도 두 리터럴이
// 갈리는 것을 정적으로 잡아 주지 않는다(리뷰 Nit).
//
// `SkipLink.tsx` 는 `ShellMain.tsx` 가 이 값을 재수출한 것을 그대로 쓴다(이 배선을 바꾸지 않는다).
// `src/features/reports/components/ReportsScreen.tsx`(shell owns 밖)는 같은 문자열을 여전히
// 독립적으로 갖는다 — 이 파일은 import 가 0개라 그쪽이 직접 가져다 써도 순환은 생기지 않는다;
// 갈라진 진짜 이유는 이번 티켓의 owns 경계(이 PR 이 `reports` 를 건드리지 않기로 한 것)다.
// 세 곳을 하나로 묶는 것은 후속 작업.
export const SHELL_MAIN_ID = 'shell-main';
