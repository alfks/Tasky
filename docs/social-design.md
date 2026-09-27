<!-- 읽기 조건: Phase 3의 데이터 모델·서버 API·권한·클라이언트 포트를 구현하거나 보안/구현 가능성을 검토할 때. -->

# Phase 3 상세 설계: 친구와 공유 사본

- 설계 기준: main `8e48a1bf`, 2026-09-28. T-1 순수 계약과 T-2 D1 primitive를 구현 중이며 HTTP/화면 배선은 후속이다. 제품 규칙: [social.md](specs/social.md). 결정: [ADR-0022](decisions/ADR-0022-social-projection-and-authorization.md).
- 첫 출시: 제한된 초대 시범 운영. 현재/미래 친구에게 명시적으로 공유한 문장만 공개한다. 공개 모집의 선행 조건은 [구현 계획](phase3-implementation-plan.md).

## 1. 현재 코드에서 이어 쓰는 것

| 현재 경계                                     | 재사용 / 변경 이유                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `worker/router.ts`                            | 서명 세션·CSRF·JSON·본문 크기 검사를 재사용. 소셜 경로와 더 작은 본문 상한 추가                     |
| `worker/auth/session.ts`                      | `requireSession`·401/410·쿠키 갱신 재사용. 실제 소셜 SQL에서도 sid·현재 계정 생존을 재검사          |
| `worker/db/user-db.ts`                        | 개인 `sub` 한 명만의 격리 포트. 친구 조회를 위해 이 포트를 넓히지 않고 별도 actor 포트 추가         |
| `entities(sub,tbl,id,seq,body)`와 `/api/sync` | 일곱 개인 테이블·사용자별 seq·LWW 그대로. 공유 테이블을 여덟 번째 tbl로 넣지 않음                   |
| `worker/account/delete.ts`                    | 같은 삭제 batch에 소셜 종속 데이터 삭제를 추가. 다른 기기의 sessions 지연 삭제와 재가입 폐기는 유지 |
| `AppShell`·`ShellSidebar`                     | 라우터 없는 화면 전환을 확장. 별도 친구 화면을 지연 로드하고 기존 날짜/스크롤 보존                  |
| `src/sw.ts`                                   | 정적 프리캐시만 유지. API·프로필·공유·초대 토큰 런타임 캐시 금지                                    |

개인 자료 전체를 친구 클라이언트로 보낸 뒤 숨기는 방법은 허용하지 않는다. 서버 projection은 게시 순간 사용자가 확인한 `text`·`happenedOn`만 가진다.
완료한 할 일 제목을 클라이언트에서 선택해 복사하되 원본 id·메모·카테고리·집중 시간·다이어리·달성률을 보내지 않는다.
문장은 수정 가능하므로 서버는 이것을 원본 완료 사실의 증명으로 취급하지 않는다. 사본은 원본과 연결하지 않으며 원본 변경/백업은 사본의 생명주기에 영향이 없다.
`Todo.visibility/ownerId`, 개인 `Meta`, Dexie v4, 백업 형식 변경은 필요 없다. 공유 데이터에는 개인용 `Persistable`·`updatedAt` LWW·아웃박스를 적용하지 않는다.

## 2. 신원과 권한 불변식

소셜 참여 시 `social_profiles`를 명시적으로 만든다. `id`는 서버 생성 128비트 이상 난수, `sub`는 서버 내부 UNIQUE 매핑이다. 삭제 후 재가입은 새로운 id다.
API는 별명·소셜 id만 내보내고 구글 sub/email/avatar·세션 id·원본 entity id를 내보내지 않는다. 다른 사람의 프로필은 친구/요청 상대 또는 유효 초대 확인에 필요한 별명만 조회한다.
별명은 중복 허용. 프로필 이름만으로 신원을 보증하지 않으므로 수락 전 별명과 사용자에게 전달받은 초대 맥락을 확인한다. 공개 검색 endpoint는 없다.

`Actor`는 검증된 `sub,sid,profileId`를 클로저에 보관한다. 요청 body의 owner/actor 필드는 거절한다. 다음 조건은 **각 SQL 읽기·쓰기 안에서** 판정한다.

- A: 세션 sid가 actor sub에 속하고 미만료이며 users가 존재하고 deleted_users가 없고 프로필 id/sub가 일치한다.
- F(a,b): 정렬된 pair의 상태가 `accepted`, 양쪽 프로필이 존재, 어느 방향 block도 없다.
- V(a,p): A이고 post가 존재하고 (`p.author=a` 또는 F(a,p.author)). 계정 삭제된 작성자의 글은 반환하지 않는다.
- 수락·취소·친구 삭제는 actor가 해당 pair 참여자인지, 차단 해제는 blocker인지를 조건에 넣는다. URL의 UUID 추측도 같은 검사다.
- 404는 비존재/접근 불가를 합친다. 상대 차단 여부·이메일·관계 수를 오류에서 누설하지 않는다.

