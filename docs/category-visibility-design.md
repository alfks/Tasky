<!-- 읽기 조건: 세 공개범위의 서버/포트/동기화/화면을 구현하거나 보안 검토할 때. -->

# 카테고리 공개범위 상세 설계

- 상태: approved, 2026-09-30. [ADR-0024](decisions/ADR-0024-category-visibility.md)·[제품 스펙](specs/category-visibility.md).
- 이 확장은 [기존 Phase 3 설계](social-design.md)의 개인 자료 분리·actor·CAS·멱등·한도·삭제·온라인 lease 계약을 유지하며 아래 카테고리/전체 공개 차이만 대체한다.

## 1. 타입과 권위

`CategoryVisibility = private | friends | public`.
개인 `Category`의 선택 필드: `visibility?`, `socialCategoryId?`, `socialCategoryVersion?`. 누락 visibility는 private다.
개인 레코드의 id와 새 공개 id는 별개이며 원본 id를 소셜 요청에 보내지 않는다. `visibility`는 마지막 확인 상태이지 권한의 근거가 아니다.
공개 DTO `SocialCategoryView = {id,name,color,emoji?,visibility,version,updatedAt}`. owner 관리에는 `postCount`와 선택 필드 `revoked?: boolean`을 더해 범위 확대의 기존 사본 수와 철회 상태를 안내한다. 타인에게 private 사본 수·철회 표시·소유자 sub·원본 id를 내보내지 않는다.
서버 `social_categories`는 id PK, owner FK profile, 정규화 metadata, visibility, version>=0, updated_at, deleted_at nullable을 갖는다. owner/visibility/id 인덱스를 둔다. category 목록은 id 오름차순 keyset이며 post의 created_at/id 정렬과 별개다.
`social_posts.category_id`는 nullable FK. 기존 null 행은 friends 사본으로 유지한다. 연결된 category가 없거나 tombstone이면 owner 관리 외 읽기를 거절하며 null 규칙으로 떨어뜨리지 않는다.
공유 `PostInput = {text,happenedOn,categoryId?,categoryVersion?}`와 `PostView.category?`에 공개 DTO의 최소 metadata를 더한다. categoryId 누락은 기존 클라이언트의 friends 게시 호환에만 쓰며 새 UI는 항상 확인된 category와 version을 고른다. categoryId와 categoryVersion은 함께 존재하고 SQL에서 현재 canonical version과 일치해야 한다. version만 있거나 id만 있는 입력은 거절한다.
출력 category의 visibility는 서버 현재 값을 사용한다. 원본 제목은 사용자 기기에서 선택해 text로 복사하고 원본 memo/id/통계는 DTO에 넣지 않는다.

## 2. 권한 매트릭스

| 현재 범위   | owner     | 수락된 친구 | 인증된 비친구 | 익명 | 인증된 양방향 차단 |
| ----------- | --------- | ----------- | ------------- | ---- | ------------------ |
| private     | 읽기/관리 | 불가        | 불가          | 불가 | 불가               |
| friends     | 읽기/관리 | 읽기/응원   | 불가          | 불가 | 불가               |
| public      | 읽기/관리 | 읽기/응원   | 읽기/응원     | 읽기 | 불가               |
| legacy null | 읽기/관리 | 읽기/응원   | 불가          | 불가 | 불가               |

owner의 자기 글 응원은 범위와 무관하게 금지다. 인증된 읽기는 기존 A와 현재 양방향 block을 적용한다.
반응 수는 현재 public일 때 active·차단되지 않은 인증 비친구의 응원까지 포함하고 friends/legacy에서는 현재 친구의 응원만 센다. private/tombstone의 타인 반응은 읽기/집계/추가에서 차단한다.
익명은 active owner/profile/account·category public·삭제되지 않은 사본만 읽는다. 잘못된/만료된 인증 쿠키가 있으면 401/410이며 익명으로 재시도하지 않는다.
친구 피드는 자기 사본과 현재 친구의 허용 사본만 보여 준다. 공개 탐색은 public만, 내 공유는 자신의 숨겨진 사본도 포함한다.
단일 자원 조회·category 목록·validate·반응도 같은 현재 ACL을 적용한다. 불가/비존재는 같은 404이며 관계/차단 여부를 에러에 넣지 않는다.

