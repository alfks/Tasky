<!-- 읽기 조건: 세 공개범위의 서버/포트/동기화/화면을 구현하거나 보안 검토할 때. -->

# 카테고리 공개범위 상세 설계

- 상태: approved, 2026-09-30. [ADR-0024](decisions/ADR-0024-category-visibility.md)·[제품 스펙](specs/category-visibility.md).
- 이 확장은 [기존 Phase 3 설계](social-design.md)의 개인 자료 분리·actor·CAS·멱등·한도·삭제·온라인 lease 계약을 유지하며 아래 카테고리/전체 공개 차이만 대체한다.

## 1. 타입과 권위

`CategoryVisibility = private | friends | public`.
개인 `Category`의 선택 필드: `visibility?`, `socialCategoryId?`, `socialCategoryVersion?`. 누락 visibility는 private다.
개인 레코드의 id와 새 공개 id는 별개이며 원본 id를 소셜 요청에 보내지 않는다. `visibility`는 마지막 확인 상태이지 권한의 근거가 아니다.
공개 DTO `SocialCategoryView = {id,name,color,emoji?,visibility,version,updatedAt}`. owner 관리에는 `postCount`를 더해 범위 확대의 기존 사본 수를 안내한다. 타인에게 private 사본 수·소유자 sub·원본 id를 내보내지 않는다.
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
post 페이지 limit 기본 20/최대 50, created_at/id 내림차순, HMAC opaque cursor와 15분 만료·페이지 교체 계약을 유지한다. OFFSET·본문 전수 읽기·무제한 author fan-in은 금지한다.
공개 category 철회는 tombstone과 private로 만들며 기존 사본은 owner 관리에 남긴다. metadata를 legacy로 재노출하지 않는다.
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
초대 fragment는 src/app/main.tsx보다 앞선 bootstrap 시점에 바로 history.replaceState로 제거한다. sessionStorage 제한 key의 24시간 token은 로그인 왕복 전용이며 계정 전환·로그아웃·사용·취소·만료에 지운다. analytics가 token을 읽기 전에 처리하고 no-referrer를 유지한다.
공개범위 선택과 metadata는 명시적인 preview 확인 후 저장한다. 확대 확인에는 대상·현재/다음 범위·기존 사본 수·logged-out 읽기·이미 본 자료 회수 한계를 보여 준다.
축소 busy 상태에서도 확인 badge는 이전 값을 유지한다. 실패 안내: `공개 범위를 변경하지 못했어요. 현재 공개 범위는 …예요.`
범위 확인 중 공유를 막고 같은 계정의 일시 실패에는 초안/key를 메모리에 유지한다. 다른 계정/로그아웃/닫기에는 지운다. 요청 성공/실패 모두 세대가 바뀌면 폐기한다.
공유 preview는 제목·날짜·sanitized category·확인된 audience만 표시한다. Enter/IME로 게시하지 않고 explicit 버튼만 사용한다. 미전송 문장은 Esc/뒤로/탭 변경에서 버리기 확인한다.
피드의 30초 검증·5초 deadline·35초 hard lease, 페이지 교체·새 기록 버튼·offline/hidden 가림·응원 상태·focus 복귀·불가 상태 안내는 기존 Phase 3 계약을 유지한다. 공개 화면도 동일한 권한 검증과 가림을 적용한다.

## 7. 검증과 출시

공통 벡터를 domain/memory/실 Miniflare D1에서 직접 실행한다. 범위별 owner/friend/stranger/anonymous/두 방향 block, legacy null, unavailable category, profile/account 삭제를 직접 HTTP 포함해 검증한다.
private 기본·cross-owner category binding·categoryVersion stale·idempotent lost response·SQL batch 중간 실패·범위 확대/축소·동시 게시/철회·단일 조회/validate/반응 경합을 테스트한다.
backup restore/import·private LWW·오프라인·account switch가 publication을 복원하거나 넓히지 못함을 보인다. 위조 쿠키 public fallback 금지·unauth writes 거절·원본 field whitelist·공개 pagination ties/모드/allowlist를 검증한다.
UI: 범위 확인/사본 수/실패 유지·IME/키보드/초안 버리기·전체 초대 수락 공유 응원 삭제·고립된 소셜 장애·lease·가로 스크롤·다크/강제 색/움직임 감소를 확인한다.
`pnpm check`, `pnpm build` 기존 예산, 영향 E2E와 PWA API cache 금지를 통과한다. 운영 실인증·두 사람 사용성·원격 부하/비용·정확한 배포/SW 갱신은 수행 증거 없이 통과로 기록하지 않는다.
기본 SOCIAL_MODE=off이며 [기존 출시 게이트](phase3-implementation-plan.md)를 유지한다. 구현 완료·PR 머지는 운영 활성화의 증거가 아니다.