| 자원/동작                | 자신             | 수락한 친구       | 요청만/무관계/차단               |
| ------------------------ | ---------------- | ----------------- | -------------------------------- |
| 개인 entities·다이어리   | 기존 개인 동기화 | 불가              | 불가                             |
| 공유 읽기                | 가능             | V를 만족할 때     | 불가                             |
| 공유 생성/삭제           | 가능             | 불가              | 불가                             |
| 응원 설정                | 자기 글 불가     | V를 만족할 때 1개 | 불가                             |
| 요청 수락                | 받은 사람만      | 해당 없음         | 유효 pending 수신자만            |
| 친구 삭제·차단           | 참여자/차단 주체 | 동일              | 차단은 알려진 요청 상대에도 가능 |
| 차단 목록·관리·초대 원문 | 소유자만         | 불가              | 불가                             |

## 3. 상태 머신과 콘텐츠 수명

친구 pair는 `lo=min(id),hi=max(id)` 한 행이고 version은 서버 정수다. 거절/삭제 뒤에도 `none` 행과 version을 계정 삭제까지 유지한다.
`none → pending(requester) → accepted → none`. `pending → none`은 취소(발신자)·거절(수신자)·만료(서버 시간)다.
요청 유효 기간은 7일. 만료 처리는 조회에 유효성 조건을 적용하고 다음 관련 쓰기에서 `none`으로 정리한다. 기간 뒤의 수락은 409다.
동일 pair의 역방향 요청은 409 `request-pending`: 받은 요청에서 직접 수락하게 한다. 자동 수락은 없다.

초대: 256비트 난수 원문을 생성 응답에서 한 번 반환, DB에는 SHA-256만 저장. `active → used | revoked | expired`, TTL 24시간, 한 번 사용.
로그인한 수신자가 명시적으로 요청할 때 token hash를 소비하고 pending pair를 같은 batch에서 만든다. 자신에게 요청·차단 관계·정원 초과면 소비하지 않는다.
두 사람이 동시에 사용하면 한 명만 성공한다. pending 취소·거절로 초대를 되살리지 않는다. 새 초대는 새 token이다.
프로필 없는 수신자는 인증 세션으로 초대 별명만 미리 확인할 수 있다. preview는 profile 매핑을 제외한 A(현재 sid/sub/users/deleted_users)를 검사한다. 참여/별명 설정을 마친 뒤 원래 초대로 돌아와 요청 여부를 다시 확인한다.

차단은 방향성 행이다. `unblocked → blocked → unblocked`이며 block은 pair를 `none`으로 바꾸고 쌍방 응원을 지운다.
친구 삭제도 pair를 `none`으로 하고 쌍방 응원을 지운다. 친구 재수락/차단 해제는 삭제된 응원을 복원하지 않는다. 다른 친구들의 응원은 유지한다.
차단된 상대에게 새 초대 토큰이 전달되어도 요청은 실패한다. 차단은 pair가 없어도 `none` pair를 만들고 매번 version을 증가시킨다. 차단 해제는 현재 pairVersion CAS를 요구하며 늦은 해제가 새 차단을 지우지 못한다. pair version은 삭제/재차단에도 초기화하지 않는다. 차단 해제는 현재 친구를 만들지 않는다.

게시: 명시적 요청으로 불변 사본을 생성한다. 편집은 없으며 잘못 공유했으면 삭제 후 다시 공유한다. 삭제는 post와 모든 reactions를 같은 batch에서 물리 삭제한다.
친구에게는 현재 친구의 모든 남아 있는 글이 보인다(관계 맺은 시점 제한 없음). 공유 화면에서 이를 고지한다.
모든 쓰기는 서버 시간·서버 version을 사용한다. 클라이언트 시간이 미래이거나 개인 데이터 LWW가 재생돼도 권한을 늘리지 못한다.

## 4. D1 테이블 계약

`0002_social.sql`은 개인 `0001_init.sql`을 수정하지 않고 추가한다. 아래 타입은 SQLite TEXT/INTEGER, 모든 id/time/state는 NOT NULL(명시한 nullable 제외).
새 소셜 시간은 서버 UTC 밀리초 정수, `happened_on`은 유효한 `YYYY-MM-DD` 문자열. FK는 방어 장치이며 account delete는 명시 삭제도 한다. 기존 sessions.expires_at은 ISO TEXT이므로 A는 같은 서버 now를 ISO UTC로 변환해 비교하고, 소셜 ms 값과 직접 비교하지 않는다.

