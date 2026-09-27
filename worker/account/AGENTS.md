<!-- 읽기 조건: worker/account/** 의 어떤 파일이든 읽거나 고치기 전. -->

# worker/account/ — AGENTS

## 목적

`delete.ts` — `POST /api/account/delete`(docs/specs/sync.md §6, ADR-0019).

## 규칙 (이 디렉토리에만 적용)

1. `social/deletion.ts#deleteAccountProjection`의 첫 nonce latch와 social 삭제, 기존
   `entities`·`devices`·`users` 삭제를 **하나의 D1 batch**로 실행한다. 첫 latch 0행이나
   마지막 nonce 확인 실패를 204로 처리하지 않고 현재 sid·삭제 marker로 401/410 재분류한다.
2. **`sessions` 는 이 배치에 넣지 않는다** — 요청을 보낸 기기 자신의 세션(`sid`)만 따로 지운다.
   다른 기기의 세션 행은 그대로 두고, 다음 요청에서 `auth/session.ts` 가 sub → `deleted_users`
   조회로 410 을 돌려주며 그 자리에서 지운다(지연 정리) — 계정 삭제 시점에 모든 세션을 한꺼번에
   지우면 다른 기기가 "삭제됨" 을 평범한 401 과 구분할 방법이 사라진다(ADR-0019 핵심 결정).
3. **재가입 시점의 세션 폐기는 이 디렉토리의 몫이 아니다** — `auth/handlers.ts#handleCallback`·
   `auth/stub.ts#handleStubLogin`(`auth/AGENTS.md` 규칙 3)이 처리한다.

## 검증

```bash
pnpm vitest run --project=worker worker/account
```
