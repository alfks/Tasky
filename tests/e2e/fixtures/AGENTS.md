<!-- 읽기 조건: e2e 스펙이 로그인·소셜 로컬 Worker fixture를 새로 쓰거나 바꿀 때. -->

# tests/e2e/fixtures/ — AGENTS

## 목적

`tests/e2e/**` 스펙이 공유하는 스텁 로그인과 로컬 소셜 서버 fixture — 규칙 본문은
[tests/AGENTS.md](../../AGENTS.md).

## 여기 있는 것 / 없는 것

- 있음: `stub-login.ts` — `page`/`account` fixture 를 얹은 `test`(sync.md R1, `AuthGate` 가 로그인
  화면만 보여주므로 **모든** e2e 스펙이 이 `test` 를 써야 한다). `AUTH_STUB=1` + localhost 조건으로만
  열리는 `GET /auth/stub-login` 을 부른다(worker/auth/stub.ts, T-93 owns).
- 있음: `social.ts` — 위 `test`를 확장한다. 별도 loopback Wrangler/D1을 임시 저장소와 빈 포트에
  기동하고, `randomAccount()` 두 명만 allowlist에 넣는다. `social.spec.ts`는 서로 다른 브라우저
  컨텍스트에 `stubLogin`을 각각 호출한다. 소셜 HTTP는 모의 처리하지 않고, fixture 종료 시 자신이
  띄운 자식 프로세스와 임시 D1만 정리한다. 깨끗한 Git source와 빌드/서빙 `index.html` 해시를 대조한다.
- 없음(다른 곳): 스펙 파일 자체는 `tests/e2e/` 바로 아래([tests/AGENTS.md](../../AGENTS.md) 관할).

## 규칙 (이 디렉토리에만 적용)

1. `@playwright/test` 를 직접 import 하는 스펙은 `stub-login.ts` 또는 이를 확장한 `social.ts`의
   `test`/`expect` 를 대신 가져다 쓴다 —
   예외는 무쿠키 상태를 직접 검증해야 하는 시나리오뿐이고(`sync.spec.ts` 머리주석), 그때도 `page`
   fixture 를 우회할 뿐 `randomAccount`/`stubLogin` 헬퍼는 그대로 재사용한다.
2. 계정은 항상 `randomAccount()` 로 새로 만든다 — `fullyParallel: true` 라 워커가 겹치므로 고정
   sub/email 을 쓰면 D1 사용자 행이 테스트끼리 부딪힌다.

## 의존 방향

- import 가능: `@playwright/test`, Node 기본 모듈, 같은 fixture 디렉터리의 `stub-login.ts`
- import 금지: `src/**`(e2e 는 빌드 산출물을 브라우저로만 본다 — tests/AGENTS.md 규칙 3)

## 검증

```bash
pnpm test:e2e -- sync.spec.ts
CI=1 pnpm exec playwright test tests/e2e/social.spec.ts --workers=1 --retries=0
```

## 자주 하는 실수

- 새 스펙에서 `@playwright/test` 의 `test` 를 그대로 import 하고 로그인을 잊는 것 — 로그인 화면
  (`h1`·`main#shell-main` 없음)만 보고 나머지 단언이 전부 타임아웃으로 죽는다.
