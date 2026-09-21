# 동기화(sync.md) 구현 설계 — 아키텍트 산출물

<!-- 읽기 조건: src/domain/sync/**·worker/** 구현 전, 또는 그 코드의 § 인용을 따라갈 때. -->

> **이 문서와 ADR·스펙의 관계**: 결정(무엇을 왜)은 **ADR-0015**(신원·권위·충돌 정책의 축)와
> **ADR-0005**(`Meta`·LWW 정책 원안)가 갖고, 화면 규칙은 **`docs/specs/sync.md`**가 갖는다. 이
> 문서는 그 결정을 **코드로 옮기는 구현 설계**(자료구조·SQL·티켓 분해)일 뿐이다. **충돌하면
> ADR 이 이긴다**(CLAUDE.md §7.9) — 이 문서가 ADR 을 뒤집을 수 없다. 최초 작성 시점
> (2026-09-20, `origin/main` `5af72c1`) 이후 **ADR-0015 가 2026-09-21 자로 §2·§5 를 정정**했고,
> 이 문서의 §0-5·①-1·①-5·②-2·②-3·T-91 이 그 정정과 어긋나 있었다 — 아래 각 절에 **"정정
> (2026-09-21)"** 표로 고쳤다(무엇을 왜 고쳤는지 한 줄씩). **§ 번호는 코드(`src/domain/sync/**`10개 파일, PR #114)가 그대로 인용하므로 바꾸지 않았다** — 절 안의 내용만 고쳤다.`src/domain/sync/outbox.ts`(T-91, `.worktrees/sync-domain`)는 이 문서 §②-3·③-4 의 상수를
> **그대로 구현**했다(`QUARANTINE_AFTER_CONSECUTIVE_INVALID = 3`, 배치 상한 500) — 값은
> `docs/specs/sync.md` §8 에도 올렸다(아래 참고).

- 기준 커밋: `origin/main` `5af72c1`(#108 백업 v3 확장까지). **로컬 체크아웃(`3aed4c0`)은 12 커밋 뒤라 이 문서는 전부 `origin/main` 을 읽고 썼다** — 구현 착수 전 `git pull` 먼저.
- 입력: `docs/specs/sync.md`(approved) · ADR-0015(DO 정정 #98 반영) · ADR-0017 §재검토(S5) · `plan-import.ts` · `meta.ts` · `validate-rows.ts` · `repositories/**` · `infra/indexeddb/**` · `wrangler.jsonc` · `scripts/deploy.sh` · `deploy.yml` · `SYNC_CREDENTIALS_GUIDE.md` · `SYNC_CONFIG_VALUES.md`.
- 확정값은 그대로 반영했다: `GOOGLE_CLIENT_ID`(vars 커밋) · `D1_DATABASE_ID=b5bcb45e-…` · `/auth/callback` · `wrangler dev` 8787 · 스코프 `openid email` · 바인딩 `DB`/DB명 `tasky` · `SESSION_SECRET` · `.env`+`.dev.vars` 병행. 시크릿 2개는 이 세션에 없다 → **자격증명 없이 도는 검증 범위를 티켓마다 적었다(④)**.

## 0. 결론 요약 (열 줄)

1. **정상 상태 동기화는 `planMerge` 를 재사용하지 않는다.** 백업 병합은 `updatedAt`(기기 시계) 축이고 동기화는 **서버 순번 `seq`** 축이다 — 축이 다르면 함수도 다르다. 단 **첫 로그인 "올리기"(R7) 한 번은 `planImport('merge')` 를 그대로 쓴다**(그때는 `seq` 가 없어 `updatedAt` 밖에 근거가 없다). 공유 부채: `planMerge` 의 알려진 한계(diary date 유일성)가 그 한 번에 그대로 들어온다.
2. **ADR-0015 의 "서버가 발급한 `rev`" 는 ADR-0005 의 `rev`(클라이언트 `touch` +1, 계약 테스트 7곳이 `rev+1` 단언)와 충돌한다.** `Meta.rev` 는 손대지 않고 **서버 순번은 별도 `seq`** 로 둔다(로우 밖, 커서 하나). ⑥-1.
3. **S5 는 오진이다.** 중지된 루틴이 재개까지의 구간을 "채웠어야 했다" 는 전제가 routine R7("소급 없음")과 반대다 — 그 공백은 손실이 아니라 스펙이다. 동기화에서 진짜 위험은 반대편 **중복 생성**(두 기기가 같은 구간을 갈라진 채 채움)과 **배경 채우기가 사용자 조작(중지)을 LWW 로 덮는 것**이다.
4. 그래서 (a)를 택한다 — **워터마크를 LWW 대상에서 뺀다**: 루틴 인스턴스 id 를 `(routineId, date)` 의 **결정적 슬롯 id** 로 만들고(원장 = `todos` 테이블 자체), 루틴 로우의 필드는 **사용자 조작으로만** 바뀌는 `fillFloor` 로 재정의한다. 채우기는 루틴 로우를 더 이상 `touch` 하지 않는다. 대가: IDB v4 `.upgrade()` 로 필드 이름 변환 1회 + 백업 v3→v4 변환 1스텝 + `existingIds`(툼스톤 포함 존재 확인) 조회 하나.
5. 서버 규칙 두 줄: **갱신은 `updatedAt` 큰 쪽이 이긴다**(동률이면 도착 순, 서버가 미래 시각을 수신 시각으로 클램프 — ADR-0005 그대로, sync R4), **생성은 없을 때만 들어간다**(insert-if-absent, 있으면 그 로우만 거절 → 클라이언트가 서버 것을 받아들인다). 이 둘째 줄이 슬롯 id 중복·부활·"오프라인 기기의 rev-1 사본이 완료 상태를 덮는" 세 가지를 한꺼번에 막는다. **정정(2026-09-21)**: 이전 판은 "갱신은 나중 도착이 이긴다"(순수 도착 순)라고 적어 ADR-0015 §2 의 2026-09-21 정정(ADR-0005 의 `updatedAt` LWW 를 supersede 하지 않는다로 되돌림 — 오프라인 뒤 늦게 올라온 변경이 그사이 다른 기기의 최신 편집을 덮는 문제)을 뒤집고 있었다. `seq` 는 판정 축이 아니라 델타 풀 커서 + `updatedAt` 동률 타이브레이크로만 쓴다(②-2 가 구체값).
6. 변경 감지는 `updatedAt` 비교가 아니라 **아웃박스**(`syncOutbox`, 같은 IDB 트랜잭션)다. `query.ts` 의 `put`/`bulkPut` 한 곳에서 넣는다 — "필터를 빼먹을 수 있는 경로가 하나뿐" 인 기존 구조를 그대로 재사용. `plan-import.ts:161-165` 의 "워터마크만 바꾸면 전파 안 됨" 문제는 이 구조에서 **성립하지 않는다**(무엇이 바뀌었든 `put` 이면 큐에 들어간다).
7. 서버: Worker 1개 + D1 4테이블(`users`·`sessions`·`devices`·`entities`). `entities` 는 **JSON body 한 컬럼**(7개 IDB 테이블 → `tbl` 값) + `(sub, seq)` 유일 인덱스. 로우 검증은 **`validate-rows.ts` 의 `readTodo`… 를 Worker 가 그대로 import** 한다(도메인은 외부 의존 0 이라 Worker 번들에 들어간다).
8. 격리: **핸들러는 `user_id` 를 받을 수 없다** — `forUser(sub)` 로 만든 `UserDb` 객체만 받고, 그 안의 모든 SQL 이 `sub = ?` 를 바인딩한다. 두 사용자 D1 계약 테스트 + `worker/db/**` 의 SQL 문자열 전수 grep 으로 고정.
9. 클라이언트: 기존 8개 저장소 인터페이스는 **한 글자도 안 바뀐다.** 새 포트 둘(`SyncRepository` 로컬 큐/커서/적용, `SyncTransport` 원격 왕복)을 `Repositories` 컨테이너에 더하고, 엔진은 `features/sync/store` 에, 조립은 `app/providers.tsx` 에. 가짜 `SyncTransport`(메모리)는 **Worker 와 같은 순수 함수 `applyServerRules`** 를 돌린다 — 가짜가 항상 성공하는 종류의 거짓 초록불을 구조로 막는다.
10. 타이밍: 앞으로 나올 때·온라인 복귀 즉시(2 s 디바운스), 보이는 동안 **30 s**, 로컬 쓰기 후 **1.5 s** 코얼레싱 푸시. 근거 수치는 ③-3.

---

## ① 병합 전략

### ①-1. `planMerge` 재사용 여부 — 정상 상태는 별도, 첫 업로드는 재사용

| 경로                        | 비교 축                                               | 함수                                                                | 이유                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 첫 로그인 "올리기"(R7, 1회) | `updatedAt`                                           | **`planImport({mode:'merge', local, document: 서버 전량})` 그대로** | 서버 `seq` 가 아직 없다. 로컬(로그인 전)과 서버(다른 기기가 먼저 올린 것)는 백업 병합과 **정확히 같은 모양의 문제**다. 스펙 R7 도 이렇게 적었다.                                                                                                                                                                                                                                                                                                                                                      |
| 정상 상태 델타(매 사이클)   | `updatedAt`(ADR-0005 LWW) + 아웃박스(변경 **감지**용) | 신규 `src/domain/sync/client-merge.ts`                              | ADR-0005 의 충돌 정책 그대로, ADR-0015 §2 가 2026-09-21 정정으로 확인했다. `updatedAt` 이 기기 시계라는 위험(시계가 5분 빠른 폰이 이길 수 있음)은 알려진 감수 사항이지 이번에 새로 여는 문제가 아니다 — 반대로 도착 순 단독은 "오프라인 기기가 뒤늦게 올려 최신 편집을 덮는" 더 나쁜 실패를 만들어 ADR 이 명시적으로 기각했다. **정정(2026-09-21)**: 이전 판은 이 칸을 "서버 `seq`" 라고만 적어 판정 축을 도착 순으로 바꿔 놓았다 — `seq` 는 델타 풀 커서와 `updatedAt` 동률 타이브레이크로 축소한다. |

**대가를 숨기지 않는다**

- 재사용 쪽(첫 업로드): `planMerge` 의 알려진 한계 — diary `date` 유일성을 못 지킨다(`plan-import.ts:252-261`, 테스트 "알려진 한계") — 가 첫 업로드에 그대로 들어온다. 발생 조건은 "다른 기기가 먼저 같은 날짜 기록을 지우고 새로 쓴 뒤 이 기기가 옛 기록을 올림". 그 뒤 정상 동기화에서 두 로우가 둘 다 살아 `getByDate` 가 하나만 고른다. **이번에 고치지 않는다**(같은 결정, 후속).
- 별도 쪽(델타): "같은 문제를 두 번 푼다" 는 비판이 맞다. 그래서 공유 가능한 부분은 공유한다 — **로우 검증(`validate-rows.ts` readers)·`adopt`·툼스톤 판정(`isTombstone`)** 은 둘 다 같은 함수를 쓴다. 갈라지는 것은 "누가 이기나" 한 줄뿐이고, 그 한 줄은 서로 다른 것이 맞다.

### ①-2. S5 결정 — (a) 워터마크를 LWW 에서 빼고 `todos` 를 원장으로

**먼저 S5 를 다시 읽는다.** `plan-import.test.ts:250-280`: 로컬은 `active:false`(중지) 상태로 1/22 에 멈춰 있고, 파일이 3/1 에 재개했다. 테스트는 "로컬이 원래 채웠어야 할 1/29~~2/26 다섯 목요일이 영구히 사라진다" 고 단언한다. **그런데 로컬은 중지돼 있었다.** routine R7: "재개하면 … 멈춰 있던 구간을 소급해서 채우지 않는다(지금부터)". 두 사본이 갈라지기 전에 이미 중지됐다면(재개가 있으려면 중지가 먼저다) 1/29~~2/26 은 **어느 기기에서도 채워지면 안 되는 구간**이고, 병합 결과 2/28 은 정확히 R7 이다. S5 가 보여주는 것은 손실이 아니라 스펙이다. `planMergeRoutines` 의 max 규칙도, 그 함수를 정당화하는 긴 주석도 이 오진 위에 서 있다.

그러면 동기화에서 워터마크의 **진짜** 실패는 무엇인가. 두 기기가 상시 갈라지는 조건에서 실측 가능한 것 세 가지:

| #   | 시나리오                                                                                                                  | 현재 구조(워터마크 = 로우 필드, 채우기가 `touch`) 결과                                                                 | 성질                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| F1  | A 온라인·B 오프라인, 둘 다 2월을 방문                                                                                     | 같은 슬롯에 id 가 다른 투두 2벌. 둘 다 서버로 올라간다                                                                 | **중복, 영구, 눈에 보임**. 사용자가 손으로 지워야 함 |
| F2  | A 에서 사용자가 **중지**(2/1). B 는 오프라인에서 배경 채우기로 2/10 까지 전진(`touch` → updatedAt 갱신). B 가 나중에 푸시 | B 로우가 이기고 `active:true` 로 돌아온다 — **배경 작업이 사용자 조작을 덮는다**                                       | 조용함, 사용자가 원인을 알 수 없음                   |
| F3  | A 가 2/10 까지 채움. B 는 1/22 워터마크로 제목만 고침(updatedAt 갱신). B 가 나중에 푸시                                   | 워터마크가 1/22 로 **후퇴**. 다음 채우기는 (날짜·카테고리·정규화 제목) 대조에서 제목이 달라 "없음" → 1/29·2/5 **중복** | F1 과 같은 결과를 사용자 편집 한 번으로 만든다       |

세 가지의 공통 근인: **"어디까지 만들었나" 를 루틴 로우 안의 값으로 들고, 그 값이 배경 작업으로 바뀌며, 로우 단위 LWW 를 탄다.** 값을 max 로 합치든 min 으로 합치든 F2 는 남고(active 필드가 LWW), F1 은 max/min 과 무관하다(투두 로우가 2벌).

**결정 (a): 원장을 `todos` 테이블 자체로 옮긴다.**

1. **결정적 슬롯 id.** 루틴 인스턴스의 `Todo.id` 를 `slotId(routineId, date)` 로 만든다 — UUID v4 **모양**(버전 니블 4, 변형 8~b)을 갖는 128비트 해시라 `adopt()` 의 `UUID_V4_PATTERN` 을 그대로 통과한다. 도메인은 `crypto` 를 못 부르므로(ADR-0005 규칙 2) `src/lib/hash.ts` 에 **순수 산술 해시**(외부 의존·전역 0, ~40줄)를 두고 도메인이 import 한다(`domain → lib` 허용). 두 기기가 같은 슬롯을 만들면 **같은 id** 다.
2. **채우기 판정 = "그 id 의 로우가 있는가(툼스톤 포함)".** `planRoutineFill` 은 `(from, through]` 의 후보 날짜마다 슬롯 id 를 계산하고, 호출부가 넘긴 `existing: ReadonlySet<TodoId>`(툼스톤 포함 존재 집합)에 있으면 건너뛴다. ADR-0017 이 기각한 "조회로 판정" 과 다른 점은 딱 하나 — **툼스톤을 본다**(그래서 삭제 뒤 부활 ①·이동 뒤 재생성 ② 이 안 난다: 이동해도 로우는 그 id 로 존재한다). 툼스톤 포함 조회는 새 포트 `SyncRepository.existingIds('todos', ids)` 다(ADR-0009 규칙 4 "readAll 넷째 호출처" 를 만들지 않고, ARCHITECTURE §5 가 예약한 "툼스톤을 읽는 별도 인터페이스" 자리를 쓴다).
3. **루틴 로우의 필드는 `fillFloor`(사용자 조작으로만 바뀌는 하한)로 재정의.** `createRoutine` → `startDate` 전날, `resumeRoutine` → `max(기존, today 전날)`(지금 코드 그대로), **채우기는 이 값을 바꾸지 않는다.** 그러면 루틴 로우는 사용자 조작(생성·편집·중지·재개·삭제)에만 `touch` 되고, 로우 단위 LWW(sync R4)가 "사용자 조작끼리의 충돌" 이라는 스펙이 의도한 의미로 돌아온다 → F2 소멸.
4. **기기별 진행 커서는 메모리(스토어 상태)만.** `todo-routine-fill.ts` 의 `lastHandled` 캐시가 이미 이 역할이다. 앱을 다시 열면 `(fillFloor, through]` 를 한 번 다시 훑는다 — 비용 상한: 루틴 10개 × 3년(1,095일) 후보 → `existingIds` 벌크 조회 ≤ 1,565 id(주간 루틴 기준 156/루틴)… 실제로는 `expandRoutineDates` 가 패턴에 맞는 날짜만 내므로 그 수만 조회한다. 티켓 완료 조건에 "fake-indexeddb 에서 10루틴 × 3년 재스캔 < 200 ms" 를 넣는다. 영구 커서 테이블은 두지 않는다 — `DatasetWrite` 가 `Persistable<Meta>` 만 받아 커서 같은 비-엔티티를 같은 트랜잭션에 넣으려면 계약을 넓혀야 하는데, 재스캔이 멱등이라 그럴 값이 없다.

**세 실패가 어떻게 닫히는가**

- F1: 두 기기 다 `slotId(r, 2/5)` = X 를 만든다. 서버 규칙 "생성은 없을 때만" — 나중 푸시의 X 는 **거절**되고 그 기기는 서버의 X 를 받아 자기 rev-1 사본을 버린다. 로우 1개.
- F2: 배경 채우기가 루틴 로우를 안 건드리니 B 의 로우는 갱신되지 않고, A 의 중지가 유일한 변경 → 이긴다.
- F3: 워터마크가 없다. B 의 제목 편집은 루틴 로우만 바꾼다. 다음 채우기는 id 로 판정하니 1/29·2/5 는 "있음".
- 그리고 S5 자체: A 중지(로우 갱신), B 재개(로우 갱신, `fillFloor=2/28`). LWW → 나중 조작이 이긴다. 재개가 이기면 양쪽 다 하한 2/28 → 3/5 부터. **R7 그대로.**

**남는 대가(정직하게)**

- 스키마 변환 2건: IDB **v4** `.upgrade()` 에서 `routines.materializedThrough → fillFloor`(값은 그대로 — 옛 "여기까지 만들었다" 는 "여기까지는 만들지 마라" 로 읽어도 안전하다: 이미 만든 구간이므로) + 백업 `schemaVersion` 3→4 변환 스텝(키 이름). 이름을 유지하면 변환은 0건이지만 "만든 곳까지" 라는 이름이 "만들지 마라" 를 뜻하게 되어 다음 에이전트가 반드시 오독한다 — 이름을 바꾼다.
- 백업 **복원 뒤** 재스캔: export 가 툼스톤 투두를 안 싣는 한계(`export-backup.ts`)는 그대로라, 새 기기에 복원하면 지운 인스턴스가 재스캔에서 되살아날 수 있다. **동기화가 켜져 있으면 막힌다** — 되살린 X 의 생성 푸시가 서버 툼스톤에 막혀 툼스톤을 받아온다. 로그인 필수인 이 제품에서 "동기화 없는 복원" 은 오프라인 첫 실행뿐이라 잔여 위험은 좁다. ADR-0018 "감수하는 점" 에 적는다.
- `planMergeRoutines` 와 S5 테스트는 **삭제**한다(전제 오진). 루틴 병합은 일반 `planMerge`. 백업 병합에서 `fillFloor` 는 사용자 조작 필드라 newer-wins 가 맞다.
- 슬롯 id 충돌 확률: 128비트 비암호 해시, 입력이 `uuid|date` 구조라 사실상 0. 그래도 `lib/hash.test.ts` 에 10만 쌍 무충돌 + 고정 벡터 3개(다른 기기·다른 런타임에서 같은 값) 를 둔다.

### ①-3. 툼스톤 전파와 GC

- **전파**: 툼스톤은 보통 로우다. `markDeleted` → `put` → 아웃박스 → 푸시(`deleted:1`, body 에 `deletedAt`) → 다른 기기가 풀에서 받아 `put`(툼스톤 그대로 저장; 조회는 이미 감춘다). 되돌리기(6초 토스트, dday/diary 의 `rev+2` 관례)는 같은 id 에 살아 있는 로우를 다시 `put` 하는 **갱신**이고, `touch` 가 새 `updatedAt` 을 찍으므로 툼스톤보다 항상 최신이라 §②-2 의 `updatedAt` 비교를 자연히 통과해 전파된다 — 그래서 서버에 "툼스톤은 최종" 규칙을 **두지 않는다**(두면 되돌리기가 깨진다). **정정(2026-09-21)**: "나중 도착이 이긴다" 라는 옛 표현을 썼었는데, 여기서는 결과가 같아도(되돌리기의 `updatedAt` 이 항상 더 크므로) 근거를 `updatedAt` 비교로 바로잡는다 — §0-5·①-5 와 같은 이유.
- **서버 GC 규칙**: `devices(sub, device_id, last_seq, seen_at)` 를 두고, `gc_floor = min(last_seq of devices with seen_at ≥ now-90d)`. `seq ≤ gc_floor` 인 툼스톤은 물리 삭제 가능. 90일 넘게 안 보인 기기는 `devices` 에서 지우고, 돌아오면 `cursor < gc_floor` 라 서버가 `{ resync: true }` 를 돌려주고 기기는 **전량 재수신**(로컬 `restore`) 한다. **v1 에서 구현하는 것**: `devices` 테이블·`gc_floor` 응답·클라이언트의 resync 경로(와이어 프로토콜이라 불가역). **v1 에서 안 하는 것**: 실제 삭제 실행(수동 `wrangler d1 execute` 한 줄, 필요해질 때). 수치: 툼스톤 1건 ≈ 300 B, 1만 건 삭제 = 3 MB — D1 무료 5 GB 의 0.06 %.
- **클라이언트 GC**: 없음(ADR-0005 "MVP 규모에서 무시 가능" 유지). 물리 삭제 API 는 여전히 `restore` 뿐.

### ①-4. `plan-import.ts:161-165` 문제("워터마크만 바뀌면 LWW 전파 안 됨")

두 겹으로 사라진다. (1) 채우기가 루틴 로우를 더는 바꾸지 않으니 "워터마크만 바뀐 로우" 자체가 없다. (2) 변경 감지가 `updatedAt` 비교가 아니라 **아웃박스**라, 어떤 이유로든 `put` 된 로우는 전파된다 — `adopt` 로 시각을 안 찍고 저장하는 백업 복원 로우도 전부 큐에 들어간다(복원 5만 건 → 아웃박스 5만 건 → 500 건/요청 100 회. backup R13 예산 안).

### ①-5. 클라이언트 병합 규칙(`client-merge.ts`) — 표로 고정

풀로 받은 원격 로우 R(같은 `tbl,id`)과 로컬 상태의 조합:

| 로컬 상태                                                                  | 규칙                                                                                                                                                                                                                                                    | 근거                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 로컬에 없음                                                                | R 저장                                                                                                                                                                                                                                                  | —                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 있고 아웃박스에 없음(보낼 것 없음)                                         | R 저장(덮어씀)                                                                                                                                                                                                                                          | 서버가 진실(R3)                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 있고 아웃박스에 있음, 로컬 `rev === 1`(이 기기에서 만들고 한 번도 안 고침) | **R 저장, 아웃박스에서 제거**                                                                                                                                                                                                                           | 슬롯 id 충돌·부활 방지(①-2 F1). 사용자 편집이 없었으니 잃는 것이 없다 — 이 행은 **생성** 충돌(insert-if-absent)에 관한 것이라 아래 정정과 무관하다                                                                                                                                                                                                                                                                                        |
| 있고 아웃박스에 있음, 로컬 `rev > 1`                                       | **로컬 유지**(R 버림) — 이어지는 푸시는 서버 §②-2 의 `updatedAt` 비교(WHERE 절)가 최종 판정한다: 로컬이 더 최신이면 적용되어 이 기기가 이기고, 아니면 `rejected:'stale'`로 반려되고 **다음 풀에서 서버(= R 과 같은 승자) 값을 다시 받아 그때 정착한다** | ADR-0005 LWW(`updatedAt` 큰 쪽이 이기고 동률이면 도착 순)를 서버가 최종 판정하고, 클라이언트는 낙관적으로 로컬을 유지만 한다. **정정(2026-09-21)**: 이전 판은 "이어지는 푸시가 나중 도착 → 서버에서 이긴다"(도착 순 단독)로 적어 ADR-0015 §2 의 2026-09-21 정정을 어겼다 — `updatedAt` 비교 없이 늦게 푸시한 쪽이 무조건 이기면, 오프라인 기기가 며칠 뒤 올린 옛 편집이 그사이 다른 기기의 최신 편집을 덮는다(ADR-0015 정정 사유 그대로). |

이 표는 `client-merge.vectors.ts`(고정 벡터)로 도메인 테스트·메모리 트랜스포트 테스트·e2e 가 **같은 파일**을 읽는다. 정정 이후 이 벡터 파일에는 "로컬이 더 최신 → 로컬 유지·이후 적용", "로컬이 더 오래됨 → 로컬 유지·이후 `stale` 반려·다음 풀에서 정착" 두 갈래가 필요하다(단순 rev 분기였던 이전 판보다 벡터 1개 늘어남).

---

## ② 서버 계층

### ②-1. 배치 구조

- `worker/` 를 레포 루트 신설(`src/` 밖 — `src/**` 파일은 레이어에 속해야 하고 새 레이어는 ADR + `arch-layers.mjs` 사안. Worker 는 브라우저 코드가 아니므로 밖이 맞다). `worker/AGENTS.md` 필수(§1 규칙 4).
- Worker 가 import 할 수 있는 `src/` 는 **`src/domain/**`·`src/lib/**` 만**(둘 다 외부 의존 0, 브라우저 전역 0). eslint 블록 `files: ['worker/**']` 로 `@/features|app|components|infra|repositories` import 금지 + 2차 패스 대상에 `worker/` 추가.
- `wrangler.jsonc`:

```jsonc
{
  "name": "tasky",
  "main": "worker/index.ts",
  "compatibility_date": "2026-09-15",
  "assets": {
    "directory": "dist/client",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/auth/*"], // wrangler 4.132 스키마 확인됨(배열 허용)
  },
  "d1_databases": [
    { "binding": "DB", "database_name": "tasky", "database_id": "b5bcb45e-347a-4dcd-a0e1-12f5146f8b3c" },
  ],
  "vars": { "GOOGLE_CLIENT_ID": "430669646782-29td1hskagbod68cr8k082hur51ph9gt.apps.googleusercontent.com" },
}
```

`/api/*`·`/auth/*` 밖의 요청은 Worker 를 **거치지 않는다**(자산 직접 서빙) — 정적 앱의 응답 지연이 변하지 않는다.

- 시크릿: `GOOGLE_CLIENT_SECRET`·`SESSION_SECRET` — 배포는 `wrangler secret put`(1회, 사용자 로컬), 로컬은 `.dev.vars`. `.dev.vars.example` 을 커밋한다(`AUTH_STUB=1` 포함, ②-4).
- `tsconfig.worker.json`(`types: ["@cloudflare/workers-types"]`, include `worker/**`, `src/domain/**`, `src/lib/**`), 루트 `tsconfig.json` 의 `exclude` 에 `worker` 추가(지금은 `**/*.ts` 를 다 집어 dom lib 로 검사한다). `pnpm typecheck` 에 `tsc -p tsconfig.worker.json` 추가.
- `pnpm start`(= `wrangler dev`)는 그대로 로컬 Worker + 로컬 D1. `pnpm dev`(Vite 5173)는 Worker 가 없으므로 **로그인이 안 된다** — `vite.config.ts` 에 `server.proxy: { '/api': 'http://127.0.0.1:8787', '/auth': … }` 를 넣어 두 프로세스로 개발한다(Vite HMR 유지). 5173 리디렉션 URI 는 이미 등록돼 있다(가이드 §2-5).

### ②-2. D1 스키마 (`worker/db/migrations/0001_init.sql`) — 한 PR 에 확정(불가역)

```sql
CREATE TABLE users (
  sub        TEXT PRIMARY KEY,          -- 구글 sub (ADR-0015 §1)
  email      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  gc_floor   INTEGER NOT NULL DEFAULT 0 -- 이 seq 이하 툼스톤은 지워도 된다(①-3)
);
CREATE TABLE sessions (
  sid        TEXT PRIMARY KEY,          -- 256비트 난수 base64url
  sub        TEXT NOT NULL REFERENCES users(sub) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_sub ON sessions(sub);
CREATE TABLE devices (
  sub        TEXT NOT NULL REFERENCES users(sub) ON DELETE CASCADE,
  device_id  TEXT NOT NULL,             -- 클라이언트 IDB syncState 가 만든 UUID
  last_seq   INTEGER NOT NULL DEFAULT 0,
  seen_at    TEXT NOT NULL,
  PRIMARY KEY (sub, device_id)
);
CREATE TABLE entities (
  sub        TEXT NOT NULL REFERENCES users(sub) ON DELETE CASCADE,
  tbl        TEXT NOT NULL CHECK (tbl IN ('todos','categories','settings','focusSessions','ddays','diaryEntries','routines')),
  id         TEXT NOT NULL,
  seq        INTEGER NOT NULL,          -- 사용자별 단조 증가(아래 할당식)
  deleted    INTEGER NOT NULL DEFAULT 0,-- body.deletedAt 존재 여부의 사본(풀 필터·GC 용)
  device_id  TEXT NOT NULL,             -- 마지막으로 쓴 기기(풀에서 자기 것 제외)
  body       TEXT NOT NULL,             -- JSON. validate-rows 화이트리스트 통과분만
  PRIMARY KEY (sub, tbl, id)
);
CREATE UNIQUE INDEX entities_seq ON entities(sub, seq);
```

- **IDB ↔ D1 대응**: IDB 테이블 7개 = `tbl` 값 7개. 로우 본문은 그대로 JSON. `Meta`(`id`·`createdAt`·`updatedAt`·`rev`·`deletedAt`)도 body 안에 그대로(서버가 손대지 않는다 — `adopt` 와 같은 원칙). `seq` 는 body 밖 컬럼이라 **클라이언트 로우 타입에 아무 필드도 추가하지 않는다**(ADR-0005 "동기화 메타는 비인덱스 필드로" 보다 더 보수적: 필드 0개). 새 테이블이 생겨도 D1 마이그레이션은 `CHECK` 목록 한 줄이다.
- **`seq` 할당**: 별도 카운터 없이 `INSERT … VALUES (…, (SELECT COALESCE(MAX(seq),0)+1 FROM entities WHERE sub=?1), …)`. `entities_seq` 인덱스라 MAX 는 O(log n). `db.batch()` 는 단일 트랜잭션이고 D1 은 단일 작성자라 배치 안에서 단조·전역 직렬. 서브쿼리를 매 문장 평가하므로 같은 배치의 500건도 서로 다른 seq 를 받는다(테스트로 고정).
- **두 규칙의 SQL 형태**(`worker/db/entities.ts`):
  - 생성(`baseSeq === 0`): `INSERT … ON CONFLICT(sub,tbl,id) DO NOTHING` → `meta.changes === 0` 이면 `rejected: 'exists'`.
  - 갱신(`baseSeq > 0`): `INSERT … ON CONFLICT(sub,tbl,id) DO UPDATE SET seq=excluded.seq, deleted=…, device_id=…, body=… WHERE json_extract(entities.body,'$.updatedAt') <= json_extract(excluded.body,'$.updatedAt')` → `meta.changes === 0` 이면 `rejected: 'stale'`(로컬이 서버보다 오래된 `updatedAt` — 클라이언트는 다음 풀에서 이긴 쪽을 받는다, ①-5), 아니면 적용. **동률이면 통과**(`<=`)하므로 "동률이면 도착 순"(ADR-0005)이 자연히 성립한다. **미래 시각 클램프**(ADR-0005 "서버는 미래 시각을 수신 시각으로 클램프")는 이 upsert 전에 한 단계로 처리한다: 들어온 `body.updatedAt`이 서버 수신 시각(`Date.now()`, Worker)보다 미래면 그 필드를 수신 시각으로 바꿔 쓴다(요청 로우 검증 뒤·upsert 전, `worker/sync/handler.ts`). **정정(2026-09-21)**: 이전 판은 `WHERE` 없이 "항상 적용(나중 도착이 이긴다)"이라고 적어 ADR-0015 §2 의 2026-09-21 정정(ADR-0005 의 `updatedAt` LWW 를 그대로 따른다 — 도착 순 단독이 아니다)과 어긋났다. `wire.ts` 의 `rejected` 사유 목록에 `'stale'`이 새로 필요하다(②-3).
- 인덱스 예산: 풀 = `WHERE sub=? AND seq>? AND device_id<>? ORDER BY seq LIMIT 500` → `entities_seq` 한 번. 하루 3기기 × 960 풀 ≈ 3k 쿼리(D1 무료 500만 읽기/일의 0.06 %).

### ②-3. 엔드포인트 계약

| 메서드·경로                     | 인증               | 요청              | 응답                                               | 비고                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------- | ------------------ | ----------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /auth/login`               | 없음               | —                 | 302 → 구글 인증 URL(`state`·PKCE `code_challenge`) | `state`+`code_verifier` 는 10분짜리 서명 쿠키 `tasky_oauth`(HttpOnly·Secure·Lax)                                                                                                                                                                                                                                                       |
| `GET /auth/callback?code&state` | 쿠키 `tasky_oauth` | —                 | 302 → `/`(성공) / `/?auth=denied\|error`(실패)     | 코드 교환(client_secret + verifier) → **`userinfo` 엔드포인트로 `sub`·`email` 조회**(서버↔서버 HTTPS 라 id_token JWT 검증 라이브러리 불필요, 의존성 0) → `session.ts#signIn`(재가입이면 그 `sub` 의 기존 세션 전량 폐기, `deleted_users` EXISTS 조건부 — ADR-0020) → `users` upsert → `sessions` 행 생성 → `Set-Cookie: tasky_session` |
| `POST /auth/logout`             | 세션               | 헤더 `X-Tasky: 1` | 204 + 쿠키 삭제                                    | 자기 `sid` 행만 삭제(다른 기기 유지)                                                                                                                                                                                                                                                                                                   |
| `POST /auth/logout-others`      | 세션               | 헤더 `X-Tasky: 1` | 204                                                | `session.ts#destroyOtherSessions(sub, sid)` — 자기 `sid` 는 남기고 같은 `sub` 의 나머지 세션 전부 삭제("다른 기기 모두 로그아웃", ADR-0020)                                                                                                                                                                                            |
| `GET /api/me`                   | 세션               | —                 | `{ sub, email, expiresAt }` / 401                  | 만료 7일 미만이면 새 만료로 갱신(슬라이딩)                                                                                                                                                                                                                                                                                             |
| `POST /api/sync`                | 세션               | 아래              | 아래                                               | 한 왕복 = 푸시 → 풀                                                                                                                                                                                                                                                                                                                    |

`POST /api/sync` 본문·응답(`src/domain/sync/wire.ts` 의 타입이 단일 소스, Worker 도 같은 파일 import):

```ts
type SyncRequest = {
  protocol: 1;
  deviceId: string;
  cursor: number; // 마지막으로 받은 seq
  changes: Array<{ tbl: SyncTable; id: string; baseSeq: number; row: unknown }>; // ≤ 500
};
type SyncResponse =
  | { resync: true; gcFloor: number } // cursor < gcFloor — 전량 재수신 필요
  | {
      cursor: number; // 이 응답까지 받은 seq(풀 결과 max, 없으면 요청 cursor)
      applied: Array<{ tbl; id; seq }>;
      rejected: Array<{ tbl; id; reason: 'exists' | 'invalid' | 'unknown-table' | 'stale' }>;
      pulled: Array<{ tbl; id; seq; row: unknown }>; // ≤ 500, seq 오름차순, 자기 기기 제외
      more: boolean; // 500 건으로 잘렸으면 true → 즉시 다음 왕복
      gcFloor: number;
    };
```

`'stale'`은 **정정(2026-09-21)**으로 추가됐다 — §②-2 의 `updatedAt` 비교(WHERE)가 반려하는 사유. `'exists'`(생성 충돌)와 달리 `'stale'`은 갱신이 `updatedAt` 로 졌다는 뜻이고, 클라이언트는 특별 처리 없이 다음 풀에서 이긴 값을 받는다(①-5).

- 요청 로우는 **`validate-rows.ts` 의 `readTodo`/`readCategory`/…** 로 검증(알 수 없는 필드 제거, 형식 오류 → 그 로우만 `invalid`). 검증기 매핑 `{ todos: readTodo, … } satisfies Record<SyncTable, Reader>` — 테이블이 늘면 컴파일 에러.
- 크기 상한: 본문 2 MB(Worker 요청 한도 100 MB 이지만 D1 배치 1문장 100 KB·배치 총량 제한 고려), 초과 413.
- CSRF: `SameSite=Lax` + POST 는 `Content-Type: application/json` **과** 헤더 `X-Tasky: 1` 둘 다 요구(교차 출처 폼은 커스텀 헤더를 못 붙인다). 없으면 403.

### ②-4. 인증·세션

- 흐름: `/auth/login` → 구글 → `/auth/callback` → 코드 교환(Worker 만, 시크릿 서버 전용) → `userinfo` → 세션 발급 → `/`. 브라우저에는 구글 토큰이 **한 번도** 내려가지 않는다(sync §4).
- **세션 저장·검증**: 쿠키 값 = `sid.sig`, `sig = HMAC-SHA256(SESSION_SECRET, sid)` base64url(WebCrypto `crypto.subtle`, 라이브러리 0). 검증 = 서명 확인(상수 시간 비교) **후** `sessions` 행 조회(존재·만료). 서명이 있으면 D1 을 두드리기 전에 위조를 걸러 무료 한도를 지킨다. `sid` 는 256비트 난수. 쿠키 속성: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`(30일, ⑦ 사용자 결정). `wrangler dev` 의 http://localhost 에서는 `Secure` 를 내리지 않는다 — Chrome/Firefox 는 localhost 를 안전 출처로 취급해 Secure 쿠키를 받는다(e2e 로 확인 항목).
- 로그아웃: 자기 `sid` 삭제. "모든 기기에서 로그아웃"(자기 세션은 남기고 나머지만)은 **`POST /auth/logout-others`** 로 들어왔다(ADR-0020) — 세션 전량 폐기(자기 것 포함)는 여전히 범위 밖이고, 재가입 경로(`signIn`)에서만 조건부로 일어난다.
- **자격증명 없는 로컬 검증용 스텁**: `worker/auth/provider.ts` 인터페이스 `IdentityProvider { authorizeUrl(state, challenge); exchange(code, verifier): Promise<{sub,email}> }` — 구현 `google.ts` 와 `stub.ts`. 스텁은 **`env.AUTH_STUB === '1'` 이고 요청 호스트가 `localhost|127.0.0.1` 일 때만** 선택되며, 둘 중 하나라도 아니면 `google.ts`. 스텁의 `/auth/login?as=<sub>` 는 즉시 콜백으로 돌아온다. 고정 테스트: (i) `AUTH_STUB=1` + 호스트 `tasky.example.workers.dev` → 구글 제공자 선택, (ii) `wrangler.jsonc` `vars` 에 `AUTH_STUB` 키가 없음(`scripts/check-dist.mjs` 에 한 줄), (iii) `deploy.sh` 가 `.dev.vars` 를 읽지 않음(이미 그렇다 — `.env` 의 세 키만).

### ②-5. 멀티 사용자 격리 — 구조로

1. **핸들러는 `sub` 를 문자열로 받지 않는다.** `worker/db/user-db.ts` 의 `forUser(db: D1Database, sub: string): UserDb` 만이 `sub` 를 알고, `UserDb` 의 모든 메서드(`pull`, `push`, `touchDevice`, `gcFloor`)가 내부에서 `sub` 를 첫 바인딩으로 넣는다. 핸들러 시그니처는 `(req, ctx: { user: UserDb })`.
2. **정적 검사**: `scripts/check-worker-sql.sh` — `worker/db/**` 의 모든 SQL 템플릿 문자열(`sql\`…\``태그로 고정)에`WHERE`가 있으면`sub = ?`가 있어야 한다. 예외 목록은`users`·`sessions`조회 두 문장뿐이며 파일 상단에 명시.`check.sh` 에 스텝 추가.
3. **계약 테스트(실 D1)**: 사용자 A 로 7테이블 각 2건 푸시 → B 로 풀 = 0건·A 로 풀 = 14건(자기 기기 제외라 다른 device_id 로) → B 가 A 의 `(tbl,id)` 로 갱신 푸시 → **B 의 새 로우로 생성**(A 로우 불변, seq 별개). 이 테스트가 통과하려면 `@cloudflare/vitest-pool-workers`(로컬 D1 을 vitest 안에서) 또는 `wrangler dev` 위 HTTP 테스트가 필요하다 — ⑦-1.
4. `entities` 의 PK 가 `(sub, tbl, id)` 라 두 사용자가 **같은 id** 를 써도 충돌하지 않는다(백업 파일을 서로 주고받은 두 사용자가 실제로 이렇게 된다).

---

## ③ 클라이언트 계층

### ③-1. 기존 인터페이스를 바꾸지 않고 붙이는 배선

**바뀌지 않는 것**: `TodoRepository`… 8개 인터페이스, `DatasetRepository` 3 메서드, `Persistable` 브랜드 4 생성 함수 규칙, 화면 컴포넌트(기존 것).

**새로 생기는 것과 위치(ARCHITECTURE §1 허용 목록 안)**

| 파일                                                                     | 레이어       | 역할                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/sync/wire.ts`                                                | domain       | 프로토콜 타입(Worker 와 공유)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/domain/sync/server-rules.ts`                                        | domain       | `applyServerRules(existing, change)` 순수 함수 — 생성/갱신 판정. **Worker 와 메모리 가짜 서버가 같은 함수**                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/domain/sync/client-merge.ts`                                        | domain       | ①-5 표                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/domain/sync/remote-rows.ts`                                         | domain       | 풀 로우 검증(`validate-rows` readers) + `adopt` → `Persistable`. **`adopt` 허용 호출처를 `src/domain/backup/**`에서`src/domain/{backup,sync}/**` 로 넓힌다**(eslint `no-restricted-imports` 예외 + ADR-0009 규칙 1 개정, ADR-0018 에 기록)                                                                                                                                                                                                                                                                                   |
| `src/domain/routine/slot-id.ts`, `src/lib/hash.ts`                       | domain/lib   | ①-2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/repositories/sync-repository.ts`                                    | repositories | `SyncRepository` — 로컬 큐·커서·적용·툼스톤 존재 확인                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/repositories/sync-transport.ts`                                     | repositories | `SyncTransport { exchange(req): Promise<SyncResponse>; me(): Promise<Me \| null>; logout(); logoutOthers() }`(ADR-0020 이 `logoutOthers()` 추가) — 원격 포트. 레포지토리 레이어가 "저장소 계약" 이라 어색하지만 feature 가 import 할 수 있는 유일한 포트 자리다(ADR-0018 에 명시)                                                                                                                                                                                                                                            |
| `src/repositories/memory/sync-repository.ts`, `memory/sync-transport.ts` | repositories | 메모리 구현. **가짜 트랜스포트 = `applyServerRules` 를 돌리는 인메모리 서버**(seq 발급·device 제외·insert-if-absent 전부 구현)                                                                                                                                                                                                                                                                                                                                                                                               |
| `src/infra/indexeddb/sync-indexeddb-repository.ts`                       | infra        | v4 테이블 `syncOutbox`·`syncState`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/infra/sync/http-transport.ts`                                       | infra        | `fetch` 구현(`credentials: 'same-origin'`, `X-Tasky: 1`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/features/sync/**`                                                   | features     | 엔진(`store/sync-engine.ts`), 상태 스토어, `AuthGate`, `LoginScreen`, `UploadDialog`, `SyncStatus`, 트리거 훅                                                                                                                                                                                                                                                                                                                                                                                                                |
| 마운트 지점(기존 파일, **owns 에 반드시**)                               | —            | `src/repositories/container.ts`(`sync`, `syncTransport` 필드), `src/repositories/memory/repositories.ts`, `src/infra/indexeddb/repositories.ts`, `src/app/providers.tsx`(트랜스포트 조립·엔진 시작), `src/app/page.tsx`(`<AuthGate>` 로 감쌈), `src/features/shell/components/ShellSidebar.tsx`(상태·로그아웃 진입점 — ⑥-3), `src/features/shell/components/ShellHeader.tsx`(`useSummaryRevision` 에 sync `dataRevision` 합산), `src/infra/indexeddb/db.ts`·`query.ts`(v4 + 아웃박스), `src/test/setup.ts`(메모리 sync 주입) |

**`SyncRepository` 계약(초안)**

```ts
export interface SyncRepository {
  /** 아웃박스 앞에서부터 limit 건. (tbl,id) 유일 — 같은 로우를 여러 번 써도 1건 */
  listOutbox(limit: number): Promise<readonly OutboxEntry[]>;
  /** 푸시가 인정된(applied 또는 rejected) 항목 제거. 그 사이 다시 써진 로우는 남는다(버전 비교) */
  ackOutbox(entries: readonly OutboxEntry[]): Promise<void>;
  /** 툼스톤 포함 원격 로우 저장. **아웃박스에 넣지 않는다.** 한 트랜잭션 */
  applyRemote(rows: readonly RemoteRow[]): Promise<void>;
  /** 툼스톤 포함 존재 확인(①-2 슬롯 판정) */
  existingIds(tbl: SyncTable, ids: readonly string[]): Promise<ReadonlySet<string>>;
  getState(): Promise<SyncState>; // { deviceId, userSub?, cursor, lastSyncedAt? }
  setState(patch: Partial<SyncState>): Promise<void>;
  /** 다른 사용자가 로그인했을 때 7테이블 + 아웃박스 + 커서 초기화(기기 id 는 유지) */
  wipe(): Promise<void>;
}
```

- **아웃박스 적재는 `query.ts` 의 `put`/`bulkPut` 안**(툼스톤 필터와 같은 자리). `applyRemote` 만 `putRemote`(적재 없음)를 쓴다. `restore()` 도 `bulkPut` 을 타므로 복원 로우가 전부 큐에 들어간다(①-4). 메모리 구현도 `memory/live.ts` 의 같은 자리.
- IDB **v4** `STORES`: `...STORES_V3, syncOutbox: '[tbl+id], seq', syncState: 'id'` + `.upgrade()` 로 `routines` 필드 이름 변환(①-2). `STORES_V3` 상수 신설(수정 금지 규칙).

### ③-2. `existingIds` 와 채우기 배선

`todo-routine-fill.ts#planMaterializeRoutines`: 루틴별 후보 날짜 → 슬롯 id 목록 → `getRepositories().sync.existingIds('todos', ids)` → `planRoutineFill({ routine, through, existingIds })`. `existing: readonly Todo[]`(제목 대조) 인자는 **삭제**한다 — 제목 대조 dedup 은 R21(날짜 지정 루틴)의 "이미 있는 같은 제목 건너뛰기" 도 담당했으므로 그 경로(`createRoutineAction`)에는 남긴다(routine-fill.contract.ts 가 두 흐름의 dedup 이 갈리지 않는지 보던 것은 "슬롯 id 로 한 흐름" 이 되며 의미가 바뀐다 → 계약 테스트 재작성).

