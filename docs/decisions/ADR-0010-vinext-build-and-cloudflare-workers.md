<!-- 읽기 조건: 빌드·배포 파이프라인(vite.config.ts · wrangler.jsonc · serwist.config.js · 배포 워크플로)을 바꾸기 전. -->

# ADR-0010: 빌드 스택 Vinext(Next.js API on Vite) + 배포 Cloudflare Workers

- 상태: accepted
- 날짜: 2026-09-15
- 관련: ADR-0001(보정), docs/specs/pwa.md, docs/TECH_PLAN.md §1·§10

## 맥락

앱은 서버 상태가 0이다(라우트 1개, 데이터는 전부 IndexedDB). 그런데 `next build`는 이 규모에
과한 툴체인을 끌고 오고, 배포 대상(Cloudflare Workers)에 얹으려면 어댑터가 하나 더 필요하다.
사용자가 빌드=Vinext, 배포=Cloudflare Workers를 확정했다. Vinext는 experimental이므로
"쓸지 말지"가 아니라 **무엇이 막히는지**를 실측해 남긴다.

## 결정

빌드 CLI를 `next` → `vinext`로 바꾸고, `output: 'export'`로 정적 추출해 Cloudflare Workers
Static Assets로 서빙한다. `src/**`의 `next/*` import와 `next.config.ts`는 그대로 둔다.

- Vinext가 `next/*`를 shim으로 가로채므로 **앱 코드·레이어 경계 설정은 한 줄도 바뀌지 않는다**(실측: 픽스처 108건·2차 패스 통과).
- `next`는 **devDependency로 남긴다** — `import type { Metadata } from 'next'` 타입 때문이며 런타임·빌드에는 쓰지 않는다.
- PWA는 `serwist`를 유지하되 통합 지점을 바꾼다: `@serwist/next`(webpack 전제) → `serwist build` **빌드 후처리**(ADR-0001 규칙 4 보정).
- 서버 기능이 0이라 KV 데이터 캐시·ISR·Cloudflare Images 바인딩은 넣지 않는다.

## 대안과 기각 이유

| 대안                                         | 기각 이유                                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Next.js 15 + OpenNext Cloudflare 어댑터 유지 | 서버 런타임이 필요 없는 앱에 어댑터 계층이 하나 더 는다                                   |
| Vite + React SPA로 전면 재작성               | `src/app` App Router·메타데이터 규약을 버리게 되고 스캐폴딩 산출물이 통째로 날아간다      |
| `vite-plugin-pwa`                            | 프리렌더 HTML을 프리캐시하지 못한다(플러그인이 프리렌더보다 먼저 끝남) → pwa.md R3 미충족 |

## 결과

- 좋은 점: 빌드 약 7초, 테스트와 빌드가 같은 Vite 리졸버를 쓴다. Workers 무료 구간 안에서 정적 자산으로 서빙된다.
- 베타 패키지(`vinext`, `@vinext/cloudflare`)는 캐럿이 아니라 **정확한 버전으로 핀**한다(TECH_PLAN §1 버전 정책의 예외).

### 커버 범위 — 실측표 (vinext 1.0.0-beta.10 · `output: 'export'` · Workers Static Assets)

아래는 **스펙이 요구하는 API를 하나씩 심어 `vinext build` + `wrangler dev` 로 확인한 결과**다(프로브 파일은 확인 후 전부 삭제). "약 94% 커버" 같은 벤더 수치는 근거로 쓰지 않는다.