| 테이블           | 컬럼·제약                                                                                                                                                                           | 추가 인덱스                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| social_profiles  | id PK; sub UNIQUE FK users(sub); nickname; version; created_at                                                                                                                      | 없음                                        |
| social_pairs     | lo,hi 복합 PK FK profiles; CHECK lo < hi; state CHECK(none,pending,accepted); requester nullable FK profiles; version; requested_at nullable; CHECK pending이면 requester IN(lo,hi) | `(hi,state,lo)`; `(lo,state,hi)`            |
| social_blocks    | blocker,blocked 복합 PK FK profiles; CHECK blocker != blocked; created_at                                                                                                           | `(blocked,blocker)`                         |
| social_invites   | hash PK; owner FK profiles; expires_at; status CHECK(active,used,revoked); used_by nullable FK profiles; created_at                                                                 | `(owner,status,expires_at)`; `(expires_at)` |
| social_posts     | id PK; author FK profiles; text; happened_on; created_at                                                                                                                            | `(author,created_at DESC,id DESC)`          |
| social_reactions | post_id FK posts; reactor FK profiles; created_at; PRIMARY KEY(post_id,reactor)                                                                                                     | `(reactor,post_id)`                         |
| social_commands  | actor FK profiles; key; request_hash; execution_nonce; result_code; resource_id nullable; result_version nullable; created_at; PRIMARY KEY(actor,key)                               | `(created_at)`                              |
| social_limits    | subject TEXT; bucket; window_start; count; PRIMARY KEY(subject,bucket,window_start), FK 없음                                                                                        | `(window_start)`                            |

위 소셜 FK는 `ON DELETE CASCADE`를 사용하되 sessions에는 추가하지 않는다. CHECK의 열거값은 SQLite 문자열 리터럴로 인용한다.
`deleted_users.execution_nonce`는 nullable additive 열이다. 기존 marker의 NULL은 과거 삭제 흐름을 보존하고, 새 latch는 서버 생성 nonce를 기록한다.
`none` pair의 tombstone은 오래된 version으로 관계가 복원되는 것을 막는다. post 삭제 후에는 해당 id의 수정 API가 없으므로 tombstone이 필요 없고 id를 재사용하지 않는다.

## 5. 실제 가능한 원자성·멱등성

`db.batch()`는 미리 준비한 SQL의 트랜잭션이다. JS에서 SELECT 결과를 보고 같은 트랜잭션 안의 다음 SQL을 조립할 수 없다.
조건부 UPDATE 0행은 SQL 실패가 아니므로 **ACL을 batch 밖에서 확인한 뒤 무조건 INSERT**하는 구현은 금지한다.
사전 조회는 화면 편의/오류 예측에만 쓰며 각 command는 아래 조건부 SQL 흐름으로 확정한다.

1. 현재 actor 인증과 빈도 admission 뒤 actor+key receipt를 확인한다. 동일 hash 재시도/다른 hash 충돌을 결정한 다음 신규 key의 시각을 검사하고, 새 실행에만 난수 `execution_nonce`를 생성한다. 클라이언트는 동일 요청 재시도에 동일 `Idempotency-Key`와 body만 보낸다. request_hash는 서버가 검증·정규화한 메서드·경로·DTO 스키마 버전·필드 정렬 JSON으로 계산하며 클라이언트 hash를 받지 않는다. 생성할 resource id는 첫 실행에서 서버가 난수로 정해 같은 receipt에 보관한다.
2. 첫 문장은 `INSERT INTO social_commands ... SELECT ... WHERE A ON CONFLICT(actor,key) DO NOTHING`이다. result_code는 같은 SELECT의 CASE에서 현재 ACL/version/한도/초대 유효성을 판정해 `ok` 또는 확정 오류로 기록한다.
3. 일반 업무 변경은 `WHERE EXISTS(SELECT 1 FROM social_commands WHERE actor=? AND key=? AND execution_nonce=? AND result_code='ok')`로 가드한다. 같은 key의 기존 receipt는 새 nonce와 다르므로 재실행되지 않는다. 유일한 오류 receipt 예외는 §3의 만료 pending 정리다: 새 `request-expired` receipt가 현재 A, 정확한 pair/peer, deadline, 기대 version을 고정할 때만 같은 batch에서 `none` tombstone(v+1)을 쓴다. replay·stale CAS·키 만료·인증 실패는 정리하지 않는다.
4. 초대 소비·pair 변경·반응 삭제·한도 증가 등 종속 SQL은 모두 이 가드 아래 같은 batch에 있다. 승인 판단과 쓰기 사이에 다른 요청이 끼어들지 않는다.
5. 마지막 SELECT는 현재 key의 hash/result_code/id/version만 반환한다. A 실패로 receipt가 없으면 성공을 만들지 않고 현재 세션 판정에 따라 401/410 또는 프로필 접근 불가 404를 반환한다. SQL 오류면 receipt까지 전체 롤백. 0행을 성공으로 덮어쓰지 않고 명시적 조건 결과를 읽는다.
6. 기존 receipt와 hash가 다르면 409 `idempotency-conflict`. 같으면 최소 결과만 재전달한다. 과거 응답에 있던 글/프로필 본문을 receipt에 저장하거나 재생하지 않는다. 자원 본문은 현재 권한으로 다시 읽는다.

