<!-- 읽기 조건: E2E 테스트를 작성·수정할 때. 사용감 계측 스크립트는 `tests/feel/AGENTS.md`. -->

# tests/ — AGENTS

## 목적

Playwright E2E(`tests/e2e/`). **합격/불합격을 내는** 유일한 브라우저 테스트다. 값을 찍어 보고서에
옮기는 계측 도구는 `tests/feel/`(별도 AGENTS.md) — 성격이 다르니 섞지 않는다.

## 여기 있는 것 (20개 스펙 · 79건 — Phase 3 공개 범위·복구 반영 기준, `pnpm exec playwright test --list`)

`selection-ring` 9 · `hover-and-focus` 9 · `sync` 7 · `split-viewport` 5 · `smoke` 4 · `cross-category-drag` 3 ·
`category-reorder` 3 · `pomodoro` 3 · `emoji-picker` 3 · `month-view` 6 · `narrow-viewport` 4 ·
`routine-reorder` 2 · `diary-sidebar` 4 · `todo-date-picker` 2 · `profile` 8 · `reports-overflow` 1 · `routine-manager-menu` 1 · `year-month-picker` 1 · `category-visibility` 2 · `social` 2. **스펙을 더하거나 지우면 이 줄과 건수를 같은 PR 에서 고친다.**
개인 기본 off 회귀와 첫 서비스워커 설치·오프라인 쓰기·번들 상한은 기본 서버(3100)에서,
소셜 네 건은 `TASKY_E2E_SOCIAL=1` 서버(3101)의 정확히 세 테스트 계정 allowlist에서 잰다.
공개 범위 복구는 실제 서버 저장 뒤 응답을 끊고 같은 요청 재확인·재로드 뒤 명시 연결까지 검증한다.
`split-viewport` 는 반쪽 창(720·960)에서 달력·패널이 나란한지, 1440 에서 쌍이 가운데인지, 679 가 1열인지, 1280 고정 컬럼에 가로 스크롤이 없는지를 실제 박스로 잰다.
앞의 둘은 "선택됨"·호버·포커스 표시(theme §3-G R17~R20·R29)를 계산된 스타일로(규칙 1), `narrow-viewport` 는 폭 360·375·390
가로 스크롤 없음(app-shell R11)을 실제 박스로, `routine-manager-menu` 는 대화상자 안 팝오버가 눌리는지를
`elementFromPoint` 로 재는 z-index 회귀 가드, `profile` 은 프로필 카드·편집 대화상자(이름·소개 저장과 새로고침 유지, 사진 실변환 — 투명 배경 흰색·EXIF 회전 6·4000×4000 상한·WebP 강제 폴백 JPEG, 키보드로 파일 입력 도달과 label 링, 두 기기 동기화)를, `diary-sidebar` 는 오늘의 기록 카드가 드로어 안에서 써지고 `main` 에는 없으며 새로고침 뒤 남는지·모달이 드로어 위에 뜨는지·드로어를 닫았다 열어도 되돌리기가 되는지·1280×720 고정 컬럼에서 카드 세 장이 한 스크롤 영역에 흐르는지를 잰다. 러너는 `playwright.config.ts`, CI 잡은 `.github/workflows/e2e.yml`.

## 규칙

1. 셀렉터는 `getByRole`/`getByLabel` + **접근 이름**. 클래스·색·DOM 구조에 걸지 않는다 —
   면·토큰·레이아웃을 바꾸는 티켓이 테스트를 부수고, 동시에 화면이 깨져도 통과하는 느슨한 단언이 된다.
   `data-testid` 는 최후 수단. 표시를 그리는 면이 `aria-hidden` 일 때만(색 스와치·타이머 프리셋의 원)
   `evaluate` 안에서 라디오로부터 한 칸 내려간다 — 그 한 칸은 주석으로 못 박는다.
   **보이는 것은 계산된 스타일로 잰다.** 클래스 문자열 단언은 링을 통째로 지워도 초록불이었다
   (T-46 실측 — 1936/1936 통과). 대비 같은 수치는 **계산한다**(실측값을 박으면 조용히 거짓이 된다).
2. **"한때 그랬다" 를 재지 마라.** 직후에 `toHaveCount(0)` 같은 부재 단언을 쓰면 **아직 아무것도
   그려지기 전이라 항상 통과한다**(실제로 `lib/ime.ts` 가드를 통째로 들어내도 통과했다). 부재는
   **제출·재배치가 실제로 일어나는 동기화 지점까지 간 뒤 총량으로** 재고, 순서는 `expect.poll` 로
   최종 상태를 재라.
3. 각 테스트는 새 컨텍스트(IndexedDB 격리)에서 돈다. 데이터를 직접 심지 말고 **UI 경로로** 만든다.
4. **한글 IME 는 CDP 로 재현한다**: `Input.imeSetComposition` 으로 조합을 만들고,
   조합 중 Enter 는 `Input.dispatchKeyEvent`(`windowsVirtualKeyCode: 229`, `text: '\r'`) 또는
   `keyboard.press('Enter')`(`isComposing: true`) 두 갈래가 있다 — `lib/ime.ts` 가 보는 신호가 둘이라
   둘 다 재야 한다. 확정은 `Input.insertText`(조합 문자열을 최종 텍스트로 대체).
5. `playwright` 패키지는 최상위에 링크돼 있지 않다 — `@playwright/test` 를 쓴다.
   이 환경에서 기존 패키지의 브라우저 설치가 `cdn.playwright.dev` 403으로 막히면 config는
   `PLAYWRIGHT_BROWSERS_PATH`의 설치본, 없으면 제공된 `/usr/bin/chromium`을 사용한다.
   실제 사용한 브라우저 버전과 설치 실패는 검증 기록에 남긴다. CI 러너에서는 워크플로가 내려받는다.
6. **기본 `pnpm test`(vitest)에 섞이면 안 된다.** vitest 는 `include: src/**/*.test.{ts,tsx}` 이고
   `exclude` 에 `tests/**` 가 있다(두 겹). 파일을 `src/` 로 옮기거나 확장자를 `.test.ts` 로 바꾸지 마라.
7. 단언을 추가·수정하면 **음성 대조**를 한 번 돌려라 — 앱을 일부러 망가뜨려 그 단언이 정말
   빨간불이 되는지 본다. 확인하고 원복한다(`git stash` 금지 — 워크트리가 공유된다).

## 관할: e2e/ (그 아래에는 별도 `AGENTS.md`를 두지 않는다 — 이 문서가 관할)

## 검증

```bash
pnpm test:e2e 2>&1 | tail -20          # 빌드 + wrangler dev 기동까지 config 가 한다
npx playwright test --repeat-each=5    # 흔들림 확인
```

## 자주 하는 실수

- 사이드바 카테고리 행을 `name: '공부', exact: true` 로 잡기 → 접근 이름에 달성 수가 붙어(`공부 1/1`)
  안 잡힌다. 이름이 고정인 `공부 메뉴` 쪽을 본다.
- 날짜 스트립 칸을 `getByRole('button')` 으로 잡기 → `role="radio"` 라 안 잡힌다.
- 체크 직후 DOM 인덱스로 위치를 재기 → 400ms 뒤 완료 블록으로 옮겨 가 인덱스가 갈린다(todo R8).
- 서버 정리에 `pkill -f wrangler`/`-f e2e` → **자기 셸까지 죽는다**(실제로 한 번 죽였다). PID 로.