## 3. 포트와 HTTP

기존 온라인 포트에 다음 계약을 추가한다. actor/owner는 호출자 인자가 아니다.

| 경로                                    | 입력                                             | 결과/정책                                              |
| --------------------------------------- | ------------------------------------------------ | ------------------------------------------------------ |
| GET `/api/social/categories/mine`       | cursor?, limit?                                  | owner 관리 페이지, private/tombstone 사본 관리 포함    |
| GET `/api/social/categories/:id`        | opaque id                                        | 현재 ACL의 sanitized category, 불가 404                |
| POST `/api/social/categories`           | id?,expectedVersion,name,color,emoji?,visibility | owner upsert canonical DTO+postCount, Idempotency-Key  |
| POST `/api/social/categories/revoke`    | id,expectedVersion                               | tombstone/private 철회 canonical 결과, Idempotency-Key |
| GET `/api/social/public/categories`     | cursor?,limit?                                   | 익명 허용 public category 페이지만                     |
| GET `/api/social/public/feed`           | cursor?,limit?,categoryId?                       | 익명 허용 public 사본 페이지만                         |
| GET `/api/social/public/posts/validate` | ids (opaque id 최대 50개)                        | 익명 허용 현재 public allowedIds만, 변경/receipt 없음  |
| GET `/api/social/public/posts/:id`      | opaque id                                        | 익명 허용 단일 public 사본, 불가 404                   |

구체 경로의 static route를 dynamic id보다 먼저 판정한다. 기존 `/posts`는 category 소유권/생존/현재 version을 SQL batch 안에서 검증한다. category version을 게시 확인에 연결해 오래된 미리보기에서 넓어진 범위를 사용하지 않는다. 409 stale이면 기존 command는 확정 종료하고 새 category와 audience를 미리보기로 읽은 뒤 사용자가 다시 공유 버튼을 눌러 새 key로 결정해야 한다. 불명확한 응답 재시도만 기존 key를 재사용한다. 새 UI가 both-absent legacy 입력을 생성하는 경로는 제공하지 않는다.
`categories/mine`·owner get·revoke는 off에서도 제공한다. private로 축소는 철회 bucket과 off/read-only 허용, 확대/metadata 생성·업데이트는 enabled에서만 허용한다.
익명 public GET은 read-only/enabled에서만 제공하고 off는 503이다. 작성자 allowlist를 현재 서버 policy에서 확인한다. 인증 visitor는 자기 effective mode도 확인한다.
인증·동일 Origin·X-Tasky·8 KiB 스트림·current sid/no deleted account·request limiter·Idempotency-Key·쿠키 갱신·오류 envelope 계약은 기존 그대로다.
익명 read는 새 방문자 식별정보를 모으지 않는다. 요청당 bounded index 작업을 강제하고 배포 edge/global limiter 설정·실측을 활성화 게이트로 둔다. 전달받은 임의 IP 헤더를 신뢰한 자체 rate identity를 만들지 않는다. 서버 시간/서명 cursor를 쓰며 actor/scope와 익명 public scope를 섞지 않는다.
공개 읽기는 세션 dispatch 없이 호출하는 별도의 좁은 public read port다. 인증된 SocialRepository의 세대 검증을 해제하지 않는다. 익명 port에 mutation 메서드를 노출하지 않는다.
모든 성공/오류는 no-store/Vary Cookie, 본문·토큰·별명·sub·email·sid를 로그나 영속 캐시에 남기지 않는다.

## 4. 원자적 변경·정렬·삭제