A에는 sid가 포함되므로 세션이 취소되거나 삭제·재가입한 요청이 뒤늦게 쓰는 것도 차단된다. profile 생성은 actor id가 아직 없어 별도 조건부 INSERT로 `users+sid`를 검사하고 `sub UNIQUE`로 멱등 처리한다.
이 초기 생성 응답 소실은 `GET /me`로 확인한다. 프로필 생성의 nickname은 최초 성공값을 유지하고 이후 이름 변경은 version 조건 command로 수행한다.

조건부 SQL 예시(가독성을 위한 개요이며 실행 migration은 P3-02에서 테스트한다):

```sql
INSERT INTO social_commands(actor,key,request_hash,execution_nonce,result_code,created_at)
SELECT :actor,:key,:hash,:nonce,
  CASE WHEN EXISTS(/* pair.version=:expected AND 수신자 AND pending AND 미만료 */)
       AND NOT EXISTS(/* 양방향 blocks */)
       AND /* 두 참여자의 accepted 수가 각 상한 미만 */ THEN 'ok' ELSE 'conflict' END,:now
WHERE /* A: sid/sub/profile/users/deleted_users 검증 */
ON CONFLICT(actor,key) DO NOTHING;
UPDATE social_pairs SET state='accepted', version=version+1
WHERE lo=:lo AND hi=:hi AND EXISTS(/* 이 nonce의 ok receipt */);
```

쓰기 전 조건을 결정하는 첫 SQL이 모든 필요한 조건을 포함하도록 command별 계약 벡터를 만든다. SQL 문장 실패 주입 및 두 동시 batch의 양쪽 순서를 실제 D1 테스트한다.
초대 소비가 만료 pending을 대체할 때는 첫 `ok` receipt에 최종 version(v+2)을 고정하고 같은 batch에서 expired pending(v) → none(v+1) → 새 pending(v+2)과 invite used를 처리한다. live pending은 `request-pending`으로 남기며 초대를 소비하지 않는다. 효과 SQL은 receipt의 고정 version 및 nonce와 현재 A를 재확인하고, 중간 SQL 오류는 receipt까지 롤백한다.
모든 CAS 변경은 `expectedVersion` 필수. 차단 설정은 긴급 철회이므로 version 없이 항상 현재 관계를 끊고 pair version을 올린다. 차단 해제는 expectedVersion CAS 필수다. stale 수락은 version/blocks에 막힌다.
응원은 toggle이 아닌 원하는 상태 `active:true|false` 설정, 중복 click은 한 클라이언트에서 직렬화한다. 다른 기기와 동시 설정하면 DB 도착 순의 마지막 성공값이다.

키는 `v1.<생성 UTC ms>.<128bit random>`이고 신규 key는 서버 현재 시각 기준 과거 24시간부터 미래 5분까지만 허용한다. receipt는 48시간 보존한다.
24시간 이후 새 실행은 409 `request-expired`; 48시간 이후 receipt가 정리돼도 과거 key로 재생성하지 못한다. 실제 성공 여부는 `GET /me`·내 공유·관계 조회로 확인한다.
클라이언트가 미래 시계를 쓰면 서버 응답의 `serverTime`으로 key 시각만 보정한다. idempotency 시각은 권한/정렬에 쓰지 않는다.
429/503은 receipt를 만들지 않는 일시 실패이며 Retry-After 뒤 같은 key 재시도. 확정 4xx receipt를 받은 뒤 입력/상태를 바꾸면 새 key가 필요하다.

## 6. API 계약

모든 경로는 `/api/social` 아래. GET에도 세션/권한 검사, 변경 POST에 `X-Tasky: 1`·`Content-Type: application/json`·동일 Origin 검사를 요구한다.
교차 출처 CORS를 열지 않는다. 본문은 인증 후 제한된 스트림으로 최대 8 KiB까지 읽고 초과 시 413(전체 버퍼링 금지).
응답은 `{data,serverTime}` 또는 `{error:{code},serverTime}`. 페이지는 `{items,nextCursor}`. 객체는 허용 필드만 직렬화하고 unknown 입력 필드는 거절한다.

