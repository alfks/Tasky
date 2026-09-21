<!-- 읽기 조건: E2E 테스트를 작성·수정할 때. 사용감 계측 스크립트는 `tests/feel/AGENTS.md`. -->

# tests/ — AGENTS

## 목적

Playwright E2E(`tests/e2e/`). **합격/불합격을 내는** 유일한 브라우저 테스트다. 값을 찍어 보고서에
옮기는 계측 도구는 `tests/feel/`(별도 AGENTS.md) — 성격이 다르니 섞지 않는다.

## 여기 있는 것 (11개 스펙 · 35건 — `becf8ae` 기준)

`selection-ring` 9 · `hover-and-focus` 6 · `smoke` 3 · `cross-category-drag` 3 · `category-reorder` 3 ·
`pomodoro` 3 · `emoji-picker` 3 · `month-view` 2 · `narrow-viewport` 1 · `reports-overflow` 1 ·
`routine-manager-menu` 1. **스펙을 더하거나 지우면 이 줄과 건수를 같은 PR 에서 고친다.**
앞의 둘은 "선택됨"·호버·포커스 표시를 계산된 스타일로(규칙 1), `narrow-viewport` 는 폭 360·375·390
가로 스크롤 없음(app-shell R11)을 실제 박스로, `routine-manager-menu` 는 대화상자 안 팝오버가 눌리는지를
`elementFromPoint` 로 재는 z-index 회귀 가드다. 러너는 `playwright.config.ts`, CI 잡은 `.github/workflows/e2e.yml`.

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
   **`playwright install` 은 이 환경에서 403 으로 막힌다**(브라우저는 `PLAYWRIGHT_BROWSERS_PATH` 에
   이미 있고 config 가 직접 찾는다). CI 러너에서는 워크플로가 내려받는다.
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
