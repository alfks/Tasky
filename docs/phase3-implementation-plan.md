<!-- 읽기 조건: Phase 3 구현 티켓을 발행하거나 착수·릴리스·중단 여부를 판정할 때. -->

# Phase 3 구현 계획

- 상태: 설계 승인, 구현 예정. 기준 main `8e48a1bf`, 2026-09-28.
- 요구사항: [social.md](specs/social.md). 데이터/API/상한의 단일 소스: [social-design.md](social-design.md). 아키텍처 결정: [ADR-0022](decisions/ADR-0022-social-projection-and-authorization.md).
- 아래 P3 번호는 **계획용 식별자**다. 실행 시 BOARD를 확인해 새 T 번호와 정확한 파일 owns를 발행한다. 실제 티켓 발행/구현 완료를 뜻하지 않는다.

## 1. 착수와 출시의 선후관계

설계·순수 계약·로컬 구현은 바로 착수할 수 있다. 다른 사람의 데이터를 공개하는 시범 운영은 기존 로그인/개인 동기화의 실제 운영 증거를 먼저 확보해야 한다.
`/api/me`의 401·Worker 존재만으로 Google 왕복이나 두 기기 동기화가 통과한 것으로 간주하지 않는다. 배포 commit·빌드 산출물 일치도 함께 기록한다.

| 선행 항목                                              | 분류                | 필요한 증거                                                                                 |
| ------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------- |
| Google 실제 로그인 왕복·두 기기 동기화·로그아웃/재가입 | 소셜 활성화 차단    | 동일 배포 commit에서 실제 서로 다른 브라우저 세션으로 확인                                  |
| T-106 배포의 오래된 자산 위험                          | 소셜 활성화 차단    | 새 빌드 산출물과 배포 commit의 대응, 구버전 SW에서 갱신 후 일치                             |
| 기존 CI 실패 원인                                      | 배포 경로 판단      | 실행 미배정 문제면 레포 임시 예외에 따라 로컬 검사 증거; 실제 코드 실패는 해결 전 머지 금지 |
| T-101 개인 툼스톤 GC                                   | 병행 가능           | 소셜은 개인 sync seq/GC를 재사용하지 않음. 파일 owns가 겹치면 직렬화                        |
| T-102 유휴 개인 sync 쓰기                              | 성능 검증 전 재측정 | 소셜 쓰기·폴링의 추가량과 개인 baseline을 분리해 예산 내인지 검증                           |
| T-99 아웃박스 성능·T-100 가짜 서버 번들                | 병행 가능           | 소셜은 별도 온라인 포트·지연 로드. 기존 번들 검사/개인 성능 회귀가 나면 활성화 차단         |
| T-96 포커스·T-98 루틴·T-104 워크트리·T-107 번들 여유   | 필요한 범위만 선행  | 소셜 변경이 같은 파일/증상에 의존하면 티켓에서 depends_on 추가. 일괄 완료를 요구하지 않음   |

## 2. 구조와 구현 티켓

방향: `features/social → domain/social + repositories/social-repository.ts`, `infra/social`이 HTTP 포트를 구현하고 `repositories/container.ts`에서 제공한다.
`domain/social`에는 검증·상태 전이·허용 필드 DTO·공통 계약 벡터만 둔다. React/Dexie/Worker env import는 없다. Worker도 이 순수 계약을 쓴다.
`worker/social`의 actor-bound DB adapter만 raw D1에 접근하며 sid/sub/profile을 클로저에 가둔다. 기존 `worker/db`의 개인 `sub=?` 검사를 완화하지 않는다.
새 소셜 SQL 가드는 전용 경로·명시 허용 호출자·권한 벡터로 검증한다. 기존 SQL 검사에서 소셜을 몰래 제외한 채 안전하다고 주장하지 않는다.
개인 `Meta`/브랜드 쓰기 제약의 적용 대상을 소셜 서버 command와 구분하는 ADR에 맞춰 필요한 아키텍처 허용 목록을 좁게 갱신한다.

