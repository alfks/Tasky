<!-- 읽기 조건: 빌드·배포 파이프라인(index.html · vite.config.ts · wrangler.jsonc · serwist.config.js · 배포 워크플로)을 바꾸기 전, 또는 Next.js/Vinext 로 되돌릴지 검토할 때. -->

# ADR-0013: 빌드 스택을 순수 Vite + React SPA 로 되돌리고 Dexie 를 지연 로드한다

- 상태: accepted
- 날짜: 2026-09-16
- 관련: **ADR-0010 을 supersede**(ADR-0001 의 "Next.js App Router" 부분도 같이 대체), docs/specs/pwa.md, docs/specs/theme.md §3-E·§3-F, docs/TECH_PLAN.md §1·§10

## 맥락 — 무엇을 재서 이 결정을 했나

ADR-0010 은 "`src/app` App Router 규약을 버리지 않는 것"을 Vinext 채택의 핵심 근거로 삼았다. 그 뒤 실제로
쌓인 코드를 재 보니 **그 규약을 쓰고 있지 않았다.**

`main 79359b4` 기준 실측:

| 사실                                                               | 값                                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `src/**` 의 `next/*` **런타임** import                             | 0건                                                                                         |
| 라우트                                                             | 1개 (`/`)                                                                                   |
| 서버 컴포넌트·RSC 경계·`generateMetadata`·route handler·middleware | 0건                                                                                         |
| 남은 Next.js 의존                                                  | **타입 import 2건** — `layout.tsx` 의 `Metadata`, `manifest.ts` 의 `MetadataRoute.Manifest` |

그런데 그 타입 2건의 대가로 첫 로드 JS(gzip 162.2 kB)의 **20%** 를 Vinext 런타임에 내고 있었다.

| 청크              | gzip         | 비중    |
| ----------------- | ------------ | ------- |
| React + React DOM | 67,666 B     | 42%     |
| Dexie             | 32,649 B     | 20%     |
| **Vinext 런타임** | **32,404 B** | **20%** |
| 앱 코드 전부      | 32,342 B     | 20%     |

게다가 Vinext 는 experimental(`1.0.0-beta.10`)이고, ADR-0010 의 실측표에 이미 ❌·⚠️ 가 4칸 있었다
(metadata 파일 라우트 미추출 · route handler 미추출 · middleware 부분 적용 · `next/font` 없음).
**값을 못 받는 호환 계층에 20% 를 내고 있었다**는 것이 이 ADR 의 한 줄 요약이다.

## 결정

1. **Vinext 를 걷어내고 순수 Vite + React SPA 로 빌드한다.** 빌드 CLI 는 `vite build`, 진입점은 루트
   `index.html` → `src/app/main.tsx`.
2. **라우터를 넣지 않는다.** 라우트가 `/` 하나라 진입점이 곧 화면이다. 번들을 줄이려는 변경에 라우터를
   얹으면 목적이 상쇄된다. 두 번째 라우트가 필요해지면 그때 ADR 로 고른다(§재검토 트리거).
3. `layout.tsx` 의 `metadata` 와 JSX `<head>` → **`index.html` 의 정적 `<head>`**.
   `src/app/manifest.ts` → **`public/manifest.webmanifest` 정적 파일**(내용 동일 — 아래 §결과).
4. **프리렌더를 포기한다.** 로컬 우선 앱이라 프리렌더 HTML 의 내용이 빈 셸(`<main><h1>Tasky</h1></main>`)
   뿐이고, 데이터는 어차피 클라이언트에서 IndexedDB 로 온다. 대신 `index.html` 자체가 정적 파일이라
   프리캐시·오프라인 새로고침(pwa R3)은 그대로 성립한다.
5. **배포는 Cloudflare Workers 를 유지하되 Worker 코드를 없앤다.** SPA 라 서버에서 할 일이 0 이므로
   `wrangler.jsonc` 에서 `main` 을 빼고 정적 자산만 올린다(`not_found_handling: "single-page-application"`).
6. **`next` 를 devDependencies 에서 제거한다.** 타입 2건이 사라졌으므로 남길 이유가 없다.
   `eslint-config-next` 는 **남긴다** — `react`/`react-hooks`/`jsx-a11y`/`import` 플러그인 설정을 그 패키지가
   주고 있고, `next` 패키지 없이도 로드된다(실측: `pnpm lint` rc=0).
