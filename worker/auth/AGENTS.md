<!-- 읽기 조건: worker/auth/** 의 어떤 파일이든 읽거나 고치기 전. -->

# worker/auth/ — AGENTS

## 목적

구글 OAuth·세션 쿠키(SYNC_DESIGN.md §②-4). `cookies.ts`·`hmac.ts`·`pkce.ts`(원시함수) ·
`provider.ts`(인터페이스) · `google.ts`·`stub.ts`(구현) · `session.ts`(발급·검증 — **`sessions`
테이블 조회는 이 파일에만** 있다, 아래 규칙 2) · `handlers.ts`(`/auth/login`·`/auth/callback`·
`/auth/logout`·`/api/me`).

## 규칙 (이 디렉토리에만 적용)

1. **`AUTH_STUB` 스텁 로그인은 2중 가드**(`env.AUTH_STUB === '1'` **그리고** 호스트가
   localhost/127.0.0.1) — 하나만 참이어도 404(`stub.ts#isStubAllowed`). 가드를 바꾸면
   `stub.test.ts` 의 부정 테스트 2건을 반드시 같이 본다.
2. **`sessions` 테이블 조회는 구조적으로 `sub` 없이 시작한다**(sid → sub 를 알아내는 바로 그
   조회) — 그래서 `worker/db/**`(전부 `sub = ?` 바인딩 강제) 밖인 이 디렉토리에 있다
   (`session.ts`).
3. **재가입(`handleCallback`/`stub.ts#handleStubLogin`)은 `deleted_users` 를 지우기 **전에** 그
   sub 의 `sessions` 를 먼저 지운다** — 삭제 창 동안 요청을 한 번도 안 보낸 세션(탈취된 쿠키
   포함)이 재가입으로 되살아나는 것을 막는다(`handlers.ts` jsdoc, 실 D1 재현됨). 두 파일이 같은
   순서를 지킨다 — 하나만 고치지 않는다.
4. **세션 서명 검증(`hmac.ts#verifySignedValue`)이 D1 조회보다 먼저** — 위조 쿠키로 D1 을 두드리게
   하지 않는다(`session.ts#requireSession`).

## 검증

```bash
pnpm vitest run --project=worker worker/auth
```