| 계획  | 범위·결과                                                     | depends_on             | 예상 owns와 배선 지점                                                                                                                                                                                                                                                                                |
| ----- | ------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P3-01 | 순수 타입·입력 검증·상태 전이·공통 권한/멱등 벡터·포트        | 설계 머지              | 새 `src/domain/social/**`, `src/repositories/social-repository.ts`, `src/repositories/social-repository.contract.ts`, `src/repositories/AGENTS.md`, 각 새 디렉토리 AGENTS                                                                                                                            |
| P3-02 | D1 migration·actor adapter·조건부 command batch·한도/GC 원형  | P3-01                  | 새 `worker/social/**`, `worker/db/migrations/0002_social.sql`, `worker/AGENTS.md`, `worker/db/AGENTS.md`, `scripts/check-worker-sql.sh`, 필요 시 좁은 가드 helper, `scripts/arch-layers.mjs`, 관련 허용목록 설정·테스트                                                                              |
| P3-03 | 인증 경계·프로필·관계/초대/차단 API·계정삭제 원자성           | P3-02                  | `worker/router.ts`, `worker/env.ts`, `worker/account/delete.ts`, `worker/account/delete.test.ts`, `worker/router.test.ts`, P3-02가 만든 social profile/relationship/command 파일(발행 시 정확 이름), `worker/auth/session.test.ts`(race 회귀), `wrangler.jsonc`(기능 모드)                           |
| P3-04 | 공유/피드/반응 API·pagination·validate·GC scheduled 배선      | P3-03                  | P3-02 social DB/handler 중 구체 파일, `worker/router.ts`, `worker/index.ts`, `worker/env.ts`, `wrangler.jsonc`(cron), API/삭제/GC 통합 테스트                                                                                                                                                        |
| P3-05 | HTTP 구현·가짜 저장소·메모리 상태·lease 검증·계정 전환 초기화 | P3-04                  | 새 `src/infra/social/**`, 새 `src/repositories/memory/social-repository.ts`·계약 테스트, `src/repositories/container.ts`, `src/features/social/**`의 store/hooks, 관련 AGENTS. `src/features/sync` lifecycle은 직접 import 대신 셸 배선에 이벤트/props로 전달                                        |
| P3-06 | 친구/공유 화면·접근성·초대 fragment·셸 진입점·원본 선택       | P3-05                  | social components·index, `src/features/shell/components/AppShell.tsx`, `ShellSidebar.tsx`, `ShellGlobals.tsx`, `ShellOverlays.tsx`, `src/features/shell/hooks/useShellShortcuts.ts`, `src/features/shell/hooks/useShellDocumentTitle.ts`, 앱 실제 진입 파일·루트 `index.html`, 관련 AGENTS·셸 테스트 |
| P3-07 | 부하·보안·실사용·PWA/E2E·기능 모드/운영 안내                  | P3-06                  | 새 `tests/e2e/social.spec.ts`·보조 fixture, `tests/e2e/sync.spec.ts` 회귀, `src/sw.ts` 계약 테스트, API 부하 harness, `docs/development.md`, `public/privacy.html`, `README.md`, `docs/FEEL_REPORT.md`, 관련 AGENTS                                                                                  |
| P3-08 | 단계적 활성화와 판정 기록                                     | P3-07 + §1 운영 게이트 | 배포 설정·릴리스 판정 기록만. 운영 실행과 실제 소유 파일을 별도 T 티켓에서 확정                                                                                                                                                                                                                      |

테이블의 새 디렉토리는 계획일 뿐 이 설계 PR에서 생성하지 않는다. P3-02부터는 선행 티켓이 만든 파일 이름을 핸드오프에서 받아 glob 대신 개별 파일로 owns를 좁힌다.
P3-02부터 P3-04까지는 router/DB 경계가 겹치므로 직렬화한다. P3-05와 P3-06은 social 디렉토리의 소유를 store와 component로 분리할 때만 병렬 가능하다.
`package.json`에 새 의존성이 필요한 경우 별도 승인/선행 티켓으로 처리한다. 현재 설계에는 새 런타임 라이브러리가 필요하지 않다.
프론트가 준비되기 전 서버는 기본 비활성이고 API 계약 테스트로 검증한다. flag를 켜기 전에도 구버전 클라이언트/기존 동기화가 계속 작동해야 한다.

## 3. 배선에서 빠뜨리지 않을 것