### ③-3. 언제 동기화하는가 (오프라인 우선 유지)

| 트리거                              | 동작                                                                                 | 근거                                                                                                                                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 로그인 직후                         | 풀 전량(`cursor=0`, `more` 따라 반복) → 그 뒤 채우기 허용                            | 채우기가 풀 **뒤에** 와야 F1 창이 닫힌다                                                                                                                                                                                                                            |
| `visibilitychange`(visible)·`focus` | 2 s 디바운스 후 1사이클                                                              | R5-1                                                                                                                                                                                                                                                                |
| `online`                            | 즉시 1사이클                                                                         | R5-2                                                                                                                                                                                                                                                                |
| 보이는 동안 주기                    | **30 s**                                                                             | R5-3. 수치 근거: 1기기 8h 가시 = 960 req/일, 3기기 ≈ 3k + 쓰기 푸시 ≈ 4k/일 ≪ Workers 무료 10만/일(4 %). D1 읽기 ≈ 4k/일 ≪ 500만. 10 s 로 내리면 12 % — 여전히 여유지만 배터리·탭 다수 열림을 고려해 30 s. 진짜 실시간이 거슬리면 ADR-0015 재검토 트리거(푸시 계층) |
| 로컬 쓰기 후                        | **1.5 s** 코얼레싱 푸시(타이핑 연타 흡수)                                            | R5 "쓴 기기는 낙관적 갱신으로 즉시" — 화면은 이미 갱신됐고 서버 도달만 늦춘다                                                                                                                                                                                       |
| 응답 `more:true`                    | 즉시 다음 왕복                                                                       | —                                                                                                                                                                                                                                                                   |
| 오프라인                            | 쓰기는 아웃박스에 쌓임, 상태 "○ 오프라인 · 온라인이 되면 이어서 보냅니다" + 대기 N건 | R6                                                                                                                                                                                                                                                                  |