category upsert는 profile/현재 sid/소유권/expectedVersion/현재 상한을 조건으로 receipt와 효과를 한 batch에 묶는다. create는 server random id, expectedVersion=0이며 actor당 최대 50개의 live projection을 허용한다.
같은 key+hash는 canonical resource/version 결과를 확인하며 같은 key 다른 DTO는 409다. key freshness/GC와 일반 write/revoke 빈도는 기존 계약을 사용한다.
receipt nonce로 이번 효과를 가드하고 사후 불변식 실패는 CHECK 실패로 전체 batch를 롤백한다. 사전 조회 결과만 믿어 무조건 upsert하지 않는다.
post 생성도 같은 batch에서 category owner/current version/생존을 확인한다. 새 UI는 `categoryVersion`을 보내 preview 이후 범위 변경이면 409로 재확인을 요청한다. private category에도 owner-only 사본을 저장할 수 있으나 UI는 외부 공유로 표시하지 않는다.
범위/metadata 변경은 연결된 기존 사본을 새 현재 ACL로 즉시 읽는다. 공개 탐색은 ordered index로 bounded keyset을 사용한다. 공개 membership 보조 인덱스를 두면 category upsert/post/delete batch와 원자적으로 갱신하고 최종 SELECT에서 category ACL도 재검사한다.
owner의 category별 사본 수는 기존 계정 최대 1,000개 안에서 indexed COUNT로 얻고 private 수는 owner에게만 반환한다. post 생성이 경합하면 그 생성 자체가 현재 범위/버전 확인을 거치며 확대 확인의 count는 당시 정보다.
category 목록은 id 오름차순이며 cursor는 owner/public 목록 scope와 현재 viewer에 묶는다. post 공개 feed cursor는 선택된 categoryId까지 scope에 묶고 현재 ACL로 필터한 뒤 LIMIT를 적용한다.
공개 feed와 category 목록은 인덱스에서 최대 1,000개 후보 ID만 검사하고 현재 ACL을 적용한 후 페이지를 만든다. 페이지가 찼으면 마지막 표시 항목, 덜 찼으면 마지막 검사 후보를 다음 seek 위치로 사용한다. 따라서 items가 비어도 nextCursor가 있을 수 있으며 클라이언트는 다음 페이지 동작을 제공하고 자동 무한 조회하지 않는다. 후보 수나 숨겨진 ID는 응답에 노출하지 않는다.
이 seek 위치를 담는 공개/category cursor는 Web Crypto AES-GCM으로 암호화·인증한다. `SESSION_SECRET`에 `tasky:projection-cursor:key:v1\0` 용도 접두사를 붙여 SHA-256으로 AES 키를 파생한다. 매 cursor마다 무작위 12바이트 IV와 `tasky:projection-cursor:v1` AAD를 사용한다. payload에는 버전·익명 또는 인증 사용자 범위·목록 종류·categoryId 필터·첫 페이지의 upper 경계·마지막 seek 값·15분 만료를 묶는다. category 목록의 upper는 null이다. 다음 페이지에서 최초 만료를 연장하지 않고 디코딩 입력은 2,048자로 제한한다. 범위/사용자 불일치·변조·만료·잘못된 구조는 거절하며 숨겨진 seek ID를 평문으로 노출하지 않는다. 키 회전으로 무효화된 cursor는 첫 페이지 새로고침으로 복구한다.
post 페이지 limit 기본 20/최대 50, created_at/id 내림차순·페이지 교체 계약을 유지한다. 기존 친구 feed의 HMAC cursor는 바꾸지 않으며 새 의존성을 추가하지 않는다. OFFSET·본문 전수 읽기·무제한 author fan-in은 금지한다.
공개 category 철회는 tombstone과 private로 만들며 기존 사본은 owner 관리에 남긴다. metadata를 legacy로 재노출하지 않는다.
소유자 관리용 category 조회/목록과 명령 응답은 tombstone을 구분하도록 선택 필드 `revoked?: boolean`을 포함하며, 철회된 projection은 `revoked: true`로 반환한다. 이 표시는 소유자 전용이며 공개/친구 category 및 일반 `PostView`에는 포함하지 않는다. myPosts의 숨겨진 사본은 소유자가 계속 삭제할 수 있지만, 연결된 tombstone을 살아 있는 private projection으로 오인해 재공개하지 않는다. 클라이언트는 revoked를 확인하면 개인 category의 캐시 binding을 지우고 나만 보기로 정리한다. save는 tombstone의 부활을 거절한다. 다시 공개하려면 사용자의 새로운 명시적 확인으로 새 projection을 만들며 이전 사본을 자동 이전하거나 재공개하지 않는다.
개인 category 삭제는 canonical 서버 철회를 먼저 수행한 뒤 개인 삭제 계획을 적용한다. 실패하면 개인 삭제/성공 토스트를 하지 않고 재시도를 제공한다. 기존 삭제 undo는 projection을 재공개하지 않는다.
기존 보유 1,000글/생성 20글 UTC일·친구 50명·pending 발신10/수신50·차단1,000·초대active5/생성20 UTC일·일반 write60/분·revoke60/분·read120/분·preview20/분과 GC 합계500행/호출을 유지한다.
계정 삭제의 기존 nonce batch에 public membership·category cleanup을 추가한다. 사본/반응/관계/초대/category/profile 정리가 부분 성공하지 않는다.

