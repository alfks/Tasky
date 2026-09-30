<!-- 읽기 조건: worker/social/**의 코드나 테스트를 읽거나 수정하기 전. -->

# worker/social/ — AGENTS

## 목적

Phase 3의 서버 전용 D1 소셜 투영. `src/domain/social/**`의 순수 계약을 재사용하고,
현재 세션·사용자·프로필을 SQL에서 재확인한다. `router.ts`와 `public-router.ts`가 소셜 HTTP 경로의
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
8. 관리 목록은 `cursor.ts`의 actor·scope 바인딩 HMAC 커서만 받는다. 첫 페이지의 15분
   만료 시각을 다음 페이지에 유지하고, 검증 실패는 목록 SQL 전에 validation으로 끝낸다.
   목록 정렬은 peer id 또는 invite hash 오름차순이다.
9. feed와 posts:mine은 같은 HMAC codec의 tuple upper/last를 쓰고, 친구 최대 50명+자신의
   작성자별 인덱스 후보를 제한한 정적 SQL 한 문장에서 ACL·본문·페이지 반응 수를 읽는다.
   validate는 ID만 반환한다. 공유 생성은 receipt·post·UTC 일간 counter를 한 batch에 둔다.
10. reactions/set은 bounded transport 뒤 최상위 `active === false`만 revoke로 판별한다.
    action을 알 수 없는 transport 오류는 `off`에서도 write bucket 한 번이며, 정상 명령의
    primitive admission을 router에서 중복 실행하지 않는다.

## 검증

```bash
pnpm vitest run --project=worker worker/social
bash scripts/check-worker-sql.sh
```

## 카테고리·익명 읽기

- category projection의 범위/version은 원격 CAS authority이며 개인 id/메모/통계는 DTO에 없다.
- tombstone은 owner 관리에서만 `revoked: true`로 반환한다. visitor/public/post 응답은 count·철회 정보를 내보내지 않는다.
- public/friend membership trigger는 같은 변경 transaction에 참여하는 인덱스 힌트다. 본문·category·validate·응원은 현재 canonical ACL·활성 계정·trusted allowlist를 다시 검사한다.
- public scan은 최대 1,000개의 id 뒤 현재 ACL와 page LIMIT를 적용한다. 빈 sparse page도 next cursor가 있으면 다음 구간을 읽을 수 있다.
- public/category cursor는 별도 domain prefix의 AES-GCM이며 viewer/filter/scope/15분 최초 만료를 인증한다. 기존 친구 cursor의 HMAC은 유지한다.
- 익명 public GET에 방문자 식별정보나 임의 IP limiter를 만들지 않는다. 쿠키가 있으면 검증 실패 401/410을 유지하고 익명으로 낮추지 않는다. 운영 edge/global limiter는 출시 게이트다.

- 친구 피드의 타인 후보는 legacy null 또는 live friends/public만 담은 `social_friend_posts` 인덱스에서 읽는다. 소유자 후보는 `social_posts`로 별도 읽고 동일 페이지에서 현재 작성자 A/F·category ACL을 다시 검사한다. 최대 50친구+자신의 seed/후보 상한을 유지해 최신 private/tombstone 사본이 많아도 전수 스캔하지 않는다.
- membership 변경은 category당 보유 사본 최대 1,000개에 한정한다. 이름·색·이모지만 바뀌고 범위가 같으면 인덱스를 다시 만들지 않는다. 본문 읽기는 hint author를 권한으로 신뢰하지 않고 canonical post author의 현재 친구/차단 상태를 재검사한다.
- 빈 category tombstone은 마지막 변경 48시간 뒤 공통 GC 500행 예산에서 지운다. 어떤 사본이라도 연결된 tombstone과 live private category는 보존한다.