한 **사이클** = `pull(cursor)` → `client-merge` 적용(`applyRemote`) → `listOutbox(500)` → `push` → `ackOutbox` → `setState(cursor)`. 풀이 먼저인 이유는 ①-5 표의 3·4행이 풀 결과를 전제하기 때문. 사이클은 직렬(진행 중이면 "한 번 더" 플래그만).

**풀 뒤 화면 갱신**: 엔진이 `useSyncStore.dataRevision` 을 올리고, 백업 가져오기가 이미 쓰는 경로(`ShellHeader#useSummaryRevision` 합산 + `reloadViews` 식 `loadDate` 재호출)를 그대로 탄다. 낙관적 갱신 상태를 덮지 않도록 **아웃박스가 비어 있을 때만** `loadDate` 를 다시 부른다(비어 있지 않으면 ①-5 의 4행이 로컬을 지켰으므로 화면도 이미 맞다).

### ③-4. 충돌을 보여주는가 — 조용히 (sync R4)

R4: "사용자에게 병합 화면을 보여주지 않는다". 따른다. 보여주는 것은 **상태**뿐(R6): `● 동기화됨 · 방금`, `○ 오프라인 · 대기 3건`, `⚠ 동기화 실패 · 다시 시도`(아이콘+텍스트, §5). 거절(`rejected`)도 사용자에게 안 보인다 — 로그(`console.info`)만. 다만 `invalid` 거절이 **연속 3회** 같은 로우면 그 로우는 아웃박스에서 격리(`syncState.quarantine`)하고 상태에 "⚠ 1건 보내지 못함" — 없으면 영원히 재시도해 조용한 무한 루프가 된다.

