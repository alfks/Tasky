<!-- 읽기 조건: 라우트·레이아웃·메타데이터·providers·PWA manifest를 수정할 때. -->

# src/app/ — AGENTS

## 목적

Next.js App Router 셸. `layout.tsx`(서버, 폰트·테마 속성), `page.tsx`(서버, `<HomeScreen/>` 렌더만), `providers.tsx`(client, `setRepositories` — 조립 지점), `manifest.ts`, `error.tsx`. 비즈니스 로직·상태·컴포넌트 구현은 `features`.

## 규칙

1. `page.tsx`는 10줄 이내: feature 화면 컴포넌트 1개를 `@/features/<f>`(index.ts)에서 가져와 렌더.
2. `'use client'`는 `providers.tsx`, `error.tsx`에만.
3. 라우트 추가는 스펙 + 오케스트레이터 승인(MVP는 `/` 단일 페이지).
4. 서비스워커 소스는 `src/sw.ts`, 설정은 루트 `serwist.config.js`다(ADR-0010). 여기서는 `manifest.ts`만. 아이콘은 `public/`(`src/app`에 이미지 파일 금지).
5. 출처: `docs/ARCHITECTURE.md` §1·§6, `docs/conventions/code-style.md` §3.

## 검증

```bash
pnpm build 2>&1 | tail -5
```