| 메서드·경로                                                      | 입력                                        | 성공 data                                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| GET `/me`                                                        | 없음                                        | `{profile:null 또는 {id,nickname,version},mode:'off' 또는 'enabled' 또는 'read-only'}`       |
| POST `/profile`                                                  | `{nickname}`; 생성 전용                     | `{id,nickname,version}` 201 또는 기존 프로필 200                                             |
| POST `/profile/name`                                             | `{nickname,expectedVersion}`                | `{id,version}`                                                                               |
| GET `/friends`                                                   | cursor?, limit?                             | `{items:[{id,nickname,pairVersion}],nextCursor}`                                             |
| GET `/requests`                                                  | direction은 incoming 또는 outgoing, cursor? | `{items:[{peer:{id,nickname},pairVersion,expiresAt}],nextCursor}`                            |
| POST `/invites`                                                  | `{}`                                        | `{token,expiresAt}` 201; 원문 재생 금지, 응답 소실이면 목록에서 취소 후 새로 발급            |
| GET `/invites`                                                   | cursor?                                     | `{items:[{inviteId:hash,status,expiresAt}],nextCursor}` (hash로 사용 불가)                   |
| POST `/invites/revoke`                                           | `{inviteId}`                                | `{revoked:true}`                                                                             |
| POST `/invites/preview`                                          | `{token}`; 조회이지만 URL 노출 방지 POST    | `{nickname,expiresAt}`; 소셜 프로필 생성 전도 인증 세션이면 가능                             |
| POST `/requests`                                                 | `{token}`                                   | `{peerId,pairVersion}` 201                                                                   |
| POST `/requests/accept`, `/requests/decline`, `/requests/cancel` | `{peerId,expectedVersion}`                  | `{peerId,pairVersion,state}`                                                                 |
| POST `/friends/remove`                                           | `{peerId,expectedVersion}`                  | `{peerId,pairVersion,state:'none'}`                                                          |
| GET `/blocks`                                                    | cursor?                                     | `{items:[{id,nickname,pairVersion}],nextCursor}`                                             |
| POST `/blocks/set`                                               | `{peerId,blocked:boolean,expectedVersion?}` | `{blocked:boolean,pairVersion}`; true는 긴급 철회, false는 자신의 block+expectedVersion 필수 |
| GET `/feed`                                                      | cursor?, limit?                             | `{items:[PostView],nextCursor}`                                                              |
| POST `/posts/validate`                                           | `{ids:[...]}` 최대 50개; 조회 전용          | `{allowedIds:[...]}`                                                                         |
| GET `/posts/mine`                                                | cursor?, limit?                             | 같은 페이지 형태, 자신의 전체 공유                                                           |
| POST `/posts`                                                    | `{text,happenedOn}`                         | `{id}` 201                                                                                   |
| POST `/posts/delete`                                             | `{id}`                                      | `{deleted:true}` (이미 없으면 안전한 성공, 타인 존재 여부 비노출)                            |
| POST `/reactions/set`                                            | `{postId,active:boolean}`                   | `{postId,active}`                                                                            |

서버 mode의 기본값은 `off`다. `SOCIAL_MODE`는 `off|read-only|enabled`만 인정하며 누락·오류는 `off`다. `SOCIAL_ALLOWLIST`는 내부 `sub`의 비어 있지 않은 JSON 문자열 배열만 인정하고 wildcard·이메일·누락·오류는 전체 `off`로 닫는다. 비대상 계정도 매 요청 `off`다. `/me`에는 이 계정의 effective mode만 공개한다. 배포 설정에는 `SOCIAL_MODE=off`만 넣고 실활성화는 후속 운영 결정이다.

| effective mode | 허용 경로                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `off`          | GET `me/friends/requests/invites/blocks`, POST `invites/revoke`, `requests/decline`, `requests/cancel`, `friends/remove`, `blocks/set`(차단·해제), 계정 삭제 |
| `read-only`    | `off` 허용 경로와 POST `invites/preview`                                                                                                                     |
| `enabled`      | 위 경로와 POST `profile`, `profile/name`, `invites`, `requests`, `requests/accept`                                                                           |

POST는 동일 Origin과 `X-Tasky: 1`을 세션 조회 전에 검사한다(실패 403, 본문·빈도 미사용). 세션 검증 뒤 effective mode가 경로를 차단하면 503으로 본문을 읽지 않고 빈도도 쓰지 않는다. 그 다음 `Content-Type: application/json`과 **스트림 8 KiB 상한**으로 JSON을 읽는다. 인증된 content type 오류 415, 구문 오류 400, 크기 초과 413은 각각 해당 route bucket을 한 번 조건부 예약한 뒤 primitive 호출 없이 응답한다. 초과 한도 429가 transport 오류보다 우선한다. 예약 0행은 현재 actor를 다시 확인해 401/410/404/429를 구분한다. JSON 구조·필드·값의 의미 검증 실패는 primitive 안에서 처리하며 동일 요청을 HTTP에서 두 번 과금하지 않는다. 알 수 없는 path/method는 임의 bucket 없이 404다.