### ③-5. 로그인 게이트와 사용자 전환

- `src/app/page.tsx`: `<AuthGate><AppShell/></AuthGate>`. `AuthGate` 는 `syncState.userSub` 와 `GET /api/me` 를 본다: 온라인+200 → 통과, 온라인+401 → 로그인 화면(로컬 캐시 유지), **오프라인+로컬 `userSub` 있음 → 통과**(R6), 오프라인+없음 → 로그인 화면("온라인이 되면 로그인할 수 있어요").
- 로그인 화면은 **진입 청크**에 들어간다(첫 페인트). 엔진·`UploadDialog` 는 지연 청크(Dexie 처럼). **예산 주의**: 이 문서를 쓸 때 진입 청크는 130,752 B(여유 19 kB)였지만 Phase 2 가 들어오면서 #127 기준 **148,976 B / 150,000 B — 여유 1,024 B** 다. 로그인 화면 +2.5 kB 는 **그대로는 안 들어간다** — #117 의 결정대로 **T-94 PR 안에서 예산을 올리거나**, 게이트만 진입 청크에 두고 화면 자체를 지연 청크로 뗀다. 착수 전에 `pnpm build` 로 그날의 숫자를 다시 재라.
- 첫 로그인(`userSub` 없음): 7테이블 중 살아 있는 로우가 1건이라도 있으면 `UploadDialog`(R7), 없으면 통과(R8). **올리기** = ①-1 첫 행(서버 전량 풀 → `planImport('merge')` → `restore` → 아웃박스에 전량 → 푸시). **그대로 두기** = ⑦-2(스펙 미정).
- **다른 `sub` 로 로그인**(같은 브라우저): `wipe()` 후 전량 풀. 로그인 전 데이터 다이얼로그는 `userSub` 가 비어 있을 때만 뜬다(이전 사용자의 데이터를 새 사용자 계정에 올리는 경로를 만들지 않는다).