7. **Dexie 를 지연 로드한다.** `src/app/providers.tsx` 의 `@/infra/indexeddb/repositories` import 를 동적으로
   바꿔 Dexie(gzip 32.5 kB)를 진입 청크에서 뗀다. 주입이 끝날 때까지 `Skeleton` 을 보인다.
   `container.ts` 의 `getRepositories()` 는 **동기 그대로**다 — 비동기가 된 구간은 조립 지점 한 곳에 갇힌다.
8. **동적 청크에 `<link rel="modulepreload">` 를 붙인다**(`vite.config.ts` 의 `tasky:preload-async-chunks`).
   없으면 진입 청크를 실행한 뒤에야 Dexie 청크를 발견해 왕복이 직렬로 쌓인다(아래 §결과 측정).

## 대안과 기각 이유

| 대안                                     | 기각 이유                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| Vinext 유지                              | 위 표 — 쓰지 않는 호환 계층에 첫 로드의 20%. experimental 의존도 그대로 남는다       |
| Next.js 15 로 복귀                       | Vinext 보다 무겁고, Workers 에 얹으려면 어댑터가 하나 더 는다(ADR-0010 이 이미 기각) |
| React Router / TanStack Router 도입      | 라우트가 1개다. 번들을 줄이려는 변경에 +10~20 kB 를 얹는다                           |
| Dexie 를 진입 청크에 그대로 두기         | 첫 로드의 20%. 첫 페인트에 필요 없는데도 파싱·실행 경로에 들어간다                   |
| Dexie 를 `React.lazy`/Suspense 로 감싸기 | 조립 지점이 렌더 트리에 얽힌다. 지금 필요한 것은 "주입 완료까지 기다리기" 한 줄이다  |

## 결과 — 실측

### 번들 (같은 방법: `dist/client` 의 JS 를 파일별로 `gzip -9` 해 합산)

| 축                                                | 전 (`4640485`, Vinext) | 후 (이 PR)    | 변화       |
| ------------------------------------------------- | ---------------------- | ------------- | ---------- |
| **첫 로드 네트워크 JS**(문서가 받는 모든 청크 합) | **167,389 B**          | **109,964 B** | **−34.3%** |
| **첫 로드 파싱·실행 블로킹 JS**(진입 청크)        | 167,389 B              | **77,429 B**  | −53.7%     |
| 지연 청크(Dexie + infra)                          | —                      | 32,535 B      | —          |
| dist/client JS 전부                               | 181,430 B              | 109,964 B     | −39.4%     |
| CSS                                               | 5,685 B                | 5,680 B       | ±0         |

**두 축을 반드시 같이 읽는다.** Vinext 판에서는 지연 청크가 없어 두 축이 같은 값이지만, 이 PR 에서는
Dexie 청크가 같은 `<head>` 의 `modulepreload` 로 **동시에 내려온다** — 네트워크로는 109,964 B 를 받고,
그중 진입 청크 77,429 B 만 첫 페인트 경로에서 파싱·실행된다. `−53.7%` 한 숫자만 인용하면
"네트워크 전송량이 반으로 줄었다"는 오독을 부른다.

첫 로드 77,429 B 의 구성(같은 코드를 수동 분할해 잰 값):
React+ReactDOM+scheduler 67,368 B · tailwind-merge+clsx 8,513 B · 앱 코드 1,729 B + 런타임 397 B.

**확정(구조적) 감소는 65,234 B 다** — Vinext 런타임 32,365 B + RSC 클라이언트 런타임 32,488 B(main 의
`index-*.js`). 그 청크를 한때 "앱 코드"로 셌지만 실제 정체는 RSC 런타임이다: `createFromReadableStream`·
`hydrateRoot` 가 들어 있고 **한글 문자열이 0개**다(앱의 한글 문자열은 전부 1,611 B 짜리
`settings.rules-*.js` 에 있었다). 이 65 kB 는 기능이 붙어도 돌아오지 않는다.

**과대 해석 금지 — 기능이 붙으면 다시 느는 몫.** Vinext 는 `'use client'` 컴포넌트를 진입점에서 도달하지
못해도 전부 클라이언트 청크로 냈고, Vite 는 도달 가능한 모듈만 낸다. 지금 `page.tsx` 가 화면을 거의
렌더하지 않으므로 그 몫이 빠져 있다. 다만 **되돌아올 몫은 32 kB 가 아니다** — 이미 머지된
`components/ui/*` 14종 + 테마 스토어를 전부 도달 가능하게 만들어 재 보니 진입 청크 77,429 → **86,720 B**
(+9,291), 네트워크 합 **119,710 B** 였다. 즉 미머지 feature 코드 없이도 아래 §재검토 트리거의 120 kB 에
사실상 도달한다.

