<!-- 읽기 조건: worker/auth/** 의 어떤 파일이든 읽거나 고치기 전. -->

# worker/auth/ — AGENTS

## 목적

구글 OAuth·세션 쿠키(SYNC_DESIGN.md §②-4). `cookies.ts`·`hmac.ts`·`pkce.ts`(원시함수) ·
`provider.ts`(인터페이스) · `google.ts`·`stub.ts`(구현) · `session.ts`(발급·검증 — **`sessions`
테이블 조회는 이 파일에만** 있다, 아래 규칙 2) · `handlers.ts`(`/auth/login`·`/auth/callback`·
`/auth/logout`·`/auth/logout-others`·`/api/me`).

## 규칙 (이 디렉토리에만 적용)

1. **`AUTH_STUB` 스텁 로그인은 2중 가드**(`env.AUTH_STUB === '1'` **그리고** 호스트가
   localhost/127.0.0.1) — 하나만 참이어도 404(`stub.ts#isStubAllowed`). 가드를 바꾸면
   `stub.test.ts` 의 부정 테스트 2건을 반드시 같이 본다.
2. **`sessions` 테이블 조회는 구조적으로 `sub` 없이 시작한다**(sid → sub 를 알아내는 바로 그
   조회) — 그래서 `worker/db/**`(전부 `sub = ?` 바인딩 강제) 밖인 이 디렉토리에 있다
   (`session.ts`).
3. **재가입 순서는 `session.ts#signIn` 한 곳** — `handleCallback`·`stub.ts#handleStubLogin` 은
   그 함수만 부른다(구조로 강제, ADR-0020). **세션 전량 폐기는 `deleted_users` 에 그 sub 행이 있을
   때만** 실행된다(`DELETE … WHERE sub = ? AND EXISTS (SELECT 1 FROM deleted_users WHERE sub = ?)`
   — 판정과 삭제를 한 문장에 두고, `deleted_users` 삭제·`users` upsert 와 함께 `db.batch()` 한
   트랜잭션에 넣는다). 평범한 로그인(재가입이 아닌)은 이 문장이 0행에 맞아 다른 기기의 세션을
   건드리지 않는다 — 재가입일 때만 그 sub 의 세션 전량을 지워, 삭제 창 동안 요청을 한 번도 안
   보낸 세션(탈취된 쿠키 포함)이 되살아나는 것을 막는다(`session.ts#signIn` jsdoc, 실 D1 재현됨).
   `sessions` 를 sub 단위로 지우는 문장을 이 함수 밖에 새로 두지 않는다.
   **다른 기기 모두 로그아웃**(`POST /auth/logout-others`, ADR-0020 §결정 5)은
   `session.ts#destroyOtherSessions(sub, sid)`(`DELETE … WHERE sub = ? AND sid <> ?`) 하나다 —
   `sid <> ?` 가 호출자 자신의 세션을 지우지 않게 막는다. `sessions` 를 sub 단위로 지우는 문장은
   이제 `signIn`(재가입)과 `destroyOtherSessions`(이 경로) 두 곳뿐이다.
4. **세션 서명 검증(`hmac.ts#verifySignedValue`)이 D1 조회보다 먼저** — 위조 쿠키로 D1 을 두드리게
   하지 않는다(`session.ts#requireSession`).

## 검증

```bash
pnpm vitest run --project=worker worker/auth
```