---

## ④ 티켓 분해 (PR 단위, 그대로 발행 가능)

의존: **T-90(ADR) → T-91(domain) → T-92(repo/infra) → {T-93(Worker) ∥ T-94(feature)} → T-95(docs/README)**. T-93 과 T-94 는 파일이 서로소라 병렬. 공용 마운트 파일(`container.ts`·`memory/repositories.ts`·`indexeddb/repositories.ts`·`db.ts`·`query.ts`)은 **T-92 하나**가 다 가진다(Phase 2 의 T-79/80/81 직렬화 교훈). 불가역 결정 세 가지 — IDB v4 스키마(T-92)·D1 0001 스키마 + 와이어 프로토콜 v1(T-93)·`fillFloor` 이름(T-91) — 는 각각 한 PR 에 몰았다.

각 티켓의 **"자격증명 없이 검증 가능한 범위"** 를 `verify:` 로 적었다.

### T-90 — ADR-0018 동기화 구조 + ADR-0017 부분 supersede

```markdown
---
id: T-90
title: ADR-0018 — 동기화 구조(seq·아웃박스·슬롯 id·fillFloor·서버 규칙·세션·격리·GC)
type: docs
branch: docs/adr-0018-sync
worktree: .worktrees/adr-0018-sync
spec: docs/specs/sync.md
owns:
  - docs/decisions/ADR-0018-sync-architecture.md
  - docs/decisions/ADR-0017-routine-watermark-materialization.md # 상태 "partially superseded by ADR-0018" + S5 오진 정정
  - docs/decisions/ADR-0009-dataset-operations-and-adopt-write-path.md # 규칙 1 adopt 호출처에 src/domain/sync/** 추가
  - docs/decisions/ADR-0015-google-auth-and-realtime-sync.md # §2 "서버 rev" → "서버 seq(Meta.rev 와 별개)" 한 줄 정정
  - docs/DECISIONS.md
  - docs/ARCHITECTURE.md # §1 표에 worker/ 행, §2 트리, §5 클라우드 동기화 행을 확정 위치로
  - docs/DIRECTORY_MAP.md
  - docs/specs/sync.md # ⑥ 모순 정정(R1 오프라인 문구, R3 "기존 화면", §7 두 탭→두 컨텍스트, §2 마이페이지 위치)
  - docs/specs/routine.md # §4 materializedThrough → fillFloor, "슬롯 id" 문장
reads: [SYNC_DESIGN.md(이 문서), docs/decisions/AGENTS.md, docs/specs/AGENTS.md]
depends_on: []
model: opus
size: M
---

## 목표

이 설계 문서 ①~③ 의 결정을 ADR 로 굳히고, 스펙의 모순(⑥)을 같은 PR 에서 고친다.

## 완료 조건

- [ ] ADR-0018: 결정 10항(seq≠rev · 아웃박스 · 슬롯 id · fillFloor · 서버 규칙 2줄 · 세션 · 격리 · GC 플로어 · 포트 위치 · 사용자 전환 wipe), 대안 표(워터마크 max 유지 / 기기별 워터마크 / CRDT), 감수하는 점(복원 뒤 재스캔 부활, planMerge diary 한계 공유, 시계 무관 LWW 의 오프라인 기기 덮어쓰기), 재검토 트리거.
- [ ] ADR-0017 §재검토에 "S5 는 R7 을 오독했다 — 중지 구간의 공백은 스펙" 정정 블록, 규칙 1~3 이 ADR-0018 로 대체됨을 명시.
- [ ] sync.md ⑥-1·3·4·8·10 반영, routine.md §4 갱신. 금지어 검사 통과.
      verify: 문서만. `pnpm check` 의 forbidden-words·agents-md·format.
```