## 5. 개인 저장·복원 경계

비인덱스 필드 추가이므로 Dexie 버전업은 없다. Category 도메인 생성/수정·검증·personal sync whitelist와 memory/IDB/backup 계약을 함께 확장한다.
오래된 category는 private로 표시한다. 불법 범위/id/version은 거절하거나 안전한 private 초기 상태로 정규화하며 불법 값을 public로 보정하지 않는다.
백업 내보내기는 개인 category 연결 정보만 포함할 수 있지만 공개 본문·관계·초대·reaction은 포함하지 않는다. 복원/merge는 서버 publication을 자동 생성/변경하지 않는다.
공유/범위 편집 전에 owner projection을 조회해 소유권/id/version을 확인한다. 존재하지 않거나 다른 owner이면 local 연결을 신뢰하지 않고 private로 재설정한 뒤 명시적으로 새 projection을 만든다.
여러 기기 personal LWW 결과는 remote CAS authority를 덮어쓰지 못한다. private category 편집은 개인 outbox로 가능하되 published metadata/audience 변경은 online canonical 결과를 확인한 뒤 저장한다.

## 6. 화면 조립과 상태

친구 화면과 피드/관계/초대/공유 UI는 social에 둔다. AudiencePicker/범위 확인 창/확인 badge는 category에 둔다. 둘은 서로 직접 import하지 않는다.
셸이 완료 todo를 원본 없는 선택용 값으로 바꾸고 category projection reconciliation/명시적 변경 콜백을 주입한다. 기존 날짜/스크롤 복원·단축키 suspend·문서 제목·하나의 main 계약을 유지한다.
별도 `/public` 진입만 AuthGate 밖에서 지연 공개 읽기를 조립한다. 개인 앱은 로그인 필수며 public 진입에서 개인 DB를 보여 주지 않는다.
새 친구/공개 feed/category 공개범위 화면은 명시한 소스 진입점에서 지연 로드한다. Rollup의 imports/dynamicImports 모듈 그래프로 기존 개인 앱 진입점과 개인 기능에 필요한 chunk를 계산하고, 새 온라인 전용 화면에서만 도달하는 chunk만 선택 로드로 분류한다. 개인 기능도 사용하는 공유 chunk와 분류를 입증하지 못한 chunk는 필수로 취급한다. 파일명 문자열로 제외하지 않는다. 기존 개인 기능의 preload 및 PWA 오프라인 의존성은 유지하며 선택 chunk는 초기 modulepreload에서 제외한다. 최초 로드 예산은 실제 HTML script/modulepreload 및 필수 정적 의존성의 합으로 검증하고 기존 entry 167,500 B·network 221,000 B 상한을 유지한다. 전체 JS와 선택 화면별 추가 전송량도 별도로 보고하여 크기를 숨기지 않는다. 검사기는 선택 chunk의 승인된 진입점 도달성과 필수/선택 분류의 완전성을 확인한다. 계약 변경의 근거는 [ADR-0025](decisions/ADR-0025-optional-online-chunks.md)다.
초대 fragment는 src/app/main.tsx보다 앞선 bootstrap 시점에 바로 history.replaceState로 제거한다. sessionStorage 제한 key의 24시간 token은 로그인 왕복 전용이며 계정 전환·로그아웃·사용·취소·만료에 지운다. analytics가 token을 읽기 전에 처리하고 no-referrer를 유지한다.
공개범위 선택과 metadata는 명시적인 preview 확인 후 저장한다. 확대 확인에는 대상·현재/다음 범위·기존 사본 수·logged-out 읽기·이미 본 자료 회수 한계를 보여 준다.
축소 busy 상태에서도 확인 badge는 이전 값을 유지한다. 실패 안내: `공개 범위를 변경하지 못했어요. 현재 공개 범위는 …예요.`
범위 확인 중 공유를 막고 같은 계정의 일시 실패에는 미전송 초안을 메모리에 유지한다. 공유 작성 초안은 다른 계정/로그아웃/닫기에 지우고, 세대가 바뀐 화면 응답은 폐기한다. 이미 제출된 미확정 category command의 불변 요청은 아래 복구 계약으로 별도 관리한다.
공유 preview는 제목·날짜·sanitized category·확인된 audience만 표시한다. Enter/IME로 게시하지 않고 explicit 버튼만 사용한다. 미전송 문장은 Esc/뒤로/탭 변경에서 버리기 확인한다.
피드의 30초 검증·5초 deadline·35초 hard lease, 페이지 교체·새 기록 버튼·offline/hidden 가림·응원 상태·focus 복귀·불가 상태 안내는 기존 Phase 3 계약을 유지한다. 공개 화면도 동일한 권한 검증과 가림을 적용한다.

