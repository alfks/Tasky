<!-- 읽기 조건: e2e 스펙이 로그인 fixture(`stub-login.ts`)를 새로 쓰거나 바꿀 때. -->

# tests/e2e/fixtures/ — AGENTS

## 목적

`tests/e2e/**` 스펙이 공유하는 fixture. 지금은 스텁 로그인(`stub-login.ts`) 하나뿐이다 — 규칙 본문은
[tests/AGENTS.md](../../AGENTS.md).

## 여기 있는 것 / 없는 것

- 있음: `stub-login.ts` — `page`/`account` fixture 를 얹은 `test`(sync.md R1, `AuthGate` 가 로그인
  화면만 보여주므로 **모든** e2e 스펙이 이 `test` 를 써야 한다). `AUTH_STUB=1` + localhost 조건으로만
  열리는 `GET /auth/stub-login` 을 부른다(worker/auth/stub.ts, T-93 owns).
- 없음(다른 곳): 스펙 파일 자체는 `tests/e2e/` 바로 아래([tests/AGENTS.md](../../AGENTS.md) 관할).

## 규칙 (이 디렉토리에만 적용)

1. `@playwright/test` 를 직접 import 하는 스펙은 이 파일의 `test`/`expect` 를 대신 가져다 쓴다 —
   예외는 무쿠키 상태를 직접 검증해야 하는 시나리오뿐이고(`sync.spec.ts` 머리주석), 그때도 `page`
   fixture 를 우회할 뿐 `randomAccount`/`stubLogin` 헬퍼는 그대로 재사용한다.
2. 계정은 항상 `randomAccount()` 로 새로 만든다 — `fullyParallel: true` 라 워커가 겹치므로 고정
   sub/email 을 쓰면 D1 사용자 행이 테스트끼리 부딪힌다.

## 의존 방향

- import 가능: `@playwright/test`
- import 금지: `src/**`(e2e 는 빌드 산출물을 브라우저로만 본다 — tests/AGENTS.md 규칙 3)

## 검증

```bash
pnpm test:e2e -- sync.spec.ts
```

## 자주 하는 실수

- 새 스펙에서 `@playwright/test` 의 `test` 를 그대로 import 하고 로그인을 잊는 것 — 로그인 화면
  (`h1`·`main#shell-main` 없음)만 보고 나머지 단언이 전부 타임아웃으로 죽는다.