### T-91 — 도메인: 프로토콜·서버 규칙·클라이언트 병합·슬롯 id·fillFloor

```markdown
---
id: T-91
title: 동기화 도메인 — wire·server-rules·client-merge·remote-rows·슬롯 id·fillFloor
type: feature
branch: feature/sync-domain
worktree: .worktrees/sync-domain
spec: docs/specs/sync.md
owns:
  - src/domain/sync/** # 신규(AGENTS.md 포함)
  - src/lib/hash.ts, src/lib/hash.test.ts # 순수 128비트 해시(외부 의존·전역 0)
  - src/domain/routine/** # routine.ts(fillFloor), routine.rules.ts, routine-fill.ts(+test), slot-id.ts
  - src/domain/todo/todo.rules.ts # createTodo 에 선택 id 입력
  - src/domain/backup/plan-import.ts, plan-import.test.ts # planMergeRoutines·S5 테스트 삭제
  - src/domain/backup/validate-rows.ts # ROUTINE_KEYS: materializedThrough → fillFloor
  - src/domain/backup/migrate-backup.ts, migrate-backup.test.ts, backup-document.ts # schemaVersion 4 + v3→v4 키 이름 변환
  - eslint.config.mjs # adopt importNames 예외에 src/domain/sync/** 추가 (이 한 블록만)
  - scripts/check-arch.sh 픽스처(adopt 호출처 케이스 1건 추가)
reads: [docs/decisions/ADR-0018-*.md, src/domain/AGENTS.md, src/domain/backup/AGENTS.md, src/domain/meta.ts]
depends_on: [T-90]
model: opus
size: L
---

## 완료 조건

- [ ] `wire.ts`: SyncRequest/SyncResponse/SyncTable/RemoteRow. `SyncTable` 은 `keyof DatasetSnapshot` 에서 파생(테이블 추가 시 컴파일 에러).
- [ ] `server-rules.ts#applyServerRules(existing: ServerRow|undefined, change): 'insert'|'update'|'reject-exists'|'reject-stale'` + **고정 벡터 파일 `server-rules.vectors.ts`**(≥ 9 벡터: 생성-없음/생성-있음/갱신-없음(=생성 취급)/갱신-있음(신규 `updatedAt` 이 더 큼)/**갱신-오래됨(reject-stale, 신규 `updatedAt` 이 더 작음)**/갱신-동률(적용, 도착 순)/툼스톤 갱신/툼스톤 위 생성(거절)/되돌리기(툼스톤 위 갱신 = 적용, `updatedAt` 비교 통과 시)/unknown-table). **정정(2026-09-21)**: 이전 판은 `reject-stale`이 없었다(§②-2·①-5 정정과 짝).
- [ ] `client-merge.ts` ①-5 표 4행 + `client-merge.vectors.ts`.
- [ ] `remote-rows.ts#readRemoteRow(tbl, value): Persistable<…>` — validate-rows readers 매핑 `satisfies Record<SyncTable, …>` + adopt. 형식 오류는 `DomainError('SYNC_ROW_INVALID')`.
- [ ] `slot-id.ts#slotId(routineId, date)`: UUID v4 패턴 통과, 고정 벡터 3개, `hash.test.ts` 10만 쌍 무충돌.
- [ ] `planRoutineFill({ routine, through, existingIds: ReadonlySet<string> })`: 루틴 로우를 **반환하지 않는다**(더는 touch 안 함) — 시그니처가 바뀌어 호출부 컴파일 에러로 드러난다. 테스트: 툼스톤 id 가 existingIds 에 있으면 건너뜀 / 이동된 로우 id 존재 시 건너뜀 / fillFloor 이하 절대 생성 안 함 / 두 번 호출 결과 동일(멱등).
- [ ] `resumeRoutine` 동작 불변(테스트 그대로), `createRoutine` 이 `fillFloor = startDate 전날`.
- [ ] 백업 v3 파일 → v4 변환 테스트(`materializedThrough` 키가 `fillFloor` 로, 값 동일).
- [ ] **돌연변이 시험(완료 조건에 포함, PR 본문에 결과 기재)**: 아래 각 줄을 손으로 바꾸면 지목한 테스트가 **빨개져야** 한다 — (1) `applyServerRules` 의 `reject-exists` 를 `update` 로 → `server-rules.vectors` 벡터 #2; (2) `client-merge` 의 `rev === 1` 조건 삭제 → 벡터 #3; (3) `slotId` 의 date 를 무시 → `slot-id.test` "다른 날짜는 다른 id"; (4) `planRoutineFill` 의 `existingIds.has` 검사 삭제 → "툼스톤 id 건너뜀". 네 줄 다 빨간 것을 확인한 뒤 되돌린다.
      verify: 전부 vitest(자격증명 무관). 100 %.
```

### T-92 — 저장소 포트 + 메모리 구현(가짜 서버 포함) + IndexedDB v4 + 마운트

```markdown
---
id: T-92
title: SyncRepository·SyncTransport 포트, 메모리 가짜 서버, IDB v4(아웃박스·syncState·fillFloor 변환)
type: feature
branch: feature/sync-repositories
worktree: .worktrees/sync-repositories
spec: docs/specs/sync.md
owns:
  - src/repositories/sync-repository.ts, sync-repository.contract.ts, sync-repository.contract.test.ts(memory)
  - src/repositories/sync-transport.ts
  - src/repositories/memory/sync-repository.ts, memory/sync-transport.ts, memory/live.ts(아웃박스 적재 자리), memory/repositories.ts, memory/routine-repository.ts(필드명)
  - src/repositories/container.ts, contract.ts, routine-fill.contract.ts(재작성), routine-repository.contract.ts(필드명)
  - src/repositories/write-plan.ts # 변경 없어야 함 — 변경되면 설계 이탈(리뷰 체크)
  - src/infra/indexeddb/db.ts, query.ts, migration.test.ts, repositories.ts, sync-indexeddb-repository.ts, indexeddb.contract.test.ts, routine-indexeddb-repository.ts
  - src/infra/sync/** # http-transport.ts(+test, fetch 모킹)
  - src/test/setup.ts # 메모리 sync·transport 주입
  - src/features/todo/store/todo-routine-fill.ts, todo-routine-fill.test.ts # existingIds 배선(planRoutineFill 시그니처 변경의 유일한 호출부)
  - src/features/todo/store/todo-routine-manage.ts(필드명), src/features/todo/**/RoutineManager*.tsx(필드명 표시가 있으면)
reads: [ADR-0018, src/repositories/AGENTS.md, src/infra/AGENTS.md, ADR-0007 규칙 6(READS 매핑 타입 관례)]
depends_on: [T-91]
model: opus
size: L
---

## 완료 조건

- [ ] IDB `version(4)`: `STORES_V3` 상수 동결, `STORES = {...STORES_V3, syncOutbox:'[tbl+id], seq', syncState:'id'}`, `.upgrade()` 로 routines 로우의 키 이름 변환. `migration.test.ts`: v3 로 넣은 루틴 3건(활성·중지·툼스톤) → v4 에서 `fillFloor` 값 동일·`materializedThrough` 키 없음, 다른 6테이블 로우 바이트 불변.
- [ ] `query.ts`: `put`/`bulkPut` 이 같은 트랜잭션에서 `syncOutbox` 에 `(tbl,id)` upsert. `putRemote`/`bulkPutRemote` 는 적재 없음. `transaction()` 의 테이블 목록에 두 테이블 추가.
- [ ] **아웃박스 전수 계약 테스트**(memory·indexeddb 공용): `WRITES = { todos.upsert, categories.upsert, …, dataset.write, dataset.restore } satisfies Record<WriteName, WriteCall>` — `WriteName` 은 `Repositories` 의 모든 `upsert` + dataset 두 메서드에서 **타입으로 파생**(ADR-0007 규칙 6 방식) → 새 저장소가 생기면 컴파일 에러. 각 쓰기 뒤 `listOutbox` 에 그 id 가 있고, `applyRemote` 뒤에는 **없다**. 픽스처는 테이블당 ≥2건 + 툼스톤 1건(빈 배열 단언 금지).
- [ ] `existingIds`: 살아 있는 id·툼스톤 id 둘 다 포함, 없는 id 제외 — 세 부류를 한 호출로.
- [ ] `ackOutbox`: ack 이후 같은 로우가 다시 써졌으면 남는다(버전/시퀀스 비교) — "ack 가 새 변경을 지운다" 회귀 고정.
- [ ] 메모리 `SyncTransport` = 인메모리 서버: `applyServerRules` 사용, 사용자별 seq 발급, `device_id` 제외 풀, 500 건 페이지·`more`, `gcFloor`/`resync`. **`server-rules.vectors.ts` 를 트랜스포트 단에서 다시 돌린다**(같은 벡터, 다른 계층).
- [ ] `container.ts` 에 `sync`·`syncTransport`; `setup.ts` 주입; `providers.test.tsx` 가 조립을 고정.
- [ ] `write-plan.ts` diff 0줄(리뷰 체크리스트 항목).
- [ ] 돌연변이: (1) `put` 의 아웃박스 적재 삭제 → 전수 계약 테스트 7+2 케이스 빨강; (2) `putRemote` 가 적재하도록 → "applyRemote 는 큐에 안 넣는다" 빨강; (3) `existingIds` 에서 툼스톤 필터 적용 → 빨강.
      verify: vitest(fake-indexeddb 포함) 100 %. 자격증명 무관.