- 셸의 기존 reports 화면 전환 패턴에 `social` 화면을 더한다. `<main>`은 하나, 친구 화면에서 달력·날짜 패널·인사이트·투두 추가 버튼은 숨긴다.
- 탭 전환/닫기 시 focus 반환·문서 제목·건너뛰기 링크 target을 유지한다. 기존 날짜/스크롤을 별도 store에 덮어쓰지 않는다.
- `TodoRepository`의 읽기로 선택 날짜의 완료 제목을 얻어 사용자가 한 건을 선택한다. feature 간 직접 import 대신 셸의 포트/콜백으로 조립한다. source id/memo를 소셜 HTTP DTO에 넣지 않는다.
- 초대 fragment 처리는 최초 앱 bootstrap에서 즉시 실행하며 지연 로드나 Web Analytics 실행을 기다리지 않는다. 해당 실제 entry 파일은 구현 발행 전 확인한다.
- 인증 완료 전 받은 초대는 제한된 sessionStorage key 하나로 왕복, 로그인 전 화면에는 별명/게시물을 노출하지 않는다. 계정 변경에서 clear 순서를 테스트한다.
- 개인 sync의 logout·401·410·account-switched를 셸이 소셜 세션 무효화로 전달한다. 인증 상태가 바뀐 뒤 도착한 요청 응답은 generation 불일치로 폐기한다.
- 등록된 개인 투두 단축키를 social 화면에서 suspend한다. 입력 중 Esc/IME·전역 command palette와의 충돌을 검증한다.
- API는 갱신된 세션 쿠키도 전달하고 모든 오류에 no-store를 적용한다. feature disabled 응답에도 동일하게 적용한다.

## 4. 검증 매트릭스

| 층                | 필수 사례                                                                                                                              | 통과 기준                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 도메인/포트       | R1부터 R16까지 규칙을 테스트 이름에 연결; text whitelist·state·CAS·멱등 요청                                                           | 공통 벡터가 메모리 구현과 Worker에서 같은 결과                |
| 실제 Miniflare D1 | migration up·FK·index·SQL statement 실패 주입·배치 중간 실패                                                                           | 부분 관계·부분 삭제·독립 receipt가 남지 않음                  |
| 동시성            | 초대 동시 소비, 양방향 요청, 수락/취소, 수락/차단, 차단해제/재차단, 게시/삭제, 반응/친구삭제                                           | 가능한 두 직렬 순서와 같고 최종 ACL에 어긋난 접근 0           |
| 계정 경계         | 3계정으로 타인 id·sub·owner 위조, raw API 우회, inactive profile·old sid                                                               | 개인 본문·초대 원문·타인 요청/차단 목록 유출 0                |
| 삭제/재가입       | 계정삭제와 feed/write race, 같은 sub 새 profile, 옛 key·sid 재전송                                                                     | 기존 소셜 관계/글 복원 0, 타기기 410/401 기존 계약 유지       |
| 재시도            | 응답 소실·key 충돌·48시간 GC 후 옛 key·새 key·시계 skew                                                                                | 중복 공유/반응/요청 0, 불명 상태가 성공처럼 표시되지 않음     |
| 페이지/철회       | 동일 ms 게시, 51개 이상 기록의 페이지 교체·이전 재조회, 페이지 사이 삭제/친구 추가/차단, 화면 밖 카드 철회·스크롤 재진입, stale cursor | 중복 카드 0, 권한 없는 새 읽기 0, cursor 위조/다른 actor 거절 |
| 캐시/라이프사이클 | offline·visibility·focus·401·410·계정변경·다른 탭 로그아웃                                                                             | 공유 내용 숨김, stale response 재표시 0, 영속 저장 원문 0     |
| PWA/업데이트      | 이전 SW 제어하의 업데이트·초대 링크·online/offline                                                                                     | 정적 셸 복귀, 공유 API 캐시 0, token query/로그 유출 0        |
| 회귀              | 개인 CRUD·routine·diary·backup·timer·sync·reports                                                                                      | 기존 계약/필수 검사가 모두 통과                               |

권한 시험은 UI 클릭만으로 끝내지 않고 직접 HTTP 요청을 포함한다. 스텁 로그인 테스트는 기능 자동 검증이고 실제 Google 왕복의 대체 증거가 아니다.
원격 D1에서는 별도의 시범 계정과 disposable 데이터를 사용해 schema/index·반복 경합·한도/GC·삭제 비용을 측정한다. 프로덕션 개인 데이터를 부하 fixture로 쓰지 않는다.

