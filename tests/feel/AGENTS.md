<!-- 읽기 조건: 사용감(feel) 계측 스크립트를 돌리거나 고칠 때. -->

# tests/feel/ — AGENTS

## 목적

조립된 앱을 **실제 브라우저에서 연속 동작으로** 써 보고 모션·포커스·CLS·지연·테마·시각을 **수치로** 뽑는
계측 도구. 합격/불합격이 아니라 값을 찍어 `docs/FEEL_REPORT.md` 에 옮기기 위한 것이다.

## 여기 있는 것 / 없는 것

- 있음: `visual-contrast.mjs`(시각 대조·스크린샷) · `state-language.mjs`(선택·호버·포커스·비활성) ·
  `motion-and-latency.mjs` · `focus-and-keyboard.mjs` · `stability-and-theme.mjs` ·
  `density-and-surface.mjs`(잉크 기준 밀도·카드 명도비·그림자 픽셀·선택 링) ·
  `palette-and-longlist.mjs`(팔레트 열린 화면·120건 목록) · `lib/`(하네스 + `probe*.mjs`)
- 없음(다른 곳): E2E → `tests/e2e/` · 단위 테스트 → `src/**/*.test.ts` · 해석과 티켓 배정 →
  `docs/FEEL_REPORT.md`.

## 관할: lib/ — 별도 `AGENTS.md` 를 두지 않는다(이 문서가 관할).

## 규칙 (이 디렉토리에만 적용)

1. **어떤 러너에도 붙이지 않는다** — `vitest` 는 `tests/**` 를 빼고 `playwright` 는 `tests/e2e` 만 본다.
   확장자를 `.test.ts`/`.spec.ts` 로 쓰지 않는 것이 그 전제를 지키는 방법이다.
2. 파일은 `.mjs` — 타입 검사 대상이 아니고 `node` 로 바로 돈다. **ESLint 는 검사한다**(300줄 상한 포함).
3. 브라우저는 `@playwright/test` 의 `chromium`(`playwright` 는 최상위에 없다). 실행 파일은
   `PLAYWRIGHT_BROWSERS_PATH` 에서 직접 찾는다 — **`playwright install` 은 403 으로 막혀 있다.**
4. 서버가 없으면 **멈춘다**(`requireServer`). 못 잰 것은 `null` 로 남기고 보고서에 "측정하지 않았다"
   고 적는다 — 조용히 건너뛰거나 추정값을 넣으면 거짓 기록이 남는다.
5. 셀렉터는 `getByRole`/`getByLabel`. 날짜 셀은 `role="radio"` 라 `getByRole('button')` 으로 안 잡힌다.

## 의존 방향 — 가능: `@playwright/test`·`node:*`·`lib/` / 금지: `src/**`(재는 대상과 도구가 같아진다)

## 검증

```bash
pnpm build && npx wrangler dev --config wrangler.jsonc --port 3200 &   # 서버
for f in visual-contrast state-language motion-and-latency focus-and-keyboard \
         stability-and-theme density-and-surface palette-and-longlist; do
  node "tests/feel/$f.mjs"; done
pnpm lint
```

결과 JSON·스크린샷은 `FEEL_OUT_DIR`(기본 `/tmp/feel-report`)에 떨어진다. 레포에 커밋하지 않는다.

## 자주 하는 실수

- `input[type=checkbox]:checked` 를 그냥 세기 → 타이머의 "소리로 알리기" 까지 세어진다. `li[data-flip-id]` 로 좁혀라.
- DOM 인덱스로 토글 반영을 기다리기 → 400ms 뒤 완료 블록으로 옮겨 가 갈린다. `data-flip-id` 로 고정.
- `pkill -f vite`/`wrangler` 로 서버 정리 → 셸까지 죽는다. PID 로 죽여라.
- 포커스 직후 `outlineColor` 읽기 → `transition-colors` 가 전이시켜 **중간값**이 잡힌다. 300ms 뒤에 읽어라.
- 선택·포커스 표식은 요소가 아니라 **자식**(스와치의 `✓`+테두리)이나 **형제**(타이머 라디오는 숨은
  `input` 옆 `span` 이 다 그린다)에 있을 수 있다. 요소만 보고 "신호 없음" 이라 적지 마라.
- `box-shadow` 의 **첫 조각 알파를 읽지 마라** — Tailwind ring 변수의 `rgba(0,0,0,0) 0 0 0 0` 이 앞에
  붙어 언제나 0 이다. 알파가 0 이 아닌 조각만 골라라. 카드 아래 픽셀은 `dy=-1` 이 보더이므로
  **0 부터** 훑어라(2 부터 시작하면 2px 그림자 띠를 통째로 건너뛴다).
- **절대 날짜를 박지 마라**(`9월 17일` 등) — 하루 뒤 `오늘로 이동` 이 비활성이 되어 모션 계측이
  통째로 죽었다. `harness.mjs` 의 `dayLabel(offset)` 을 써라.
- 많은 항목을 UI 로 심을 때 **대기 없이 Enter 를 연타하면 10% 가량 유실된다**(40건 중 36건, 150ms 면 40/40).
  원인(도구 경합 ↔ 앱)은 아직 안 가렸다 — 세는 대상이 흔들리지 않게 기다려라.
