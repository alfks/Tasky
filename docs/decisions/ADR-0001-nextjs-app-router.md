<!-- 읽기 조건: src/app 구조, 라우팅, PWA 설정, 서버/클라이언트 컴포넌트 경계를 바꾸기 전. -->

# ADR-0001: Next.js 15 App Router + TypeScript + PWA(Serwist) 채택

- 상태: accepted (빌드 스택·PWA 통합 지점은 ADR-0010이 보정)
- 날짜: 2026-09-15
- 관련: docs/ARCHITECTURE.md, ADR-0002, ADR-0010

## 맥락

데스크탑 웹앱으로 레퍼런스 앱의 UX를 재현하되, 설치형 느낌(PWA)과 후일 클라우드 동기화/SNS 확장이 필요하다. 팀은 여러 AI 에이전트가 병렬로 기여하므로 관례가 강한 프레임워크가 유리하다.

## 결정

Next.js App Router 규약 + React 19 + TypeScript strict + pnpm. PWA는 Serwist.

> **ADR-0010 보정**: 빌드 CLI는 `next`가 아니라 **Vinext**(Next.js API on Vite)이고, Serwist는 `@serwist/next`가 아니라 `serwist build` **빌드 후처리**로 붙는다. 아래 결정 중 "App Router 규약·서버 컴포넌트 경계·Serwist" 는 그대로 유효하고, 통합 지점만 바뀌었다.

- App Router의 파일 규약이 병렬 작업 시 구조 논쟁을 줄인다.
- 로컬 우선 앱이므로 서버 컴포넌트는 셸·메타데이터에만 쓰고 데이터는 전부 클라이언트.
- Serwist는 App Router 호환이 검증된 next-pwa 후속.

## 대안과 기각 이유

| 대안                    | 기각 이유                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Vite + React SPA        | PWA·라우팅·메타데이터를 직접 조립해야 하고, 후일 서버 기능(동기화 API) 추가 시 별도 백엔드 필요 |
| Pages Router            | 신규 프로젝트에 권장되지 않음, 레이아웃 중첩 불리                                               |
| Tauri/Electron 데스크탑 | 배포·업데이트 비용, 요구는 "데스크탑 웹앱"                                                      |

## 결과

- 좋은 점: 규약 기반 구조, 후일 API Route로 동기화 서버 확장 가능.
- ADR-0010 이후: 이미지·폰트 자동 최적화는 받지 못한다(`next/image` 미사용, 폰트는 `@font-face` 직접 선언).
- 감수하는 점: 로컬 우선 앱에서 서버 컴포넌트 이점이 작다. `'use client'` 경계 관리 필요.

## 지켜야 할 규칙

1. `src/app/page.tsx`는 feature 화면 컴포넌트 1개 렌더만(10줄 이내).
2. `'use client'`는 `providers.tsx`, `error.tsx`, 그리고 `features/components`의 상태·이벤트 컴포넌트에만.
3. 라우트 추가는 스펙 + 오케스트레이터 승인. MVP는 `/` 단일 페이지.
4. 서비스워커 설정은 `serwist.config.js` + `src/sw.ts`에서만 — `next.config.ts`·`vite.config.ts`에 두지 않는다(ADR-0010 규칙 3이 이 문장을 대체).