모든 소셜 성공·오류는 `{data,serverTime}` 또는 `{error:{code},serverTime}`와 `Cache-Control: private, no-store`·`Vary: Cookie`를 사용한다. 현재 sid의 삭제 marker가 있으면 410과 쿠키 삭제가 슬라이딩 갱신 쿠키보다 우선한다.

PostView는 `{id,author:{id,nickname},text,happenedOn,createdAt,reactionCount,myReaction}`. 본문에 HTML/Markdown은 없고 일반 텍스트로만 렌더링한다.
별명은 trim·NFC 후 최소 1자/최대 20 Unicode code points, 공유 문장은 최소 1자/최대 280 code points. 제어문자/줄바꿈/방향 전환 제어문자 거절, URL도 단순 텍스트로만 표시한다.
`happenedOn`은 1970년부터 2099년까지의 유효 날짜. 클라이언트 선택 날짜를 쓰고 viewer 시간대로 바꾸지 않는다. 게시 정렬 시각은 서버 시각이다.
모든 id는 정해진 opaque 형식, `limit`은 기본 20/최대 50, 잘못된 cursor는 400. tokens는 body 외 로그/URL query에 넣지 않는다.

401 `unauthorized`, 410 `account-deleted`는 기존 인증 처리. 403 `csrf`, 404 `unavailable`, 409 `conflict|request-pending|idempotency-conflict|request-expired`, 422 `validation|limit-reached`, 429 `rate-limited`, 503 `social-disabled|temporary`.
오류는 서버 stack·SQL·구글 sub·초대 원문을 포함하지 않는다. 5xx/응답 소실은 같은 key 재확인, stale CAS는 최신 목록을 읽은 뒤 사용자에게 재결정을 요청한다.
프로필 생성·preview·posts/validate 외 모든 POST에 Idempotency-Key 필수. invite 생성은 receipt에 token 대신 hash만 보관하므로 동일 key 재시도는 `{inviteId,tokenUnavailable:true}` 200으로 응답한다.

## 7. 페이지·철회 경합·캐시

피드는 F 조건으로 author id를 좁힌 뒤 posts의 `(author,created_at,id)` 인덱스로 조회한다. 반응 수는 reactor가 작성자의 현재 친구이며 양방향 block이 없는 경우만 집계한다(조회자의 친구인지와 무관). 집계는 페이지의 post id에만 묶어 읽는다.
친구 최대 50명+자신으로 조회 fan-in을 제한한다. author별 인덱스 cursor seek 후 최대 pageSize+1 후보를 읽고 SQL CTE의 global top-k로 병합한다(최대 51×51=2,601 후보). 마지막 A/F 필터와 본문 SELECT는 한 SQL 스냅샷이며 actor·cursor bind는 재사용해 D1 100개 바인딩 상한 내로 만든다. EXPLAIN QUERY PLAN과 실제 rows_read로 인덱스 적용을 확인한다. `OFFSET`은 쓰지 않는다. 첫 페이지 서버 high-water `(createdAt,id)`와 마지막 항목 tuple을 cursor에 넣어 이후 `(createdAt,id)<last`만 읽는다.
cursor는 HMAC 서명된 `{v,actorId,scope,upper,last,expiresAt}`이며 15분 유효. 다른 actor/scope에 재사용 불가. 같은 ms의 새 UUID가 upper 이하일 수 있으므로 완전한 스냅샷은 보장하지 않는다.
클라이언트는 한 페이지(기본 20, 최대 50개)만 메모리/DOM에 유지하고 `[다음 기록]`은 누적하지 않고 페이지 전체를 교체한다. 이전 페이지는 cursor 스택만 기억해 `[이전 기록]` 때 서버에서 다시 읽는다. 페이지 이탈 시 본문/반응/선택 카드를 폐기하며 응답에 id 중복이 있으면 제거한다. 최신 갱신은 첫 페이지로 돌아가 cursor 스택도 비운다. 삭제로 빈 페이지여도 nextCursor가 있으면 다음 기록을 허용한다. cursor 만료 시 첫 페이지부터 새로 읽고 안내한다.
친구/요청/차단/초대 목록은 각각 정렬된 id 또는 `(created_at,id)` 커서로 동일 actor/scope/기한 검증을 적용한다.