## 5. 사용성·접근성 게이트

서로 다른 두 사람이 데스크탑과 좁은 화면에서 설명 없이 초대/수락/게시/응원/철회/차단해제를 수행한다. 이는 작은 내부 검증이며 일반 사용자 성공률 통계로 발표하지 않는다.
검증자는 미리보기만 읽고 다음 세 가지를 정확히 설명할 수 있어야 한다: 공개되는 필드, 앞으로 추가할 친구의 접근, 원본 삭제와 공유 삭제의 차이. 한 명이라도 오해하면 문구/동선을 수정하고 해당 흐름을 다시 검증한다.
모바일은 360·390 CSS px, 데스크탑은 1280px 이상과 기존 1024px 전환 경계, 브라우저 확대 200%에서 가로 스크롤·잘린 버튼 없이 완료한다.
키보드로 전체 흐름·Esc·dialog focus trap/복귀·삭제 후 다음/이전/제목 이동을 확인한다. 적어도 한 데스크탑 스크린리더로 오류·응원 상태·새 글 알림을 확인한다.
자동 axe critical/serious 0, 강제 색·dark·reduced-motion을 함께 확인한다. 단순 캡처가 아니라 처리중/실패/오프라인/상한/권한회수 상태를 검증한다.
실패 기록에는 browser/OS·뷰포트·commit·단계·기대/실제·수정 후 재현 여부를 포함한다. 사용자의 별명·게시문·초대 링크는 캡처에서 익명화한다.

## 6. 성능·비용 예산

아래는 플랫폼 보장이나 기존 실측이 아닌 **출시 판정을 위한 초기 목표**다. 측정 조건과 실제 값은 P3-07에서 별도 기록한다.

| 항목           | 게이트                                                                         | 측정 방법                                                                                              |
| -------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 첫 로드 번들   | 기존 `check-dist.mjs` 예산 유지                                                | `pnpm build`의 진입 폐포/네트워크 합/프리캐시 및 delta. social static import 유입 시 실패              |
| 피드 지연      | 20개 첫 페이지 p95 ≤ 1.5초, 오류율 < 1%                                        | 대상 지역에서 원격 Worker HTTP 전체 왕복, 동시 활성 20계정·각 50친구·작성자당 1,000글 fixture, 5분×3회 |
| 일반 쓰기      | p95 ≤ 1.5초, 오류율 < 1%                                                       | 동일 환경, 429 의도 초과 시험은 따로 보고                                                              |
| 철회 반영      | 서버 완료 후 새 DB 읽기 유출 0, 열린 온라인 화면은 30초 검증 주기+한 요청 이내 | 양 기기 로그의 request/commit/화면 시점. offline/hidden은 즉시 가림                                    |
| DB 비용        | 피드 페이지 rows_read ≤ 5,000 목표, 읽기 본문 쿼리 rows_written=0              | D1 meta와 query plan. rate-limit 별도 쓰기 최대 1회/요청은 분리 집계                                   |
| 최악 계정 삭제 | D1/Worker 제한 내 완료, 부분 삭제 0                                            | 1,000글·최대 친구/반응·차단 fixture로 3회, 실패면 활성화 차단하고 분할삭제 ADR 검토                    |
| 유지 비용      | 전체 예상 월 비용을 운영자가 수용                                              | 실제 요청수×D1 메타, GC·limit·session refresh 포함. 결제 플랜의 최신 가격/상한을 측정 시 확인          |

무제한 트래픽이나 전세계 지연을 보장하지 않는다. 위 20계정 시험은 제한된 시범의 최소 부하 표본이며 정식 확장의 근거로 자동 승격하지 않는다.
친구 화면이 닫혀 있으면 소셜 polling 0. 한 페이지 최대 50개만 보존하므로 validate 한 요청으로 화면 밖 카드까지 확인한다. 페이지 전환은 추가 GET 1회와 limiter 쓰기 1회이며 이전 페이지도 같다. 기본 활성 탭은 30초마다 validate 1회+feed 1회이므로 분당 최대 4회 limiter 쓰기(여러 탭은 탭 수만큼)를 추가한다. 1시간 사용은 240회/계정, 20계정은 4,800회이며 개인 sync/session refresh·추가 페이지·사용자 쓰기·GC 비용을 별도로 더한다. 탭 종료/hidden에서는 0이고 과도한 비용이면 polling 통합/간격을 재검토한다. 보이는 화면에서만 validate 30초, 새 글 확인은 기존 첫 페이지 요청을 공유하며 중복 타이머를 만들지 않는다.
예산 실패를 상한 상향으로 덮지 않는다. query plan·fan-in·반응 집계·버퍼링을 먼저 점검하고 축소 범위/예산 변경의 근거를 ADR/스펙에 기록한다.