| API                                                                      | 결과                                                                                                                                                                                                                                                                                                                                                                                               | 막히면 쓰는 대체 경로                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `metadata` 객체(layout·page)                                             | ✅ 프리렌더 HTML에 `<title>`·`<meta name="description">` 정상                                                                                                                                                                                                                                                                                                                                      | —                                                                                                                                                                                                                                                                                                                                                                        |
| `generateMetadata()`                                                     | ✅ 정상(비동기 포함)                                                                                                                                                                                                                                                                                                                                                                               | —                                                                                                                                                                                                                                                                                                                                                                        |
| **metadata 파일 라우트**(`manifest.ts`·`icon.tsx`·`opengraph-image.tsx`) | ❌ **`output: 'export'`에서도 정적 추출되지 않는다.** `dist/client`에 파일이 생기지 않고 프리렌더 경로는 `["/"]` 그대로. 런타임에는 Worker가 동적으로 서빙한다(실측 `/manifest.webmanifest` → 200 `application/manifest+json`). 그래서 **서비스워커 프리캐시에도 들어가지 못한다**. 추가로 `opengraph-image`는 HTML에 **빌드 호스트 절대 URL**(`http://localhost:3000/opengraph-image?…`)로 박힌다 | 설치(pwa.md R1)에는 영향 없다 — manifest 200 + 아이콘 + fetch 핸들러 SW + HTTPS로 Installable 조건을 만족하고, Worker 호출은 페이지 로드당 1회다. **오프라인에서 반드시 있어야 하는 파일**은 metadata 파일 라우트로 만들지 말고 `public/`에 정적 파일로 둔다(아이콘 3개가 그 방식). OG 이미지가 필요해지면 `public/`의 PNG + `metadata.openGraph.images` 절대 URL로 둔다 |
| `not-found.tsx`                                                          | ✅ `404.html`로 프리렌더된다                                                                                                                                                                                                                                                                                                                                                                       | —                                                                                                                                                                                                                                                                                                                                                                        |
| `error.tsx` · `loading.tsx`                                              | ✅ 빌드·번들 정상(전용 클라이언트 청크 생성)                                                                                                                                                                                                                                                                                                                                                       | —                                                                                                                                                                                                                                                                                                                                                                        |
| **route handler**(`app/api/*/route.ts`, `dynamic = 'force-static'`)      | ⚠️ 빌드는 통과하지만 정적 추출은 **건너뛴다**(`Prerendered 2 routes (1 skipped)`) → Worker 동적 서빙(실측 200)                                                                                                                                                                                                                                                                                     | MVP는 route handler를 쓰지 않는다. 서버 기능이 필요해지면 `output: 'export'` 자체를 재검토(§재검토 트리거)                                                                                                                                                                                                                                                               |
| **`middleware.ts`**                                                      | ⚠️ Worker 번들에는 들어가고 **Worker가 처리하는 요청에만** 적용된다. 정적 자산으로 서빙되는 경로(`/`·`/sw.js`·`_next/static/*`)에는 실행되지 않는다(실측: `/` 응답에 미들웨어 헤더 없음, `/manifest.webmanifest`·미매칭 경로에는 있음). beta.10은 `middleware` 이름을 deprecated로 경고한다(`proxy` 권장)                                                                                          | MVP는 쓰지 않는다. 전 경로에 걸어야 하면 미들웨어가 아니라 `public/_headers`(정적 자산) + Worker 핸들러(동적)로 나눠서 건다                                                                                                                                                                                                                                              |
| 동적 라우트 + `generateStaticParams()`                                   | ✅ `/d/<param>.html`로 정적 추출된다                                                                                                                                                                                                                                                                                                                                                               | —                                                                                                                                                                                                                                                                                                                                                                        |
| `next/web-vitals`(`useReportWebVitals`)                                  | ✅ **no-op가 아니다** — vinext가 실제 `web-vitals` 구현(CLS·FID·LCP·INP·FCP·TTFB)을 클라이언트 청크에 번들한다(실측)                                                                                                                                                                                                                                                                               | —                                                                                                                                                                                                                                                                                                                                                                        |
| **`next/font/*`**                                                        | ❌ 빌드타임 추출이 없다 — 로컬 폰트 CSS는 런타임 주입, Google Fonts는 CDN에서 로드(vinext README)                                                                                                                                                                                                                                                                                                  | `next/font`를 **쓰지 않고** `@font-face`를 직접 선언한다(theme.md §3-F, 규칙 6). 셀프 호스팅이라 외부 폰트 요청 0건이 유지된다                                                                                                                                                                                                                                           |
| `reactStrictMode`                                                        | ⚠️ App Router 진입점에는 적용 코드가 없다(소스상 Pages Router dev 경로에만 존재) → dev 이중 렌더 검증이 약해진다. 기능 영향 없음                                                                                                                                                                                                                                                                   | —                                                                                                                                                                                                                                                                                                                                                                        |