## 7. 공개 연결과 미확정 명령 복구

이 절은 기존 API·개인 자료 분리·공개범위 권위를 유지하며 이미 제출한 category command의 수명과 수동 복구만 명확히 한다. 새 API·의존성·영속 outbox·자동 mutation은 없다.

1. **소유권과 조회**: 기존 `categories({limit,cursor})` 소유자 목록·`category({id})`의 엄격한 소유자 관리 응답 계약으로 확인한다. `postCount`가 선택적으로 있다는 사실만으로 소유권을 추정하지 않는다. 개인 원본 id는 서버 DTO에 넣지 않는다. 조회 budget/cursor가 소진되거나 페이지가 불완전하면 미해결로 남기며 연결을 없다고 판정하지 않는다.
2. **미확정 registry**: category의 `category-publication-recovery.ts`에 검증된 actor와 개인 category별 탭 메모리 entry를 두고 원래 정규화 DTO·key·출발 binding/version/metadata CAS를 불변 보관한다. 연결 없는 서버 철회는 명령 종류와 remote id로 구분한다. 상태는 submitting/uncertain, 계정별 미해결 최대 32개다. 상한에서 새 요청만 막고 기존 확인은 허용하며 미확정 항목을 자동 축출하지 않는다. modal 관측 generation과 command 수명은 별개다. 최초 제출의 local binding/version/metadata CAS는 재열기에도 유지한다. 새 observer의 검증 session token은 바뀔 수 있지만 출발 CAS를 현재 자료로 교체하지 않는다. 창 닫기/dispose 후 같은 검증 계정에서 복구하며 재로드/백업에는 보관하지 않는다.
3. **수명과 인증**: accountDeletedNotice/accountSwitchedNotice·account-deleted 410은 entry를 폐기한다. sync phase starting/locked/error처럼 ready가 아닌 auth 신호·401은 격리하여 UI/읽기/변경을 막고, 새 검증과 me 확인에서 같은 actor이면 복구·다른 actor이면 폐기한다. 명시적 logout은 `performLogout`의 백업 승인 이후 실제 로컬 wipe 경계에서 전용 clear를 호출하며 백업 취소 때 지우지 않는다. closed/revoked/recheck/provider/cross-tab/activation/offline/hidden은 관측/늦은 응답 적용을 무효화하되 미확정 entry를 유지하고 같은 actor 재검증 전 잠근다. cross-tab payload는 identity 근거가 아닌 무효화 신호뿐이다. 관련 없는 B의 성공/철회는 A의 entry를 지우지 않는다.
4. **관측과 탈출**: 서버 요청 시작부터 15,000 ms 뒤 결과를 모르면 uncertain으로 전환한다. 원래 fetch가 서버에서 중단/실패했다고 가정하지 않고 늦은 결과는 관측 generation으로 폐기한다. 타이머는 종료/dispose에 정리하되 command entry는 남긴다. bounded submitting 동안 X/Esc/outside/cancel을 막고 deadline 뒤 `[같은 요청 다시 확인]` 또는 `[나중에 확인]`을 제공한다. 재확인은 동일 DTO/key이며 입력은 잠근다. 나중에 확인은 서버 공개 가능성을 알리고 닫기만 한다. offline/hidden/복귀/창 재열기는 POST를 자동 시작하지 않는다. mode off에서는 자동 조회·새 공개·미확정 공개 재전송을 하지 않으며 기존 API가 허용하는 명시적 owner 확인/철회는 제공한다.
5. **재로드·복원 표시**: 개인 binding 없는 항목의 모든 category 문맥·backup/import 안내는 `공유 연결 없음`과 서버 관리 안내를 사용한다. 라디오 private 기본은 개인 설정이고 기존 서버 사본의 private 증거가 아니다. 연결 캐시는 마지막 확인 범위/미확정 표시로 구분한다. 공개 상태를 이름으로 추측하거나 mapping을 자동 복원하지 않는다. import가 표식을 없애도 이전 서버 projection은 자동 변경하지 않는다. 로그아웃·off 화면은 자동 네트워크 조회를 시작하지 않는다.
6. **수동 관리**: 친구 관리의 `[공유 카테고리 관리]`에서 소유자 목록을 명시적으로 불러오고 페이지를 수동 이동한다. 현재 metadata/audience/postCount·기기 연결 유무를 표시한다. 연결되지 않은 항목은 다른 기기의 정상 projection일 수 있다. 자동 연결·삭제·철회하지 않으며 tombstone은 비활성 표시하고 연결 대상에서 제외한다. 미확정 복구 창에서 관리로 이동할 때 `[나중에 확인]`으로 서버 공개 가능성을 안내하고 registry를 유지한 채 이전 창을 미완료로 닫는다. 안내 없이 자동으로 닫지 않는다.
7. **명시적 연결**: 미확정 entry가 없는 unbound 개인 L과 살아 있는 unlinked 내 서버 R을 고른다. fresh owner canonical을 준비해 L/R 양쪽 이름·R 범위/사본 수·모두 공개 안내를 확인받는다. 확인 때 같은 id/version/visibility를 재조회하고 달라지면 새 preview와 재확인을 요구한다. 로컬 commit은 account·출발 binding/version·metadata CAS를 queued write 안에서 검사하고 visibility/socialCategoryId/socialCategoryVersion 표식만 쓴다. 개인 삭제/수정·기존 binding·중복 R 연결·revoked R·pending unknown을 거절하며 이름/할 일/서버 metadata를 변경하지 않는다. 이후 범위 확인의 preview/DTO는 `metadata ?? confirmed ?? category`로 R의 실제 canonical을 사용한다. 서버 read와 개인 write는 원자적이지 않으므로 결과 표시는 마지막 확인 상태이며 동시 원격 공개 확대를 고정했다고 주장하지 않는다.
8. **철회와 결과 적용**: 관리 철회는 기존 category와 사본/다른 기기에 미치는 영향을 확인받고 현재 version·새 key를 쓴다. uncertain 재확인만 동일 key/DTO를 쓴다. 409는 현재 canonical을 읽어 새 명시 확인을 받으며 자동 재실행하지 않는다. 서버 완료 후 정확히 일치하는 local binding만 CAS로 정리한다. 성공 receipt의 최신 canonical은 해당 intent만 해소하며, 뒤의 revoke를 오래된 save 응답으로 덮어쓰지 않는다. canonical revoked는 연결을 지우고 private로 정리한다. 현재 canonical이 원래 audience/metadata와 다르면 실제 값을 반영하되 요청한 상태로 성공했다고 안내하지 않는다. 로컬 CAS 실패는 현재 자료를 유지하고 연결되지 않은 서버 결과와 수동 연결을 안내한다. unknown create를 잊거나 attach로 우회하지 않는다.
9. **배선과 검증**: state는 registry/controller/hook/cache, category UI는 badge/modal/manager, 셸은 category-social 조립과 logout 경계를 맡는다. local source id/본문은 registry·개인 경계 밖에 전송하지 않는다. 검증은 lost create/revoke→닫기/재열기 동일 key·DTO와 단일 효과, unrelated revoked·provider·cross-tab 유지, 늦은 observer 적용 금지, offline/hidden 무자동 POST, 401 같은 actor 복구·410/logout/다른 actor 폐기, 상한/무축출, off 명시 cleanup, canonical replay/출발 CAS 경합, reload/import 중립 표시, 다른 기기 projection 보존, marker-only attach/중복·revoked·pending·changed 거절, 불완전 owner 페이지 연결 보존, 소유권 추정 금지, 409 재확인, L/R 다른 이름의 실제 R preview, 키보드·busy·uncertain 탈출을 포함한다.