ACL 읽기는 `env.DB`의 primary 경로를 사용한다. Sessions API/read replica를 소셜 읽기에 추가하지 않는다. 허용 검사와 본문 읽기는 한 SQL 스냅샷 안에서 결합한다.
철회 commit 뒤 시작된 DB 읽기는 내용을 반환하지 않는다. **철회 이전에 승인된 응답·이미 렌더링된 내용의 즉시 회수는 보장할 수 없다**.
클라이언트는 현재 페이지의 모든 카드(스크롤 밖 포함, 최대 50개)의 id를 POST `/posts/validate`로 30초마다 검증한다(입력 `{ids:[...]}`, 결과 `{allowedIds:[...]}`, 변경 없는 조회, receipt 없음).
권한 소실/삭제 id를 메모리에서 지우고 진행 중 피드 응답도 request generation으로 폐기한다. generation은 계정/profile 변경·뷰 이탈·권한 철회·검증 실패마다 올리며 목록·선택 카드·응원 상태·초대 preview를 함께 비운다. 새 세대 이전에 시작된 모든 응답을 버린다. 서버 응답은 검증 시점 이후의 철회를 보장하지 않으며 다음 주기에 재검사한다.
검증 요청은 5초 deadline으로 제한하고 성공 응답이 없으면 가린다. 마지막 검증 성공부터 최대 35초 이후에는 예외 없이 공유 영역을 가린다. 검증 실패·네트워크 단절·백그라운드 진입 시 공유 영역을 가린다. 복귀/online/focus 시 현재 페이지 전체 재검증이 성공해야 다시 보여 준다. 스크롤 밖 카드도 같은 35초 lease로 가리고, 이전 페이지의 본문은 보존하지 않아 스크롤/페이지 이동으로 미검증 카드를 되살릴 수 없다.
한 탭의 철회/로그아웃은 BroadcastChannel로 같은 계정 탭의 공유 메모리를 무효화한다. 다른 사람·기기의 철회는 검증 주기로 반영한다.

모든 성공/오류 응답에 `Cache-Control: private, no-store`, `Vary: Cookie`; Worker 캐시/브라우저 HTTP 캐시/Service Worker runtime cache/IDB/localStorage에 공유 데이터와 토큰을 넣지 않는다.
작성 중 문장과 재시도 key는 탭 메모리만. 재로드 시 잃을 수 있음을 작성 창에 안내하며 새로고침 후 자동 게시하지 않는다.
초대 링크는 `/#invite=<token>`(URL fragment). 앱은 즉시 `history.replaceState`로 fragment 제거하고 로그인 왕복에만 sessionStorage의 24시간 이내 token을 임시 보관한다.
소셜 모듈 로드보다 먼저 앱 진입부가 fragment를 제거한다. OAuth return URL에는 token을 넣지 않는다. 사용/취소/로그아웃/만료/계정 전환 시 지우고 `Referrer-Policy: no-referrer`를 설정한다.

## 8. 삭제·정리·한도·운영

계정 삭제 latch의 첫 문장은 현재 sid/sub/expiry/users/미삭제 조건으로 `deleted_users`를 `INSERT ... SELECT ... ON CONFLICT DO NOTHING` 한다. marker에 서버 nonce를 기록하며 중복 호출은 기존 marker를 덮지 않는다. 이어지는 모든 DELETE는 같은 sub+nonce marker로 가드한다. 순서는 작성 post의 반응 + 본인의 반응 → posts → 양방향 pairs/blocks → owner 또는 used_by가 본인인 invites → commands/limits(프로필 id 및 아래 pre subject) → profile → 기존 entities/devices/users다. 마지막 SELECT와 첫 INSERT 적용 행수를 모두 확인해 0행을 204로 취급하지 않는다. `worker/account/delete.ts`는 이 단일 batch primitive를 호출하고 성공 뒤 현재 sid만 폐기하며, 실패한 latch는 현재 sid·marker로 401/410을 다시 분류한다.
다른 sessions의 지연 삭제는 유지한다. old sid로 대기 중이던 소셜 요청은 A의 sid/profile 조건에 막히며 재가입 시 옛 소셜 id를 재사용하지 않는다.
계정 삭제 테스트에는 friend가 읽는 중 삭제·삭제 직후 동일 sub 재가입·옛 요청 재전송을 포함한다. 데이터 삭제가 하나라도 실패하면 전체 batch가 롤백된다.

다음 숫자는 **설계 초기 상한**이며 사용량 실측/플랫폼 제공량이 아니다. 시범 운영 측정 뒤 같은 스펙 변경 절차로 조정한다.

