<!-- 읽기 조건: 사용감(feel) 계측 스크립트를 돌리거나 고칠 때. -->

# tests/feel/ — AGENTS

## 목적

조립된 앱을 **실제 브라우저에서 연속 동작으로** 써 보고 모션·포커스·CLS·지연·테마·시각을 **수치로**
뽑는 계측 도구. 합격/불합격을 내는 테스트가 아니라 값을 찍어 `docs/FEEL_REPORT.md` 에 옮기기 위한 것이다.

## 여기 있는 것 / 없는 것

- 있음: `visual-contrast.mjs`(시각 대조·스크린샷), `state-language.mjs`(선택·호버·포커스·비활성의 표현),
  `motion-and-latency.mjs`, `focus-and-keyboard.mjs`, `stability-and-theme.mjs`,
  `lib/`(하네스 + 페이지 안에서 도는 계측 함수 `probe.mjs`·`probe-state.mjs`)
- 없음(다른 곳): 합격/불합격을 내는 E2E → `tests/e2e/`(`tests/AGENTS.md`). 단위 테스트 → `src/**/*.test.ts`.
  결과 해석과 어느 티켓이 고칠지 → `docs/FEEL_REPORT.md`.

## 관할: lib/

`tests/feel/lib/` 에는 별도 `AGENTS.md` 를 두지 않는다(이 문서가 관할).

## 규칙 (이 디렉토리에만 적용)

1. **어떤 러너에도 붙이지 않는다.** `vitest` 는 `test.include` 가 `src/**` 이고 `exclude` 에 `tests/**` 가
   있어 안 집어간다. `playwright` 는 `testDir: tests/e2e` 라 안 집어간다. 새 파일을 더할 때 이 두 전제를
   깨지 마라 — 파일 확장자를 `.test.ts`/`.spec.ts` 로 쓰지 않는 것이 그 전제를 지키는 방법이다.
2. 파일은 `.mjs`. `tsconfig` 의 `include` 가 `**/*.ts(x)` 라 타입 검사 대상이 아니고 `node` 로 바로 돈다.
   대신 **ESLint 는 검사한다** — `pnpm lint`(파일 300줄 상한 포함)를 통과시켜라.
3. 브라우저는 `@playwright/test` 의 `chromium` 에서 가져온다(`playwright` 패키지는 최상위에 없다).
   실행 파일은 `PLAYWRIGHT_BROWSERS_PATH` 에서 직접 찾는다 — **`playwright install` 은 403 으로 막혀 있다.**
4. 서버가 없으면 **멈춘다**(`requireServer`). 조용히 건너뛰면 "측정했다"는 거짓 기록이 남는다.
   측정하지 못한 것은 `null` 로 남기고 보고서에 "측정하지 않았다"고 적는다 — 추정값을 넣지 않는다.
5. 셀렉터는 `getByRole`/`getByLabel`. 날짜 스트립 셀은 `role="radio"` 라 `getByRole('button')` 으로는
   안 잡힌다(실측).

## 의존 방향

- 가능: `@playwright/test`, `node:*`, `lib/` · 금지: `src/**`(재는 대상과 재는 도구가 같아진다)

## 검증

```bash
pnpm build && npx wrangler dev --config wrangler.jsonc --port 3200 &   # 서버
node tests/feel/visual-contrast.mjs && node tests/feel/state-language.mjs
node tests/feel/motion-and-latency.mjs && node tests/feel/focus-and-keyboard.mjs
node tests/feel/stability-and-theme.mjs
pnpm lint
```

결과 JSON·스크린샷은 `FEEL_OUT_DIR`(기본 `/tmp/feel-report`)에 떨어진다. 레포에 커밋하지 않는다.

## 자주 하는 실수

- `input[type=checkbox]:checked` 를 그냥 세기 → 타이머 패널의 "소리로 알리기" 까지 세어진다. `li[data-flip-id]` 안으로 좁혀라.
- DOM 인덱스로 토글 반영을 기다리기 → 400ms 뒤 항목이 완료 블록으로 옮겨 가 인덱스가 갈린다. `data-flip-id` 로 고정해라.
- `pkill -f vite`/`wrangler` 로 서버 정리 → 셸까지 죽는다. PID 로 죽여라.
- 포커스 직후에 `outlineColor` 를 읽기 → 대부분의 버튼이 `transition-colors` 로 `outline-color` 까지
  전이시켜 **중간값**이 잡힌다. 300ms 기다린 뒤 읽어라(이 오측을 실제로 한 번 냈다).
- 선택 표식이 요소가 아니라 **자식**에 그려질 수 있다(색 스와치의 `✓`+굵은 테두리). 요소만 보고
  "선택 신호 없음" 이라고 적지 마라.
