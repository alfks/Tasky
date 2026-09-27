<!-- 읽기 조건: worker/social/**의 코드나 테스트를 읽거나 수정하기 전. -->

# worker/social/ — AGENTS

## 목적

Phase 3의 서버 전용 D1 소셜 투영. `src/domain/social/**`의 순수 계약을 재사용하고,
현재 세션·사용자·프로필을 SQL에서 재확인한다. `router.ts`가 16 HTTP 경로의
CSRF→세션→모드→8 KiB transport→primitive 순서를 소유한다.

## 규칙

1. 요청마다 검증된 `SessionOk`와 한 번 정한 `nowMs`로 actor를 만든다. 프로필 id는 D1에서
   조회하며 DTO에서 받지 않는다. 프로필 생성 id와 command nonce는 서버 난수다.
2. 읽기는 현재 A/F/V를 본문과 같은 SQL에서 검사한다. 0행은 권한이나 데이터의 부재이며
   성공으로 치환하지 않는다.
3. 새 command의 receipt와 효과는 하나의 D1 batch다. 재시도는 actor+key+hash를 현재
   권한으로 조회하고 본문을 receipt에 저장하지 않는다. 인증 뒤 빈도 admission은 요청당 한 번만
   호출하며 HTTP에서 중복 청구하지 않는다.
4. 일반 효과는 이번 nonce의 `ok` receipt만 따른다. `request-expired`의 유일한 예외는
   현재 A·정확한 pair/deadline/version을 다시 확인한 pending→none 만료 정리다.
   성공 생성량은 `invite-create.ts`처럼 업무 효과·receipt와 같은 batch에 둔다.
5. SQL은 `sql` 태그 리터럴과 `.bind()`만 쓴다. `scripts/check-worker-sql.sh`가 새 영역을
   별도로 검사한다. 테스트는 실제 Miniflare D1과 모든 migration을 사용한다.
6. 계정 삭제는 nonce latch와 명시 삭제 batch를 쓰며 다른 sessions는 유지한다.
7. `policy.ts`에서 매 요청 effective mode를 fail closed로 결정한다. Origin·`X-Tasky`
   실패는 인증 전 403, 모드 차단은 인증 뒤 본문 읽기 전 503이다. transport 오류는 해당
   route bucket을 한 번 예약하고 primitive는 호출하지 않는다. 정상 요청의 primitive 내부
   admission을 HTTP에서 다시 과금하지 않는다.

## 검증

```bash
pnpm vitest run --project=worker worker/social
bash scripts/check-worker-sql.sh
```