새로 생긴 비용도 적어 둔다: 지연 로드 때문에 `Providers` 가 `Skeleton` 을 렌더하게 되면서
`tailwind-merge`+`clsx` **8,720 B** 가 진입 청크로 들어왔다(Vinext 판에서는 도달 불가라 lazy 청크에 있었다).
Dexie 지연 로드의 순효과는 −32.5 kB 가 아니라 **−23.8 kB** 다.

> 측정 방법: `dist/client` 의 JS 를 파일별 `gzip -9` 해 합산. `scripts/check-dist.mjs` 는 같은 값을
> Node `zlib.gzipSync({level:9})` 로 재므로 CLI 값보다 파일당 40~80 B 크게 나온다(헤더 차이).

### 첫 페인트(theme R6·R11) — 실제 Chromium 141 프레임 캡처

방법: 이전 문서를 `#ff00ff` 로 칠해 두고(잡힌 흰 프레임이 반드시 새 문서의 것임을 보장) CPU 6x 스로틀 +
`Page.startScreencast(png)` 로 프레임을 받아 중앙 25점 평균색을 분류.

| 시나리오                                                   | 새 문서 첫 프레임 | 흰 프레임 |
| ---------------------------------------------------------- | ----------------- | --------- |
| 미러 없음 + OS 다크                                        | dark              | 0         |
| 미러 `dark` + OS 라이트                                    | dark              | 0         |
| 미러 `system` + OS 다크                                    | dark              | 0         |
| 미러 손상(`{not json`) + OS 다크                           | dark              | 0         |
| `localStorage.getItem` throw + OS 다크                     | dark              | 0         |
| 미러 `light` + OS 다크 (라이트가 정답)                     | WHITE             | 5 (정상)  |
| **[대조군] 미러 `dark` + OS 라이트 + 스크립트 250ms 지연** | **WHITE**         | **3**     |

마지막 줄이 검출기가 실제로 회귀를 잡는다는 증거다. 대조군 없이 "흰 프레임 0" 만 보고하면 그 0 은
아무 의미가 없다. 부수 관찰: **OS 다크에서는 스크립트를 지워도 흰 프레임이 안 나온다** —
`tokens.css` 의 `prefers-color-scheme: dark` 블록이 받아 주기 때문이다. 스크립트가 실제로 막고 있는 회귀는
**"OS 라이트 + 저장된 다크"** 경로다.

### Dexie 지연 로드의 체감 (같은 wrangler dev 서버, CPU 6x + 1.6 Mbps/150 ms, 콜드, 5회 중앙값)

|                                   | 스켈레톤 첫 등장 | 첫 데이터 렌더(children) |
| --------------------------------- | ---------------- | ------------------------ |
| 지연 로드 + modulepreload (이 PR) | 1,477 ms         | **1,512 ms**             |
| 정적 import(비교용 빌드)          | 1,648 ms         | 1,665 ms                 |
| 지연 로드, modulepreload **없이** | 1,279 ms         | 1,736 ms                 |

즉 modulepreload 가 없으면 지연 로드는 "첫 UI 는 빨라지지만 데이터는 느려지는" 맞바꿈이 되고(+71 ms),
붙이면 **양쪽 다 빨라진다**(−153 ms). 로컬(스로틀 없음)에서 스켈레톤 노출은 10~15 ms 다.

### 배포

`wrangler deploy --config wrangler.jsonc` 하나로 통일했다(빌드가 wrangler 설정을 다시 만들지 않는다).
`--dry-run` 은 자격증명 없이 rc=0 (실측: `dist/client` 12 파일 업로드 대상, `No bindings found`.
wrangler 로그는 `Read 14 files` 라고 찍지만 실제 파일은 12개다 — 내부 카운트가 달라 근거 수치로 쓰지 않는다).

### 잃는 것 (되돌릴 때 필요한 정보)