| 항목           | 초기 상한 / 동작                                                                   |
| -------------- | ---------------------------------------------------------------------------------- |
| 친구           | 계정당 50명; 수락 시 양쪽을 트랜잭션에서 재검사                                    |
| pending        | 발신 10건·수신 50건; 새 요청 시 양쪽 검사                                          |
| 초대           | active 5개·생성 20회/UTC일; 만료 포함 목록 관리                                    |
| 공유           | 보유 1,000개·생성 20개/UTC일; 삭제는 생성량을 되돌리지 않음                        |
| 차단           | 1,000명; 도달하면 추가 차단을 조용히 실패시키지 않고 관계 삭제·운영 문의 제시      |
| 일반 쓰기      | 계정당 60회/분; 철회·친구 삭제·차단·계정 삭제는 별도 60회/분 예산                  |
| 읽기·초대 확인 | 계정당 120회/분; preview 20회/분 별도; 429 + Retry-After                           |
| GC             | 만료 invite 7일 후, receipt 48시간 후, limit window 종료 48시간 후; 1회 최대 500행 |

한도는 `social_limits` 조건부 upsert/command guard를 같은 batch에 넣어 전역 계정 단위로 강제한다. subject는 프로필 존재 시 `p:<id>`, 생성 전 /me·profile·preview는 `pre:<HMAC-SHA256(SESSION_SECRET,sub)>`이고 FK 없이 저장한다. /me·profile·preview는 프로필 생성 뒤에도 pre subject만 계속 사용해 전환으로 우회하지 못하게 한다. 다른 API는 p subject를 쓴다(한 요청에 subject 두 개를 증가시키지 않는다). 계정 삭제는 두 subject를 지우고 TTL GC도 동일 적용한다. 읽기 limiter는 별도 원자적 조건부 UPSERT RETURNING으로 승인 뒤 조회한다.
`reserveLimit`는 조건부 UPSERT와 RETURNING을 제공한다. `createInvite`는 대표 성공 생성량 계약으로 receipt·초대 hash·UTC 일간 생성 counter를 단일 batch에 묶고, active 5개/하루 20회 초과는 422 receipt를 남긴다. 같은 key 재시도는 원문 token 없이 invite id만 돌려주며 생성 counter를 다시 올리지 않는다. 16 관계 경로의 route별 pre/p 선택은 `worker/social/policy.ts`와 `router.ts`에 있다. 게시글·응원·피드 6경로는 후속 P3-04 범위다.
빈도 limiter는 현재 actor 인증 직후 DTO/key 검증·receipt 조회 전에 요청당 정확히 한 번 원자적으로 승인/증가하고 초과는 429(새 receipt 없음), 성공 생성량/보유량 상한은 command의 422 limit-reached receipt로 확정한다. replay·hash conflict·만료/잘못된 key와 확정 4xx도 빈도에 포함하고, 생성 건수는 성공만 증가한다. 분/일 window는 서버 UTC fixed window; 경계에서 최대 두 window 분량 burst 가능. profile 없는 preview에도 위 pre subject limiter를 적용하고 raw sub를 로그에 남기지 않는다. 후속 HTTP 배선은 같은 bucket을 다시 증가시키지 않는다.
PoP별 Workers rate-limit은 보조 과부하 방어로만 고려한다. 기능 철회를 일반 생성량 한도가 막지 않게 예산을 분리한다. 대규모 공격을 해결했다고 주장하지 않는다.
GC는 scheduled Worker로 작은 batch를 반복하고 오류 시 재시도한다. FK 순서·인덱스·계정 삭제 최악 비용은 출시 전 원격 D1에서 측정한다.
T-2의 `collectSocialGarbage`는 호출당 세 테이블 합계 최대 500행을 지운다. scheduled entry 배선은 P3-04 소유다.

로그는 request id·route 분류·결과 코드·지연·D1 rows_read/rows_written만, text/nickname/token/sub/email/sid/body는 금지한다. 인증값이나 원문 URL을 에러 tracker에 붙이지 않는다.
초기 내부 시범은 운영자가 초대한 계정 allowlist로 제한한다. 피드 더 보기의 차단과 운영 문의 경로를 제공하고, 운영 문의에 글 본문을 자동 첨부하지 않는다.
공개 모집 전 신고 접수·처리 책임자·삭제/정지 정책·보존 정책과 개인정보 안내를 승인해야 한다. 현재 설계는 이 운영 체계까지 구현한 것으로 간주하지 않는다.

## 9. 근거와 검증 경계

2026-09-28 조회한 공식 문서: [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/)는 순차 batch 실패 시 전체 롤백을 설명한다. 0행은 예외가 아니므로 §5의 SQL 가드가 필요하다.
[D1 read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/)은 Sessions API로 replication을 사용하는 경로를 설명한다. 이 설계는 현재 직접 DB primary 경로를 유지한다.
[Workers rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)의 PoP별 eventually consistent 특성 때문에 계정 전역 상한을 그 바인딩 하나에 맡기지 않는다.
이 문서는 실행된 migration/성능 결과가 아니다. D1 문법·원자성·실기기 사용성·보안 성능의 증거를 만들 티켓과 통과 기준은 [구현 계획](phase3-implementation-plan.md)에 있다.
