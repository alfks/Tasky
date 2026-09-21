<!-- 읽기 조건: worker/**(구글 OAuth·세션 쿠키·D1 스키마·`/api/sync`·계정 삭제)를 만지기 전.
동기화 판정 축은 ADR-0005·ADR-0015 §2, 로컬 스키마·포트는 ADR-0018 — 이 문서는 서버(D1) 쪽만 다룬다. -->

# ADR-0019: Cloudflare Worker + D1 — 인증·세션·계정 삭제 타이밍

- 상태: accepted
- 날짜: 2026-09-21
- 관련: 티켓 T-93, ADR-0005(충돌 정책) · ADR-0015(§1 sub·§2 LWW·§4 상태 표시) · ADR-0018(로컬 포트),
  docs/specs/sync.md §4·§6, SYNC_DESIGN.md §②

## 맥락

T-92 가 로컬 포트(`SyncRepository`)와 메모리 가짜 서버를 열었다. Worker 는 그 가짜 서버가 흉내 낸
계약(구글 OAuth·세션 쿠키·D1·`/api/sync`)을 실제로 구현한다. **판정 로직은 새로 적지 않는다** —
`src/domain/sync/**`(`applyServerRules`·`readRemoteRow`·와이어 타입)를 Worker 가 그대로 import 한다.
스펙(sync.md §6, 2026-09-21 보강)이 제품 동작으로 고정한 것: 계정 삭제 시 다른 기기는 조용히
로그아웃되지 않고 "계정이 삭제되었습니다" 안내 뒤 R7("내보내고 지우기")을 탄다 — 정확한 엔드포인트·
응답 코드·세션 정리 시점은 이 ADR이 정한다.

## 결정

1. **D1 스키마(`worker/db/migrations/0001_init.sql`)는 `users`·`sessions`·`devices`·`entities`·
   `deleted_users` 다섯 테이블로 한 번에 연다.** `entities.updated_at TEXT NOT NULL` 을 body 밖
   컬럼으로 둔다 — LWW 판정(`applyServerRules`)이 SQL 의 `WHERE entities.updated_at <= excluded.
updated_at` 과 정확히 같은 비교를 해야 하고, `body` JSON 안에 묻어 있으면 그 비교를 SQL 이
   직접 할 수 없다.
2. **`sessions.sub` 에는 `REFERENCES users(sub) ON DELETE CASCADE` 를 걸지 않는다.** `devices`·
   `entities` 는 건다(정상 케이스에서 계정 삭제 때 같이 비워져야 하므로). 이 비대칭이 §3 의 핵심.
3. **계정 삭제 순서(`worker/account/delete.ts`)**: ① `deleted_users(sub, deleted_at)` 먼저 기록
   ② `entities`·`devices` 를 **명시 DELETE**(CASCADE 에 기대지 않는다 — 아래 §확인한 것) ③ `users`
   행 삭제 ④ **요청을 보낸 기기 자신의 `sessions` 행만** 지운다. **다른 기기의 `sessions` 행은
   이 시점에 건드리지 않는다.**
4. **세션 검증(`worker/auth/session.ts#requireSession`)이 매 요청마다 `deleted_users` 를 본다**:
   서명 확인 → `sessions` 조회로 `sub` 를 얻음 → `sub` 가 `deleted_users` 에 있으면 **410 +
   `{ error: 'account-deleted' }`** 를 돌려주고 **그 자리에서** 그 `sessions` 행을 지운다(지연
   정리). 그 전까지 평범한 401 과 구분되지 않던 것이 이제 구분된다 — §3 의 비대칭이 있어야
   다른 기기가 이 시점까지 `sub` 를 여전히 알아낼 수 있다.
5. **재로그인(같은 sub, OAuth 콜백)은 `deleted_users` 기록을 지운다.** 계정을 삭제한 본인이 같은
   구글 계정으로 다시 가입하는 것은 정상적인 "새 계정 만들기" 다 — 영구히 막지 않는다. "다른 기기가
   말없이 데이터를 되살리는" 위험은 이 경로에서 나지 않는다: 되살아나려면 그 다른 기기가 자기
   **세션**으로 `/api/sync` 를 불러야 하는데, 그 세션은 ④에서 이미 410 을 받고 지워졌을 것이다
   (재로그인이 먼저 오면 §④ 는 아직 안 그랬어도, 그 다른 기기가 로그인 화면으로 넘어가는 순간
   `syncState` 가 지워지고 새 로그인이 필요해 자동 부활이 아니라 사용자가 다시 선택하는 R7/R1
   경로를 탄다).

## 대안과 기각 이유

| 대안                                                                                                                 | 기각 이유                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) `sessions` 도 `users` 와 함께 즉시 CASCADE 삭제                                                                  | 다른 기기의 다음 요청이 `sid` 로 `sessions` 를 못 찾아 **`sub` 자체를 알 수 없는 평범한 401** 이 된다 — `deleted_users` 조회를 할 대상(sub)이 없어 §4 가 성립하지 않는다. sync.md §6 이 명시적으로 기각한 대안이기도 하다 |
| (b) `sessions.sub` 도 `entities`/`devices` 처럼 CASCADE 유지 + 삭제 핸들러가 자기 세션만 먼저 지우고 CASCADE 를 기대 | D1 의 `PRAGMA foreign_keys` 가 켜져 있으면(§확인한 것) `users` 삭제 시 **다른 기기의 sessions 행까지 한꺼번에** 지워져 (a)와 같은 문제가 재발한다. FK 를 아예 안 거는 편이 의도를 SQL 스키마로 직접 표현한다              |
| (c) 계정 삭제 시 다른 기기로 실시간 알림(WebSocket 등)                                                               | ADR-0015 가 실시간 푸시 자체를 범위 밖으로 뺐다(§재검토 트리거 조건부). 폴링 주기 안에 자연히 알게 되는 것으로 충분하다                                                                                                   |

## 결과

- 좋은 점: 다른 기기는 평범한 세션 만료(401)와 계정 삭제(410)를 구분해 받아 "말없이 버리지 않는다"
  (ADR-0015 §5)를 지킨다. 판정 로직이 새로 생기지 않는다(`applyServerRules` 재사용) — 세 계층
  (도메인 단위 테스트·메모리 가짜 서버·이 Worker)이 `server-rules.vectors.ts` 를 같이 돈다.
- 감수하는 점: 다른 기기의 `sessions` 행은 계정 삭제 직후부터 그 기기가 다음 요청을 보낼 때까지
  "이미 삭제된 계정을 가리키는 좀비 행"으로 남는다(최대 몇 초, 폴링 주기). 정리를 지연시키는
  대가로 §4 의 구분이 성립한다 — 트레이드오프를 의도적으로 선택했다.
- 감수하는 점: `entities`/`devices` 삭제는 D1 의 `PRAGMA foreign_keys` 값과 무관하게 **항상
  명시 DELETE** 로 한다(CASCADE 를 신뢰하지 않는다) — 배포 환경의 실제 값이 로컬(Miniflare, 이
  PR 에서 확인: 기본 켜짐)과 다를 가능성에 대비한 이중 안전장치라 코드가 한 줄 늘지만, 결과가
  D1 설정에 좌우되지 않는다.

## 지켜야 할 규칙 (검증 가능한 문장 — 리뷰 판정 근거)

1. `worker/db/migrations/0001_init.sql` 은 나간 뒤 고치지 않는다 — 스키마 변경은 `0002_*.sql` 이후.
2. `worker/db/**` 의 모든 SQL 문(`sub = ?` 를 요구하는 WHERE 절)은 `check-worker-sql.sh` 가 강제한다.
3. `requireSession` 이 401 을 돌려주기 **전에** 서명 검증을 반드시 거친다(D1 조회보다 먼저) — 위조
   쿠키로 D1 을 두드리지 않는다.
4. 계정 삭제 핸들러는 §결정 3 의 순서를 바꾸지 않는다(리뷰 체크: `deleted_users` INSERT 가 다른
   테이블 DELETE 보다 먼저 온다).
5. `AUTH_STUB` 스텁 로그인은 `env.AUTH_STUB === '1'` **그리고** 호스트가 localhost/127.0.0.1 일 때만.

## 확인한 것 / 미확인 (부록. 이 PR 에서 실행으로 검증한 범위)

- **확인**: `getPlatformProxy({ persist: { path } })` 로 로컬 D1(Miniflare 백엔드)을 여러 임시
  디렉토리로 격리해 띄울 수 있다. `D1Database.exec`·`.prepare().bind().run()`·`RETURNING` 절 전부
  동작한다. 이 로컬 D1 에서 `PRAGMA foreign_keys` 는 **기본값 1(켜짐)** 이었다(직접 조회로 확인) —
  `entities`/`devices` 의 `ON DELETE CASCADE` 가 실제로 발동해 `users` 삭제만으로 함께 비워지는
  것을 확인했다. `sessions.sub` 에는 애초에 FK 가 없어 CASCADE 대상이 아니다(설계대로).
- **확인**: `ON CONFLICT … DO NOTHING`/`DO UPDATE … WHERE` 두 SQL 형태가 `applyServerRules` 의
  판정(`insert`/`update`/`reject-exists`/`reject-stale`)과 정확히 같은 결과를 낸다 —
  `worker/sync/apply.test.ts` 가 `SERVER_RULE_VECTORS` 전체를 이 D1 위에서 돌려 확인한다.
- **미확인**: 실제 배포된(Cloudflare 엣지) D1 의 `PRAGMA foreign_keys` 기본값. 로컬 Miniflare 와
  다를 가능성에 대비해 §결과의 "감수하는 점"대로 명시 DELETE 로 이미 방어했으므로, 다르더라도
  동작은 같다 — 확인이 필요한 것은 안전장치가 실제로 발동하는지가 아니라(그건 D1 설정과 무관하게
  항상 발동한다) 성능·이중 삭제 시 에러 여부 정도이며 기능적 위험은 없다.
- **미확인(이 세션에서 확인 불가)**: 구글 OAuth 실제 왕복, 실제 Cloudflare 배포·시크릿 발급.
  자격증명은 사용자 로컬에만 있다(`SYNC_CREDENTIALS_GUIDE.md`).

## 재검토 트리거

- 실 배포 D1 에서 `PRAGMA foreign_keys` 가 꺼져 있는 것으로 확인되고, 그 상태에서 명시 DELETE 가
  아닌 다른 이유로 격리 계약 테스트가 실패하면(이 ADR 의 전제가 틀렸다는 뜻이므로) 재검토.
- "모든 기기에서 로그아웃" 기능이 스펙 범위에 들어오면(현재는 범위 밖) §결정 3·4 가 세션 정리
  시점을 다시 설계해야 할 수 있다.