```

### T-93 — Worker + D1 + 인증 + 배포 배선

```markdown
---
id: T-93
title: Cloudflare Worker — 구글 OAuth·세션·/api/sync·D1 스키마·wrangler·배포
type: feature
branch: feature/sync-worker
worktree: .worktrees/sync-worker
spec: docs/specs/sync.md
owns:
  - worker/** # 신규: index.ts, router.ts, auth/{provider,google,stub,session,cookies}.ts, sync/{handler,validate}.ts, db/{user-db,entities,migrations/0001_init.sql}.ts, AGENTS.md, *.test.ts
  - wrangler.jsonc, tsconfig.json(exclude worker), tsconfig.worker.json
  - package.json # scripts: typecheck(+worker), db:migrate:local, db:migrate:remote, test:worker; devDependencies(⑦-1 승인 후)
  - .env.example, .dev.vars.example
  - scripts/deploy.sh # 배포 전 `wrangler d1 migrations apply tasky --remote` + `wrangler secret list` 로 두 시크릿 존재 확인(없으면 rc=1)
  - scripts/check-worker-sql.sh, scripts/check.sh(스텝 추가), scripts/check-dist.mjs(AUTH_STUB 부재·run_worker_first 두 패턴 확인)
  - .github/workflows/deploy.yml # 마이그레이션 스텝
  - eslint.config.mjs # files:['worker/**'] 블록(허용 import: worker/**, @/domain/**, @/lib/**) — T-91 의 블록과 다른 위치
  - vite.config.ts # server.proxy /api,/auth → 8787
reads: [ADR-0018, SYNC_CREDENTIALS_GUIDE.md, src/domain/sync/wire.ts, src/domain/backup/validate-rows.ts]
depends_on: [T-91] # T-92 와 병렬(파일 서로소)
model: opus
size: L
---

## 완료 조건

- [ ] `wrangler.jsonc` ②-1 그대로. `pnpm run deploy:dry-run` 이 Worker 번들+D1 바인딩을 해석(자격증명 불필요).
- [ ] D1 `0001_init.sql` ②-2. `pnpm db:migrate:local` 로 로컬 적용.
- [ ] `/auth/login`·`/auth/callback`·`/auth/logout`·`/api/me`·`/api/sync` ②-3 계약. 세션 ②-4(HMAC + sessions 행). 쿠키 속성 테스트(HttpOnly·Secure·SameSite=Lax·Path=/·Max-Age).
- [ ] `IdentityProvider` 스텁: 선택 조건 2중 가드 + 부정 테스트 2건(②-4).
- [ ] 로우 검증이 `validate-rows` readers 매핑(`satisfies Record<SyncTable,…>`)을 통과 — 알 수 없는 필드 제거 확인, 형식 오류는 그 로우만 `invalid`.
- [ ] **격리 계약 테스트**(②-5 3항) + `check-worker-sql.sh` 통과. seq 단조·배치 내 유일 테스트(500건 배치 → 500개 서로 다른 seq, 오름차순).
- [ ] `server-rules.vectors.ts` 를 **실 D1 위에서** 세 번째로 돌린다(도메인·메모리 서버·D1 — 같은 벡터 파일).
- [ ] CSRF: 헤더 없는 POST → 403. 본문 2 MB 초과 → 413. `resync` 응답 경로(devices 90일 규칙) 테스트.
- [ ] `deploy.sh`: 시크릿 부재 시 rc=1 메시지("wrangler secret put GOOGLE_CLIENT_SECRET / SESSION_SECRET"). 조용히 건너뛰지 않음.
      verify:
  - 자격증명 없이: 핸들러 단위 테스트, 로컬 D1(vitest-pool-workers 또는 `wrangler dev` 위 HTTP) 계약 테스트, 스텁 로그인으로 `/api/me`→`/api/sync` 왕복, dry-run 배포.
  - **사용자 로컬에서만**: 구글 실제 동의 화면 → 콜백 → 세션(가이드 §7-2 절차 + `.dev.vars` 의 실제 시크릿), `wrangler secret put` 2건, `db:migrate:remote`, 실제 배포 후 `https://<DEPLOY_URL>/api/me` 401 확인. PR 본문에 "미검증: 구글 실왕복" 을 **명시**한다(거짓 보고 금지).
```

### T-94 — 클라이언트 엔진 + 로그인 게이트 + 업로드 다이얼로그 + 상태 UI + e2e

```markdown
---
id: T-94
title: 동기화 엔진·AuthGate·LoginScreen·UploadDialog·SyncStatus·트리거·e2e
type: feature
branch: feature/sync-client
worktree: .worktrees/sync-client
spec: docs/specs/sync.md
owns:
  - src/features/sync/** # 신규(AGENTS.md, index.ts)
  - src/app/page.tsx # <AuthGate> 마운트
  - src/app/providers.tsx # http-transport·indexeddb sync 조립, 엔진 start/stop
  - src/features/shell/components/ShellSidebar.tsx, ShellSidebar.test.tsx # 하단 계정 블록(이메일·상태·로그아웃) — ⑥-3
  - src/features/shell/components/ShellHeader.tsx # useSummaryRevision 에 sync dataRevision 합산
  - src/features/backup/index.ts # (필요 시) planImport 래퍼 재export — 없으면 도메인 직접 import 로 대체하고 이 줄 삭제
  - tests/e2e/sync.spec.ts, tests/e2e/smoke.spec.ts(로그인 선행 스텝 추가), playwright.config.ts(AUTH_STUB=1 로 webServer 기동)
  - README.md §"계정도 서버도" 문단(ADR-0015 결과 1 — T-77 caveat 를 확정 문장으로)
reads:
  [
    ADR-0018,
    docs/specs/sync.md §2·§5,
    docs/specs/app-shell.md 다이얼로그 패턴,
    src/features/backup/store/backup-actions.ts(runImport·reloadViews),
  ]
depends_on: [T-92, T-93]
model: opus
size: L
---

## 완료 조건

- [ ] `sync-engine.ts`: ③-3 사이클·트리거·디바운스·`more` 루프·격리(③-4)·`resync` 처리. 단위 테스트는 메모리 트랜스포트로 **두 엔진 인스턴스 = 두 기기**를 만들어: (a) A 쓰기 → B 풀에 보임 (b) 동시 편집 → 나중 푸시가 이김(R4) (c) 오프라인 큐 → 온라인 후 순서대로 올라가고 상태가 바뀜(R6) (d) 슬롯 id F1 시나리오 → 로우 1개 (e) F2 → 중지 유지 (f) 삭제→다른 기기 채우기→삭제 유지.
- [ ] `AuthGate` R1·R6·R8·사용자 전환 wipe(③-5) — 테스트 4상태.
- [ ] `UploadDialog` R7: 초기 포커스·Esc·포커스 복원(app-shell 패턴), 개수 문구, 올리기 = planImport('merge') 경로.
- [ ] `SyncStatus` 아이콘+텍스트 3상태(§5), 대기 건수.
- [ ] 진입 청크 gzip 예산 확인(`check-dist.mjs` 기존 검사) — 엔진은 지연 청크.
- [ ] e2e(`wrangler dev` + `AUTH_STUB=1`, 실 Worker·로컬 D1): 두 **브라우저 컨텍스트**(⑥-10)로 스텁 로그인 → A 에서 카테고리·투두 생성 → B 포커스 이벤트 → 30 s 기다리지 않고 `visibilitychange` 디스패치 → B 에 보임 / B `context.setOffline(true)` 에서 체크 → 상태 "오프라인 · 대기 1건" → 온라인 → "동기화됨" / `GET /api/me` 무쿠키 = 401 JSON(SPA 폴백 아님 — 위험 5).
- [ ] 돌연변이: (1) 엔진에서 풀→푸시 순서를 바꿈 → (d) 빨강; (2) `dataRevision` 증가 삭제 → "B 화면 갱신" 빨강; (3) AuthGate 의 오프라인 분기 삭제 → R6 테스트 빨강.
      verify: vitest 전부 + e2e(스텁) 자격증명 무관. **사용자 로컬**: 실제 구글 로그인 후 폰·웹 두 기기 왕복 1회(sync.md §7 시나리오를 손으로) — PR 본문에 미검증 항목 명시.
```

### T-95 — 문서 마감(README·product-overview·CLAUDE.md 상태·개인정보 안내)

owns: `README.md`, `docs/specs/product-overview.md`, `CLAUDE.md`(현재 상태 블록만), `docs/development.md`, `public/privacy.html`(⑦-7 결정 후). depends_on: [T-94]. verify: 문서.

---

## ⑤ 위험 5선과 회귀 고정

"테스트가 통과하는데 기능이 깨져 있다" 를 만드는 패턴은 Phase 2 실측상 넷이었다 — (i) 가짜가 항상 성공, (ii) 빈 배열끼리 같다고 단언, (iii) 마운트 누락(전부 구현·테스트 통과·화면에 없음), (iv) 계층마다 규칙 사본. 아래 각 위험에 그 패턴을 막는 장치를 **하나씩** 붙였다.

| #   | 깨지기 쉬운 지점                                                                            | 깨지면                                                            | 고정 방법                                                                                                                                                                                  | 막는 패턴 |
| --- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 1   | **아웃박스 누락** — 새 쓰기 경로(새 저장소, `restore`, 되돌리기)가 큐를 안 탄다             | 그 기기의 변경이 영원히 안 올라감(조용)                           | `WRITES satisfies Record<WriteName, …>` 전수 매핑(T-92) — 이름은 `Repositories` 타입에서 파생. + 돌연변이 (1)                                                                              | (ii)(iv)  |
| 2   | **멀티 사용자 격리** — `sub` 바인딩 빠진 SQL 한 줄                                          | 남의 데이터가 보인다                                              | `UserDb` 구조(핸들러가 sub 를 모름) + `check-worker-sql.sh` + 실 D1 두 사용자 계약 테스트(T-93)                                                                                            | (i)       |
| 3   | **서버 규칙 사본 갈림** — Worker 와 메모리 가짜 서버가 다르게 판정                          | 단위 테스트 초록, 실서버 빨강(중복·덮어쓰기)                      | `applyServerRules` 한 함수 + `server-rules.vectors.ts` **한 파일을 세 계층(도메인·메모리·D1)에서 실행**                                                                                    | (i)(iv)   |
| 4   | **슬롯 id·풀 순서** — 채우기가 첫 풀보다 먼저 돌거나 id 가 기기마다 다르게 나옴             | 루틴 인스턴스 중복·완료 상태 소실                                 | 두 엔진 시나리오 (d)(e)(f)(T-94) + `slot-id` 고정 벡터(다른 런타임에서 같은 값 — Worker 테스트에서도 같은 벡터 실행) + 돌연변이 "풀→푸시 순서"                                             | (ii)      |
| 5   | **라우팅·SW** — `/auth/*`·`/api/*` 가 SPA 폴백(index.html)이나 서비스워커 프리캐시로 떨어짐 | 로그인 콜백이 흰 화면, `/api/sync` 가 HTML 을 받아 JSON 파싱 실패 | `check-dist.mjs`: `run_worker_first` 두 패턴 존재·`AUTH_STUB` 부재; e2e: 무쿠키 `/api/me` = 401 JSON(`content-type: application/json`), `/auth/callback?code=x&state=bad` = 302(HTML 아님) | (iii)     |

**돌연변이 시험을 거는 자리(총 10곳, 각 티켓 완료 조건에 줄 단위로 적었다)**: server-rules 판정 1줄 · client-merge `rev===1` 1줄 · slotId date 1줄 · fill `existingIds.has` 1줄 · `put` 적재 1줄 · `putRemote` 1줄 · `existingIds` 툼스톤 1줄 · 엔진 순서 1줄 · `dataRevision` 1줄 · AuthGate 오프라인 1줄. 도구 없이 손으로 하는 이유: Stryker 류는 의존성 추가(§7-9)이고, 10줄이면 손이 더 싸다. PR 본문에 "돌연변이 10/10 빨강 확인" 을 적고 리뷰어가 무작위 2개를 재현한다.

**추가 규칙 세 줄(agent-collaboration.md 에 T-90 이 넣는다)**

- 계약 테스트의 목록 단언은 **기대값이 비어 있으면 안 된다**(`expect([]).toEqual([])` 금지 — 리뷰 Blocker). 빈 상태를 검증할 때는 "채운 뒤 비운다" 로.
- `*.contract.ts` 에 `it.skip`·`test.todo` 금지(`check.sh` grep 스텝 — T-93 에 같이).
- 가짜 구현(트랜스포트·제공자)은 **실 구현과 같은 벡터 파일**을 통과해야 존재할 수 있다.

---

## ⑥ sync.md·ADR 과 어긋나는 지점 (스펙을 의심하며 읽은 결과)

| #   | 위치                                                                          | 문제                                                                                                                                                                                             | 처리                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ADR-0015 §2 "서버가 발급한 단조 증가 `rev`", sync R4 "서버 `rev` 기준"        | `Meta.rev` 는 클라이언트가 `touch` 마다 +1 하고 계약 테스트 7파일이 `saved.rev === e.rev + 1` 을 단언한다. 서버가 `rev` 를 발급하면 `touch` 규약·백업 왕복 동일성(R2)·`adopt` 검증이 전부 깨진다 | **별도 `seq`**(로우 밖). ADR-0015 한 줄 정정(T-90)                                                                                                                                                                        |
| 2   | sync R7 "그대로 두기"                                                         | 서버가 진실(R3)인데 로컬에만 있는 로우를 "그대로" 두면 화면에는 보이고 서버에는 영영 없는 유령 상태가 된다. 그 뒤 올릴 방법도 없다                                                               | ⑦-2 사용자 결정. 권고: "그대로 두기" = **백업 파일로 내보낸 뒤 이 기기에서 지운다**(backup R10 경로 재사용, 파일이 남으니 "말없이 버리지 않는다" 충족)                                                                    |
| 3   | sync §2 "설정(마이페이지) 화면"                                               | 앱에 설정/마이페이지 화면이 **없다**(grep 0건). 테마·백업은 사이드바/팔레트 진입                                                                                                                 | 사이드바 하단 "계정 블록"(이메일·상태·로그아웃)으로 확정(T-94 owns `ShellSidebar.tsx`) — 새 화면을 만들지 않는다                                                                                                          |
| 4   | sync R1 "세션이 없으면 아무 화면도" vs R6 "오프라인에서도 세션이 살아 있으면" | 세션 쿠키는 HttpOnly 라 JS 가 **볼 수 없다**. 오프라인에서 "세션이 있다" 는 판단은 로컬 표식(`syncState.userSub`)으로만 가능하고, 그 표식은 서버 만료를 모른다                                   | R1 을 "로컬 표식이 있고, 온라인이면 `/api/me` 확인" 으로 재서술(T-90). 만료된 채 오프라인 사용 → 온라인 복귀 시 401 → 로그인 화면, 로컬 변경은 아웃박스에 남아 같은 sub 재로그인 뒤 올라간다                              |
| 5   | ADR-0017 S5                                                                   | 중지 상태에서 "채웠어야 할 구간" 은 R7 과 반대. 오진                                                                                                                                             | ①-2. `planMergeRoutines`·S5 테스트 삭제, ADR-0017 정정                                                                                                                                                                    |
| 6   | sync R3 "화면·컴포넌트 코드는 바뀌지 않는다"                                  | 로그인 화면·업로드 다이얼로그·상태 표시·게이트는 **새 화면 코드**고, 풀 뒤 재조회 신호가 `ShellHeader` 에 한 줄 들어간다                                                                         | "**기존** 화면 코드는 바뀌지 않는다(마운트 지점 2파일 제외)" 로 정정                                                                                                                                                      |
| 7   | backup R7 "교체" ↔ sync R3                                                    | 로그인 상태에서 교체(물리 삭제)하면 파일에 없는 로우가 로컬에서만 사라지고 툼스톤이 없어 서버에는 남는다 → 다음 풀에 **되돌아온다**. 교체가 "안 먹는" 것처럼 보인다                              | ⑦-3 사용자 결정. 권고: 로그인 상태에서는 교체 모드 **비활성**(병합만). 대안(파일에 없는 로우를 툼스톤화)은 `planImport` 에 `now` 주입이 필요해 순수성 시그니처 변경                                                       |
| 8   | ADR-0015 §5 / sync R7 첫 로그인                                               | 같은 브라우저에 **다른 사용자**가 로그인하는 경우가 없다. 이전 사용자 데이터를 새 계정에 올리는 경로가 생긴다                                                                                    | ③-5: `userSub` 가 다르면 `wipe()`, 다이얼로그는 `userSub` 가 빈 경우에만                                                                                                                                                  |
| 9   | backup R10 `Settings.lastBackupAt`                                            | `settings` 를 동기화하면 다른 기기의 내보내기 시각이 이 기기 경고 점을 끈다. R10 이 "확인 비트는 기기별" 로 이미 반쯤 막아 뒀지만 `lastBackupAt` 자체는 넘어온다                                 | 감수(로그인 필수 제품에서 백업 경고의 의미가 약해졌다). ADR-0018 감수하는 점에 적고 후속                                                                                                                                  |
| 10  | sync §7 "R4 는 두 탭으로"                                                     | 두 탭은 같은 IDB·같은 쿠키·같은 `deviceId` = **같은 기기**. 충돌 시나리오가 아니다                                                                                                               | e2e 는 두 **브라우저 컨텍스트**(저장소 분리)로. sync.md §7 문구 정정(T-90)                                                                                                                                                |
| 11  | sync R2 "리다이렉트 후 자동 복귀"                                             | iOS 홈 화면 PWA(standalone)에서 외부 리다이렉트는 Safari 로 튀어 앱으로 안 돌아오는 경우가 있다(알려진 플랫폼 한계)                                                                              | 모순은 아님. 위험으로 기록, 실기기 확인은 사용자 몫(T-94 미검증 항목)                                                                                                                                                     |
| 12  | ADR-0015 결과 4 "DO 바인딩"                                                   | #98 에서 정정됨                                                                                                                                                                                  | 없음                                                                                                                                                                                                                      |
| 13  | 이 설계 문서 §0-5·①-1·①-5·②-2·②-3 (2026-09-20 최초판)                         | 갱신 충돌 판정을 "서버 `seq` 도착 순 단독"으로 적어, ADR-0015 §2 의 2026-09-21 정정(ADR-0005 의 `updatedAt` LWW 를 supersede 하지 않는다로 되돌림)을 이 설계 문서가 반영하지 못한 채 남아 있었다 | 위 다섯 절을 **updatedAt LWW + 동률 시 도착 순 + 미래 시각 클램프**(ADR-0005 그대로)로 정정(각 절에 "정정(2026-09-21)" 표시). `seq`는 델타 풀 커서 + 동률 타이브레이크로 축소. `wire.ts` `rejected` 사유에 `'stale'` 추가 |

---

## ⑦ 사용자 결정이 필요한 항목

1. **devDependency 추가 승인**(§7-9): `@cloudflare/workers-types`(타입만, 필수) · `@cloudflare/vitest-pool-workers`(vitest 안에서 로컬 D1 — 격리 계약 테스트를 vitest 로 돌리려면 필요. 거부 시 `wrangler dev` 위 HTTP 테스트로 대체 가능하나 `pnpm test` 밖으로 빠진다). 런타임 의존은 **0**(JWT·쿠키·HMAC 전부 WebCrypto/직접 구현).
2. **"그대로 두기" 의 의미**(⑥-2). 권고: 내보내기 → 로컬 삭제.
3. **로그인 상태의 백업 "교체" 모드**(⑥-7). 권고: 비활성(병합만).
4. **세션 수명** 30일 슬라이딩(권고) vs 짧게. 로그아웃 시 로컬 캐시 유지(권고 — 같은 sub 재로그인이 흔하고 오프라인 R6 과 맞물림) vs 삭제.
5. **폴링 30 s**(③-3 근거). 10 s 로 내려도 무료 한도 12 %.
6. **계정 삭제·데이터 내보내기 API**(sync §6 범위 밖) — 이번 Phase 에서 뺄지. 권고: `POST /api/account/delete`(users 행 삭제 → CASCADE) 하나만 T-93 에 추가(20줄) — 법적 의무 대비.
7. **구글 앱 게시·개인정보 처리방침 URL**(가이드 §9): 테스트 사용자 100명 제한은 개인 사용엔 무관. 처리방침 정적 페이지(`public/privacy.html`)를 T-95 에서 만들지.
8. **커스텀 도메인**: 있으면 리디렉션 URI 를 구글 콘솔에 추가해야 한다(코드 변경 없음, `wrangler.jsonc` routes 만).
9. `fillFloor` **이름 변경 승인**(①-2 대가) — 이름 유지 시 변환 0건이지만 의미 오독 위험. 권고: 변경.

---

## 부록 A. 첫 사이클 순서도(문장)

로그인 성공 → `AuthGate` 통과 → `syncState.userSub` 저장 → (첫 로그인이면 UploadDialog) → **전량 풀**(`cursor=0`, `more` 루프) → `applyRemote` → `dataRevision++` → 채우기 허용(`materializeRoutines`) → 아웃박스 푸시(1.5 s) → 30 s 주기.

## 부록 B. 진입 청크·요청 수 예산 요약

- 진입 청크: **작성 시점 130,752 B → #127 기준 148,976 B**(예산 150,000 B, 여유 1,024 B). +≈2.5 kB(로그인 화면·게이트)를 그대로 더하면 **예산을 넘는다** — §③-5 의 주의 참고. 엔진·다이얼로그·트랜스포트는 지연 청크.
- 요청: 3기기 ≈ 4k/일(무료 10만의 4 %). D1: 읽기 ≈ 4k/일, 쓰기 ≈ 사용자 쓰기 수(무료 10만/일).
- 테스트 규모 추정: T-91 ≈ 70건, T-92 ≈ 60건(계약 2×), T-93 ≈ 50건, T-94 ≈ 40건 + e2e 1스펙 → 작성 시점 2,014건 대비 +11 %(#127 기준 실제 테스트 수는 2,820건이고 T-91·T-92 가 이미 들어가 있으므로 남은 증가분은 T-93·T-94 몫뿐이다).
