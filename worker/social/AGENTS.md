<!-- 읽기 조건: worker/social/**의 코드나 테스트를 읽거나 수정하기 전. -->

# worker/social/ — AGENTS

## 목적

Phase 3의 서버 전용 D1 소셜 투영. `src/domain/social/**`의 순수 계약을 재사용하고,
현재 세션·사용자·프로필을 SQL에서 재확인한다. HTTP 배선은 후속 티켓 소유다.

## 규칙

1. 요청마다 검증된 `SessionOk`와 한 번 정한 `nowMs`로 actor를 만든다. 프로필 id는 D1에서
   조회하며 DTO에서 받지 않는다. 프로필 생성 id와 command nonce는 서버 난수다.
2. 읽기는 현재 A/F/V를 본문과 같은 SQL에서 검사한다. 0행은 권한이나 데이터의 부재이며
   성공으로 치환하지 않는다.
3. 새 command의 receipt와 효과는 하나의 D1 batch다. 재시도는 actor+key+hash를 현재
   권한으로 조회하고 본문을 receipt에 저장하지 않는다.
4. SQL은 `sql` 태그 리터럴과 `.bind()`만 쓴다. `scripts/check-worker-sql.sh`가 새 영역을
   별도로 검사한다. 테스트는 실제 Miniflare D1과 모든 migration을 사용한다.
5. 계정 삭제는 nonce latch와 명시 삭제 batch를 쓰며 다른 sessions는 유지한다.

## 검증

```bash
pnpm vitest run --project=worker worker/social
bash scripts/check-worker-sql.sh
```