- **프리렌더 HTML 이 없다.** `/` 의 초기 HTML 은 빈 `<div id="root">` 다. 첫 _콘텐츠_ 페인트가 JS 실행 뒤로
  밀린다. 콜드 FCP 실측(5회 중앙값, 캐시 비활성, 같은 `wrangler dev`):

  | 조건                           | 전(프리렌더) | 후(SPA)    |
  | ------------------------------ | ------------ | ---------- |
  | Fast 3G(1.6 Mbps) + CPU 6× FCP | 596 ms       | 1,524 ms   |
  | 〃 첫 **배경**(테마) 페인트    | 596 ms       | **556 ms** |
  | 광대역(20 Mbps) + CPU 1× FCP   | 188 ms       | **176 ms** |

  **타깃 프로필에서는 회귀가 아니다** — 이 앱은 데스크탑 웹앱이고 광대역에서는 오히려 12 ms 빠르다.
  느린 회선에서 늘어난 928 ms 는 "흰 화면 → 어두운 화면" 이 아니라 **"올바른 테마 색의 빈 화면"** 시간이다
  (첫 배경 페인트는 프리렌더 판보다 오히려 40 ms 빠르다 — 받을 HTML 이 작아서다).
  그리고 잃은 프리렌더의 내용물은 `<main><h1>Tasky</h1></main>` 뿐이다 — 실제 투두·날짜 스트립은
  IndexedDB 에서 오므로 어느 스택이든 JS 뒤다. SEO·OG 미리보기가 필요해지면 이 항목이 먼저 걸린다.

- **Next.js API 호환이 전부 사라졌다.** `metadata`/`generateMetadata`, route handler, middleware,
  server action, `next/font`, `next/image`, 파일 기반 라우팅 — 하나도 없다. 되돌리려면 ADR-0010 의
  실측표를 다시 읽는 것으로 시작한다(그 문서는 지우지 않았다).
- **404 페이지가 없다.** `not_found_handling: "single-page-application"` 이 모든 경로에 `index.html` 200 을
  돌려준다. 404 를 구분해야 하면 Worker 스크립트를 되살려야 한다.
- **`_headers` 의 경로가 바뀌었다**: `/_next/static/*` → `/assets/*`. `vite.config.ts` 의 `build.assetsDir` 과 한 쌍이다.

### 얻는 것

첫 로드 네트워크 JS −57,425 B(−34.3%) / 진입 청크 −89,958 B(−53.7%) · 그중 **확정 65,234 B** 는 Vinext+RSC 런타임이라 기능이 붙어도 돌아오지 않는다 · experimental 의존 3개 제거(`vinext`·`@vinext/cloudflare`·`@vitejs/plugin-rsc`)

- `next`·`react-server-dom-webpack`·`@cloudflare/vite-plugin` 제거(설치 패키지 87개 감소) · 빌드 10.2 s → 1.8 s ·
  Worker 코드 0(정적 자산 전용 배포) · manifest 가 **정적 파일이 되어 이제 프리캐시에 들어간다**(ADR-0010 에서는
  Worker 동적 서빙이라 못 들어갔다).

## 지켜야 할 규칙 (검증 가능한 문장 — 리뷰 판정 근거)

1. **문서 `<head>` 의 단일 소스는 루트 `index.html` 이다.** 첫 페인트 테마 스크립트는 **동기 인라인**이고
   `theme-color` 메타보다 **뒤**에 온다. 본문은 `THEME_INIT_SCRIPT` 와 같아야 한다 —
   `theme-head.test.ts` 의 `index.html 배선` 이 이 넷을 전부 검사한다.
2. `next`·`vinext` 계열 패키지를 되살리지 않는다. 되살릴 이유가 생기면 이 ADR 을 supersede 한다.
3. 서비스워커 설정은 `serwist.config.js` + `src/sw.ts` 에만. `vite.config.ts` 에 SW 플러그인을 넣지 않는다
   (`vite-plugin-pwa` 는 ADR-0010 에서 이미 기각).
4. `wrangler.jsonc` 에 `main` 을 되살리지 않는다. Worker 코드가 생기면 그것은 "서버 기능이 생겼다"는 뜻이고
   ADR 이 필요하다.
5. `public/_headers` 의 `/assets/*` 와 `vite.config.ts` 의 `build.assetsDir` 은 **한 쌍**이다. 한쪽만 바꾸면
   콘텐츠 해시 자산이 1년 immutable 캐시를 잃는다. `scripts/check-dist.mjs` 가 매 빌드 `dist/client` 의
   `.js`·`.css`·`.woff2` **파일 하나하나**를 `_headers` 글롭에 대조한다 — 규칙 줄의 존재가 아니라
   **경로 커버리지**를 본다(그래야 `assetsDir` 만 바꾸는 경우도 걸린다. 음성 대조 실측: 양쪽 변이 모두 rc=1).
6. **오프라인 보장 대상은 프리캐시된 정적 파일뿐이다.** 오프라인에 필요한 파일은 `public/` 에 둔다.
   프리캐시 목록에 `index.html`·`manifest.webmanifest`·아이콘 3개·woff2·CSS 가 있는지는
   `scripts/check-dist.mjs` 가 매 빌드 확인한다(`pnpm build` 의 마지막 단계).
