<!-- 읽기 조건: index.html 의 분석 비콘을 바꾸거나 빼려 할 때, CSP 를 도입할 때, 방문 수를 다른 방식으로 세려 할 때. -->

# ADR-0021: 방문 수 계측 — Cloudflare Web Analytics 비콘을 `index.html` 에 직접 싣는다

- 상태: accepted
- 날짜: 2026-09-23
- 관련: `index.html`(비콘), `.env.example` §8, `public/privacy.html` 2절, README "데이터와 프라이버시", 가드
  `src/features/theme/store/theme-head.test.ts`·`scripts/check-dist.mjs`, e2e 차단 `tests/e2e/fixtures/stub-login.ts`,
  ADR-0013 · ADR-0015(로그인 필수)

## 맥락

앱이 얼마나 열리는지(로그인 전 화면 포함), 어디서 오는지, 얼마나 빨리 뜨는지를 볼 수단이 없었다. 로그인이
필수라(ADR-0015) 서버 로그만으로는 로그인 화면에서 떠난 방문을 셀 수 없고, `workers.dev` 배포에는 Cloudflare
존(zone) 단위 트래픽 분석이 붙지 않는다. 개인 식별 정보·지속 식별자를 새로 만들지 않는 방법이어야 한다.

## 결정

**Cloudflare Web Analytics 비콘(`static.cloudflareinsights.com/beacon.min.js`)을 루트 `index.html` 의
`<body>` 맨 끝, 앱 모듈 스크립트 뒤에 싣는다.** 토큰은 페이지 소스에 노출되는 공개 값이라 하드코딩한다.
`AuthGate` 보다 앞이라 로그인 여부와 무관하게 모든 방문이 잡힌다.

- 쿠키·로컬 식별자 없이 익명 페이지뷰(주소(경로+쿼리)·리퍼러·user agent·로딩 타이밍)만 보낸다. Cloudflare 는
  이를 나라(IP 추정)·기기 종류·OS 별 **집계**로만 보여 준다 — 방침 2절이 그대로 적는다.
- **위치는 body 끝이다.** Vite 는 모듈 스크립트를 `<head>` 로 끌어올리고, `defer` 스크립트와 모듈 스크립트는
  같은 순서 실행 큐를 공유한다 — 비콘이 앞서면 느리거나 막힌 외부 요청이 앱 부팅을 지연시킨다. 가드:
  `theme-head.test.ts`(소스 순서·중복)와 `check-dist.mjs`(빌드 산출물에서 비콘이 진입 모듈 뒤에 있는지).
- **정직하게 적어 둔다: 구현과 이 ADR 이 같은 PR 에 실렸다.** `docs/decisions/AGENTS.md` 규칙 3 의 "코드 변경과
  분리" 예외 — 방침 문서 수정과 한 묶음이어야 배포본과 공개 문서가 어긋나는 순간이 없다.

## 대안과 기각 이유

| 대안                       | 기각 이유                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| 아무것도 안 한다           | 방문 수·로딩 속도를 볼 근거가 없다. 로그인 전 이탈은 서버 로그에도 남지 않는다             |
| Cloudflare 존 트래픽 분석  | `workers.dev` 서브도메인에는 제공되지 않는다. 커스텀 도메인을 붙이면 재검토(아래 트리거)   |
| Worker + D1 에 자체 카운터 | 스키마·엔드포인트·IP 처리 방침을 새로 만들어야 한다. 셀프 구현이 개인정보 면에서 더 무겁다 |

## 결과

- 좋은 점: 개인 식별 없이 방문 수·리퍼러·성능을 본다. 앱 코드·스키마·번들 변경 0.
- 감수하는 점:
  - 번들 예산 밖의 **외부 런타임 스크립트** 하나(첫 로드 요청 1개 추가, 실패해도 앱은 영향 없음, SRI 불가). 오프라인
    PWA 세션은 비콘이 못 나가 **과소 집계**된다.
  - e2e 는 `stub-login.ts` 의 route abort 로 비콘을 막는다. **남은 오염은 `pnpm dev`·`pnpm start` 로컬 방문뿐** →
    **후속: 프로덕션 빌드에서만 주입**(Vite `%VITE_*%` 치환이나 `transformIndexHtml`).

## 지켜야 할 규칙 (검증 가능한 문장 — 리뷰 판정 근거)

1. 비콘은 루트 `index.html` 의 앱 모듈 스크립트 **뒤**에만 있다. `public/privacy.html` 에는 넣지 않는다(`public/AGENTS.md` 규칙 6).
2. 비콘이 보내는 항목이 바뀌면 `public/privacy.html` 2절과 시행일을 같은 PR 에서 고친다.
3. **CSP 를 도입하면** `script-src` 에 `https://static.cloudflareinsights.com`, `connect-src` 에
   `https://cloudflareinsights.com` 을 허용한다 — 빠지면 비콘이 조용히 죽는다.
4. 토큰을 `.env`·시크릿으로 옮기지 않는다(공개 값). 바꾸면 `index.html`(비콘 태그)·`scripts/check-dist.mjs`
   (빌드 가드)·`src/features/theme/store/theme-head.test.ts`(소스 가드)·`.env.example` §8(참고 항목) 네 곳을 한 PR 에서 같이 고친다.

## 재검토 트리거

- 커스텀 도메인을 붙일 때: 존 자동 주입·same-origin `/cdn-cgi/rum` 전환 검토(SRI 불가한 무버전 외부 스크립트 제거 기회).
- 사용자별·기기별 지표(리텐션 등)가 필요해질 때 — 그때는 이 비콘으로는 안 되고 방침을 먼저 바꿔야 한다. CSP 도입 시(규칙 3)도 마찬가지로 재검토한다.