## 8. 검증과 출시

공통 벡터를 domain/memory/실 Miniflare D1에서 직접 실행한다. 범위별 owner/friend/stranger/anonymous/두 방향 block, legacy null, unavailable category, profile/account 삭제를 직접 HTTP 포함해 검증한다.
private 기본·cross-owner category binding·categoryVersion stale·idempotent lost response·SQL batch 중간 실패·범위 확대/축소·동시 게시/철회·단일 조회/validate/반응 경합을 테스트한다.
backup restore/import·private LWW·오프라인·account switch가 publication을 복원하거나 넓히지 못함을 보인다. 위조 쿠키 public fallback 금지·unauth writes 거절·원본 field whitelist·공개 pagination ties/모드/allowlist를 검증한다.
공개 cursor는 비허용 후보 1,000개 이후 허용 기록으로 진행·중복 없음·빈 items와 nextCursor·숨겨진 후보 ID의 평문 부재·IV 비반복을 검증한다. 변조·사용자·목록 종류·categoryId·만료·구조 불일치와 키 회전 복구도 검증한다.
revoked 표시의 소유자 한정 노출·철회 binding 정리·tombstone 수정 거절·새 projection 생성 시 이전 사본 비노출을 검증한다.
지연 로드 분류의 음성 대조와 콜드 브라우저의 개인 첫 진입 네트워크·친구/공개 화면 진입 추가 요청·기존 개인 PWA 오프라인 동작을 검증한다.
UI: 범위 확인/사본 수/실패 유지·IME/키보드/초안 버리기·전체 초대 수락 공유 응원 삭제·고립된 소셜 장애·lease·가로 스크롤·다크/강제 색/움직임 감소를 확인한다.
`pnpm check`, `pnpm build` 기존 예산, 영향 E2E와 PWA API cache 금지를 통과한다. 운영 실인증·두 사람 사용성·원격 부하/비용·정확한 배포/SW 갱신은 수행 증거 없이 통과로 기록하지 않는다.
기본 SOCIAL_MODE=off이며 [기존 출시 게이트](phase3-implementation-plan.md)를 유지한다. 구현 완료·PR 머지는 운영 활성화의 증거가 아니다.