7. **`providers.tsx` 의 infra import 는 동적이어야 한다.** 정적으로 되돌리면 Dexie 가 진입 청크로 돌아온다
   (실측: 진입 청크 gzip 77,429 B → 109,025 B). lint·tsc·기존 테스트·빌드는 그래도 전부 초록이었으므로
   장치를 둘 달았다 — `build-stack.test.ts` 가 소스 표기를, `check-dist.mjs` 가 산출물에서
   **진입 청크에 Dexie 가 없는지 + 진입 청크 gzip ≤ 100 kB** 를 잰다(음성 대조 실측: 둘 다 rc=1).
   동적 청크의 modulepreload(규칙 8)도 `check-dist.mjs` 가 같이 본다.
8. **배포 명령의 단일 소스는 `package.json` 의 `deploy` 스크립트**다(ADR-0010 규칙 8을 그대로 승계).
   `deploy:dry-run` 은 거기에 `--dry-run --outdir` 만 얹고, 배포 워크플로는 두 스크립트를 그대로 호출한다.
   워크플로에 wrangler 명령을 따로 적으면 로컬에서 확인한 명령과 CI 가 실행하는 명령이 갈라진다.
9. 배포 워크플로는 시크릿 부재 시 실패한다 — 배포 스텝에 `if:` 조건이나 `continue-on-error` 를 붙이지 않는다.

## 재검토 트리거

- **두 번째 라우트가 필요해질 때** — 라우터를 넣을지, `index.html` 을 여러 장 낼지(Vite 멀티 페이지)를 고른다.
  서비스워커 프리캐시 목록에 그 문서가 들어가는지 먼저 확인한다(규칙 6).
- **서버 기능(동기화 API·인증·OG 이미지 생성)이 필요해질 때** — `wrangler.jsonc` 에 `main` 이 돌아오고,
  그때가 Next.js/Vinext 복귀를 다시 저울질할 시점이다. ADR-0010 의 실측표가 그 비교의 출발점이다.
- **SEO·링크 미리보기가 요구사항이 될 때** — 프리렌더가 없다는 것이 바로 걸린다.
- **예산을 넘을 때 — `scripts/check-dist.mjs` 가 매 빌드 재고 빌드를 실패시킨다.** 축을 둘로 나눠 적는다:
  **진입 청크 gzip 100 kB**(파싱·실행 블로킹 — 현재 77.4 kB)와 **첫 로드 네트워크 JS gzip 120 kB**
  (현재 110.0 kB). 두 번째 값은 **이미 임박했다** — 기존 머지 코드를 화면에 붙이기만 해도 119.7 kB 다.
  그러니 이 트리거가 걸리는 것은 "사고"가 아니라 예정된 일이고, 걸리면 청크 분해를 다시 재고
  무엇이 늘었는지부터 본 뒤 예산을 올릴지 코드를 줄일지 고른다(그때 이 ADR 을 고친다).

### 2026-09-28 재검토 — T-7 / PR #153

Phase 3 소셜 화면·셸 진입 연결 후 같은 소스(9bb1d7e)의 진입 폐포는 gzip 165,971 B,
첫 로드 네트워크 JS 합은 227,146 B다. 직전 main 기준선 160,630/205,594 B 대비
각각 +5,341/+21,552 B이며, 기존 164,000/210,000 B 상한을 각각 1,971/17,146 B 초과해
`check-dist`가 실패했다. 사용자 승인에 따라 상한을 168,000/230,000 B로 재설정한다.
남는 여유는 각각 2,029/2,854 B다. 진입 정적 의존 폐포와 네트워크 JS 합의 계측 범위,
Dexie 진입 금지 검사 및 baseline 비교 방식은 유지한다. 이전 실패는 PR #153에 기록한다.

## 롤백

빌드·배포 파일만 되돌린다: `index.html`(삭제) · `vite.config.ts` · `wrangler.jsonc` · `serwist.config.js` ·
`package.json` 의 빌드/배포 스크립트와 의존성 · `scripts/deploy.sh` · `scripts/check-dist.mjs`(삭제) ·
`src/app/main.tsx`→`layout.tsx` · `public/manifest.webmanifest`→`src/app/manifest.ts` · `next.config.ts`(복원).
`src/features/**`·`src/styles/**`·`src/domain/**` 은 이 변경에 관여하지 않는다(주석 문구를 뺀다).
이 PR 전체를 `git revert` 하는 방식은 뒤 티켓이 `index.html`·`providers.tsx` 를 만진 뒤에는 충돌한다.
