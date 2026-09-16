<!-- 읽기 조건: SPA 진입점·조립 지점·단일 라우트 화면(`/`)을 수정할 때. 문서 <head> 는 루트 `index.html` 이다. -->

# src/app/ — AGENTS

## 목적

SPA 셸(ADR-0013). `main.tsx`(진입점 — `createRoot` + 마운트), `providers.tsx`(조립 지점 — `setRepositories`, Dexie 지연 로드, 스키마 열기, 조립 실패 안내), `page.tsx`(단일 라우트 `/` 의 화면). 비즈니스 로직·상태·컴포넌트 구현은 `features`.

문서 `<head>`(메타·`theme-color`·폰트 preload·첫 페인트 테마 스크립트)와 PWA manifest 는 **여기 없다** — 루트 `index.html` 과 `public/manifest.webmanifest` 다.

## 규칙

1. `page.tsx`는 10줄 이내: feature 화면 컴포넌트 1개를 `@/features/<f>`(index.ts)에서 가져와 렌더.
2. `@/app/providers`를 import 할 수 있는 파일은 `main.tsx` 하나다(ADR-0006 규칙 6 — `eslint.config.mjs`가 파일명을 박아 강제한다). 이름을 바꾸면 그 예외 블록도 같이 바꾼다.
3. 라우트 추가는 스펙 + 오케스트레이터 승인(MVP는 `/` 단일 페이지, 라우터 없음). 라우터 도입은 ADR.
4. 주입 직후 `openIndexedDb()` 로 **스키마를 명시적으로 연다**(TECH_PLAN §5 규칙 4). 빼면 Dexie 지연 오픈 때문에 업그레이드 실패가 아무 조회에서나 raw Dexie 에러로 터지고 `RepositoryError('SCHEMA_UPGRADE_FAILED')` 는 실전에서 발생하지 않는다 — `providers.test.tsx` 가 그 호출을 고정한다. 실패 시에는 스켈레톤이 아니라 `role="alert"` 안내를 남기고, 스키마 실패와 그 밖의 실패는 **다른 문구**다. 이 안내는 임시다: 앱 셸의 오류 카드(app-shell §2-C)가 붙으면 그쪽이 문구와 [백업 내보내기] 를 가져간다.
5. `infra`를 import 할 수 있는 파일도 `providers.tsx` 하나다. 그 import는 **동적**이어야 한다 — 정적으로 되돌리면 Dexie 가 진입 청크로 돌아온다(gzip 77 kB → 109 kB, ADR-0013 규칙 7). 산문이 아니라 장치가 막는다: `build-stack.test.ts` 가 소스 표기를, `scripts/check-dist.mjs` 가 산출물의 진입 청크(Dexie 부재 + gzip 예산)를 본다.
6. 서비스워커 소스는 `src/sw.ts`, 설정은 루트 `serwist.config.js`다. 아이콘·manifest 는 `public/`(`src/app`에 이미지·정적 파일 금지).
7. 출처: `docs/ARCHITECTURE.md` §1·§6, `docs/conventions/code-style.md` §3.

## 검증

```bash
pnpm build 2>&1 | tail -5
```