이 표의 "❌·⚠️"는 **지금 우리 코드가 쓰는 것**과는 겹치지 않는다(우리가 쓰는 것은 `metadata` 객체 + `manifest.ts` 하나). 새 티켓이 위 API를 쓰려 하면 여기를 먼저 본다.

## 지켜야 할 규칙 (검증 가능한 문장 — 리뷰 판정 근거)

1. `next`는 `devDependencies`에만 둔다. `dependencies`로 옮기거나 지우면 각각 "쓰지 않는 런타임"·`tsc` 실패다.
2. `vite.config.ts`에 `@vitejs/plugin-rsc`·`@vitejs/plugin-react`를 **직접 등록하지 않는다**(vinext가 자동 등록 — 중복 시 빌드 실패).
3. 서비스워커 설정은 `serwist.config.js` + `src/sw.ts` 에만. `next.config.ts`·`vite.config.ts`에 SW 설정을 두지 않는다.
4. `next.config.ts`의 `output: 'export'`를 지우지 않는다 — 프리렌더 HTML이 없으면 오프라인 새로고침(pwa.md R3)이 깨진다.
5. `public/_headers`는 vinext 생성본을 **덮어쓴다**(병합 아님, 실측) — `/_next/static/*` immutable 규칙을 이 파일에서 계속 유지한다.
6. `next/font/*`를 import하지 않는다. 폰트는 `public/fonts/` + `@font-face` 직접 선언(theme.md §3-F).
7. 배포 워크플로는 시크릿 부재 시 실패한다 — 배포 스텝에 `if:` 조건이나 `continue-on-error`를 붙이지 않는다.
8. **배포 명령의 단일 소스는 `package.json`의 `deploy` 스크립트**(`wrangler deploy --config dist/server/wrangler.json`)다. `deploy:dry-run`은 그 스크립트에 `--dry-run --outdir`만 얹고, 배포 워크플로는 두 스크립트를 그대로 호출한다 — 워크플로에 wrangler 명령을 따로 적거나 다른 CLI(`vinext-cloudflare deploy`)를 쓰면 **로컬에서 확인한 명령과 CI가 실행하는 명령이 갈라진다**(그 경우 로컬 dry-run은 "No build or deploy performed" 6줄만 출력하고 아무것도 검증하지 않았다). `@vinext/cloudflare`는 vinext의 Cloudflare 통합용으로 남기고, 그 deploy CLI는 쓰지 않는다.
9. **오프라인 보장 대상은 프리캐시된 정적 파일뿐이다.** metadata 파일 라우트·route handler는 정적 추출되지 않아 프리캐시에 못 들어간다(위 실측표) — 오프라인에 반드시 필요한 파일은 `public/`에 둔다. 서비스워커에는 `runtimeCaching`·`fallbacks`를 두지 않는다(pwa.md R3: 데이터 요청 없음, 라우트 1개).

## 재검토 트리거

- Vinext가 1.0 정식 릴리스되거나, 반대로 6개월 이상 beta에 머물거나 유지보수가 끊길 때.
- `vinext build`가 우리 코드에서 깨지고 우회가 하루 안에 나오지 않을 때 → 롤백: **빌드·배포 파일만** 되돌린다(`vite.config.ts`·`wrangler.jsonc`·`serwist.config.js`·`package.json`의 빌드/배포 스크립트·배포 워크플로). 이 PR 전체를 `git revert` 하는 방식은 뒤 티켓이 같은 파일을 만진 뒤에는 충돌한다 — `@font-face`(T-22의 `src/styles/fonts.css`)·`layout.tsx` preload(T-11)·`package.json`/lockfile(T-21)은 **유지**하고, `next.config.ts`의 `output: 'export'`도 그대로 둔다(Next.js에서도 유효한 설정).
- 서버 기능(동기화 API·route handler)이 필요해져 `output: 'export'`를 유지할 수 없을 때.
- 위 실측표에서 ✅였던 API가 버전 업 뒤 깨지거나, 표에 없는 Next.js 기능이 필요해질 때 — **표에 한 줄 추가하기 전에 프로브로 실측한다**(추정으로 적지 않는다).