## 7. 기능 모드·배포·롤백

서버 `SOCIAL_MODE=off|read-only|enabled`, 기본 `off`. 클라이언트는 `/api/social/me`의 서버 모드를 읽고 사용자별 시범 allowlist도 서버에서 매번 확인한다.
`enabled`: 전체 기능. `read-only`: 새 프로필·초대·요청·수락·게시·응원 추가는 503, 허용된 읽기와 응원 취소·공유 삭제·요청 취소/거절·친구 삭제·차단/해제·계정 삭제는 가능.
`off`: 공유 피드/타인 콘텐츠/생성 쓰기는 503. 자기 관리 목록(내 공유·관계·차단·초대)과 위 철회 동작·계정 삭제는 가능하므로 사용자가 정리할 수 있다. 관리 목록은 자신의 대상 식별에 필요한 최소 정보만 반환한다.
긴급 정보 유출 시에는 엣지에서 `/api/social/*`를 전부 차단할 수 있다. 이때 기존 `/api/account/delete`는 계속 제공하고 운영자가 복구/삭제 문의를 처리한다.
모드 변경은 열려 있는 화면의 다음 validate에서 반영하며 disabled 응답을 받으면 공유 메모리를 지운다. 모드가 꺼졌는데 생성 API가 동작하는 경우는 출시 Blocker다.

순서: ① 비활성 서버·추가 migration 배포 ② 데이터 정리/롤백 가능 확인 ③ 클라이언트 배포 ④ 이전 SW에서 갱신 확인 ⑤ 내부 두 계정 ⑥ allowlist 소규모 시범.
각 단계에 commit·migration 번호·빌드 산출물·실제 mode·검증 결과·실행자를 기록한다. 더 넓은 활성화는 앞 단계의 게이트를 모두 통과한 뒤에 한다.
되돌릴 때 먼저 read-only 또는 off로 전환한다. D1 additive migration을 down/drop하지 않고 새 테이블을 보존한다.
**계정 삭제에 소셜 정리를 포함하지 않는 옛 Worker로 롤백하지 않는다.** 개인 서버와 클라이언트가 호환되더라도 삭제 계약이 깨진다. P3-03 이후의 최소 안전 서버 또는 forward fix를 사용한다.
오래된 프론트가 새 공유를 요청해도 서버 모드/권한에서 거절한다. 동기화 API와 개인 캐시는 소셜 flag와 독립이므로 업무 기록은 계속 사용할 수 있다.

## 8. 완료 판정과 남겨야 할 증거

머지 게이트: 티켓 owns 일치, 문서/금지어/author/아키텍처 검사, `pnpm check`, `pnpm build`, 영향받은 E2E, 필요한 페르소나 리뷰를 통과한다. 기존 CI 임시 예외를 쓰면 러너 미배정 증거와 로컬 결과를 PR에 적는다.
출시 게이트: §1 실운영 인증·배포 일치, §4 계정/권한/경합/캐시, §5 사용성, §6 성능/비용, §7 삭제 가능한 비활성/롤백을 모두 확인한다. UNVERIFIED는 통과가 아니다.
기본 범위/사본 공개/관계/차단/오프라인 정책은 이 문서 묶음에서 결정했다. 구현 중 SQL이나 UX가 이를 만족하지 못하면 스펙 변경 PR을 먼저 내고 임의로 축소하지 않는다.
공개 모집은 신고/중재·개인정보 안내·운영 담당·규모별 비용 검증이 완료될 때까지 차단한다. 시범 운영 성공만으로 전체 공개 SNS를 제공했다고 쓰지 않는다.
최종 핸드오프에는 테스트 수보다 **무엇을 어디서 검증했는지**, 실패/미검증, 배포 commit, 실제 flag 상태를 남긴다.
