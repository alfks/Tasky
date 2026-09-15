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
- 감수하는 점: **Vinext는 experimental**이며 Next.js API 표면의 약 94%만 덮는다. 우리 사용 표면 중 밖에 있는 것은 `next/font` 하나(빌드타임 추출 없이 런타임 `@font-face` 주입 / Google Fonts는 CDN) — `next/font`를 **쓰지 않고** `@font-face`를 직접 선언해 회피한다(theme.md §3-F). `reactStrictMode`는 App Router에서 아직 적용되지 않는다(dev 이중 렌더 검증 약화, 기능 영향 없음).
- 베타 패키지(`vinext`, `@vinext/cloudflare`)는 캐럿이 아니라 **정확한 버전으로 핀**한다(TECH_PLAN §1 버전 정책의 예외).

## 지켜야 할 규칙 (검증 가능한 문장 — 리뷰 판정 근거)

1. `next`는 `devDependencies`에만 둔다. `dependencies`로 옮기거나 지우면 각각 "쓰지 않는 런타임"·`tsc` 실패다.
2. `vite.config.ts`에 `@vitejs/plugin-rsc`·`@vitejs/plugin-react`를 **직접 등록하지 않는다**(vinext가 자동 등록 — 중복 시 빌드 실패).
3. 서비스워커 설정은 `serwist.config.js` + `src/sw.ts` 에만. `next.config.ts`·`vite.config.ts`에 SW 설정을 두지 않는다.
4. `next.config.ts`의 `output: 'export'`를 지우지 않는다 — 프리렌더 HTML이 없으면 오프라인 새로고침(pwa.md R3)이 깨진다.
5. `public/_headers`는 vinext 생성본을 **덮어쓴다**(병합 아님, 실측) — `/_next/static/*` immutable 규칙을 이 파일에서 계속 유지한다.
6. `next/font/*`를 import하지 않는다. 폰트는 `public/fonts/` + `@font-face` 직접 선언(theme.md §3-F).
7. 배포 워크플로는 시크릿 부재 시 실패한다 — 배포 스텝에 `if:` 조건이나 `continue-on-error`를 붙이지 않는다.

## 재검토 트리거

- Vinext가 1.0 정식 릴리스되거나, 반대로 6개월 이상 beta에 머물거나 유지보수가 끊길 때.
- `vinext build`가 우리 코드에서 깨지고 우회가 하루 안에 나오지 않을 때 → 롤백: 이 PR을 되돌리면 검증된 Next.js 15 스캐폴딩으로 즉시 복귀한다(`src/**`는 영향 없음).
- 서버 기능(동기화 API·route handler)이 필요해져 `output: 'export'`를 유지할 수 없을 때.
- `next/font` 외의 기능이 Vinext 미커버로 드러날 때.
