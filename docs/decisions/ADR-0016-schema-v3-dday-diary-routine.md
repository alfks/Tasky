<!-- 읽기 조건: IndexedDB 스키마 버전을 올리거나, `ddays`·`diaryEntries`·`routines` 테이블을 손대기 전. 테이블을 그냥 읽고 쓸 때는 ADR-0002·0007로 충분. -->

# ADR-0016: 스키마 v3 — `ddays`·`diaryEntries`·`routines` 테이블 신설

- 상태: accepted
- 날짜: 2026-09-20
- 관련: 티켓 T-78~T-81, ADR-0011(같은 모양의 선례), ADR-0005, ADR-0007, docs/specs/calendar.md §4, docs/specs/diary.md §4, docs/specs/routine.md §4

## 맥락

Phase 2 스펙 3개(calendar.md·diary.md·routine.md, 전부 `approved`)가 각각 새 저장 엔티티를 도입한다 — `Dday`(D-day), `DiaryEntry`(다이어리), `Routine`(무기한 반복 규칙). 셋 다 `Meta`(ADR-0005)를 갖는 평범한 엔티티고 필드 형태는 각 스펙 §4가 이미 확정했다. IndexedDB에 테이블을 신설하는 것은 스키마 버전업이라 ADR이 필요하다(`docs/decisions/AGENTS.md` "ADR이 필요한 변경"). 현재 `DB_VERSION = 2`(`src/infra/indexeddb/db.ts`, ADR-0011)이고 테이블은 `todos`·`categories`·`settings`·`focusSessions` 넷이다.

세 스펙이 거의 동시에 approved됐고 셋 다 기존 로우를 건드리지 않는 순수 신설이라, ADR-0011이 이미 밟은 "빈 스토어 신설, `.upgrade()` 없음" 경로를 그대로 세 번 반복하는 대신 한 버전(v3)에 묶는다 — ADR-0011 결정 4의 근거("버전업 비용은 한 번뿐이므로 한 번에 맞춘다")와 같다.

## 결정

**`db.version(3)`를 추가해 `ddays`·`diaryEntries`·`routines` 테이블을 신설한다. `version(1)`(`STORES_V1`)·`version(2)`(`STORES_V2`로 이름을 바꿔 보존) 블록은 수정하지 않는다.**

1. **인덱스**는 각 스펙의 조회 메서드가 실제로 쓰는 것만 넣는다(TECH_PLAN §8, 과설계 방지) — **ADR-0011 결정 4를 그대로 가져오지 않는다**: 그 결정은 TECH_PLAN §5·ARCHITECTURE §4가 이미 선언해 둔 인덱스를 코드가 따라잡은 것이지만, 이 세 엔티티는 ARCHITECTURE.md §4(MVP 데이터 모델, Phase 2 확장 전이라 의도적으로 비어 있다)에 선행 선언이 없다 — "선언을 따라잡는다"는 근거가 성립하지 않으므로 실제 조회 없는 인덱스는 넣지 않는다.
   - `ddays: 'id'` — `list()`는 전량 조회 후 메모리 정렬(calendar.md R2, 최대 50개라 인덱스 없이도 예산 안). `date`·`updatedAt` 둘 다 지금 쓰는 조회가 없어 뺀다.
   - `diaryEntries: 'id, date'` — `getByDate(date)`가 `date`로 조회한다(diary.md §4, 실제 조회 있음). **유일 인덱스(`&date`)로 만들지 않는다** — 소프트 삭제 툼스톤이 같은 `date` 값을 들고 남기 때문에(ADR-0002·0007), DB 레벨 유일성은 새 항목 생성을 막아버린다. 하루 1개 유일성(diary.md R1)은 다른 엔티티들과 같은 방식으로 애플리케이션 레벨에서 지킨다. `updatedAt`은 쓰는 조회가 없어 뺀다.
   - `routines: 'id, active'` — `list({ includeInactive })`가 기본적으로 `active`로 거른다(routine.md §4, 실제 조회 있음). `updatedAt`은 쓰는 조회가 없어 뺀다.
2. **`todos` 테이블은 건드리지 않는다.** `Todo.routineId?`(routine.md §4)는 인덱스 없는 필드 추가라 버전업 대상이 아니다(`db.ts` 주석 "인덱스에 없는 필드는 버전업 없이 추가할 수 있다"). 루틴 지연 생성의 중복 방지(`(routineId, date)`, routine.md §4)는 date-strip이 이미 읽어 둔 날짜 범위 결과(메모리)에 대해 판정하지, `routineId`로 `todos`를 다시 조회하지 않는다 — 그러므로 `todos`에 `routineId` 인덱스가 필요 없다. **이것은 단일 기기 기준의 안전 판단이다** — ADR-0015(accepted)가 구글 로그인 필수·준실시간 동기화를 이미 확정했으므로, 두 기기가 같은 미생성 구간에 동시에 들어가 각자 "없음"을 보고 같은 `(routineId, date)`를 중복 생성할 경합이 sync 구현 시점에 현실적으로 생긴다 — 지금은 DB 레벨 제약(복합 유일 인덱스) 없이 애플리케이션 레벨 dedup만으로 두고, 그 경합은 sync 구현 티켓에서 다시 본다(§재검토 트리거). "이 루틴이 만든 투두 전부 보기" 같은 별개 조회 필요도 마찬가지로 미룬다.
3. **`.upgrade()` 콜백을 달지 않는다.** 세 변경 모두 **기존 로우의 값을 바꾸지 않는다** — 테이블 신설 셋은 빈 스토어를 만들 뿐이다(ADR-0011 결정 2와 같은 근거). `migration.test.ts`에 v2→v3 케이스를 추가해, v2로 넣은 데이터가 v3에서도 그대로 읽히는지 단언한다.
4. **`STORES_V2`를 신설해 지금의 `STORES`(v2 내용)를 보존한다.** 지금 `STORES`라는 이름은 "현재" 스키마를 가리키는데, v3가 생기면 그 이름은 v3 내용으로 바뀐다 — v1→v2 마이그레이션 테스트가 참조하던 `STORES`가 조용히 v3로 바뀌면 그 테스트가 실은 v1→v3를 재현하게 된다(ADR-0011의 `STORES_V1` 보존과 같은 이유, 규칙 1을 두 세대로 일반화).

## 대안과 기각 이유

| 대안                                                                                 | 기각 이유                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 세 스펙마다 버전업을 따로(v3·v4·v5)                                                  | 셋 다 같은 모양(빈 테이블 신설, `.upgrade()` 없음)이라 세 번 반복해도 얻는 것이 없고, 마이그레이션 테스트 케이스만 3배로 는다                                                                                                                                                                                                                                      |
| `diaryEntries.date`를 유일 인덱스로                                                  | 소프트 삭제 툼스톤이 같은 `date`를 들고 남아(ADR-0002·0007) 재작성을 막는다 — diary.md R1의 유일성은 애플리케이션 레벨이 맞다                                                                                                                                                                                                                                      |
| `todos`에 `routineId` 인덱스 선제 추가                                               | 지금 쓰는 조회가 없다(§결정 2) — `categories`의 `status`·`updatedAt`과 달리 이건 "문서가 이미 선언한 스키마"가 아니라 추측성 추가                                                                                                                                                                                                                                  |
| 세 테이블을 `version(2)`에 덧붙임                                                    | 배포 전이라 당장은 동작하지만 "기존 버전 블록 수정 금지"(ADR-0011 결정 1이 세운 규칙)를 어긴다                                                                                                                                                                                                                                                                     |
| `routines.active`를 `inactiveAt`(타임스탬프, 없으면 undefined) 로 바꿔 인덱스를 살림 | 희소 인덱스라 **비활성인 것만** 잡힌다 — routine.md R7이 필요로 하는 것은 "활성만" 조회인데, `inactiveAt`으로는 그 보완집합(활성 전체)을 인덱스로 얻을 수 없다(정정, T-79 실측)                                                                                                                                                                                    |
| `routines.active`를 `0\|1`(숫자) 로 바꿔 인덱스를 살림                               | 인덱스 자체는 살지만 routine.md §4가 이미 확정한 `Routine.active: boolean` 도메인 타입을 바꾸는 일이라 T-79 owns 밖이다. 게다가 `list({ includeInactive })`는 어차피 전량을 읽어 `active`를 메모리에서 거르므로(정정 §문단, `liveAll`) 인덱스가 있어도 실제로 버는 것은 "읽는 행 수"뿐이다 — 지금 규모(수십 건)에서 그 이득이 타입을 깨는 비용을 정당화하지 못한다 |

## 결과

- 좋은 점: `Dday`·`DiaryEntry`·`Routine` 세 도메인 타입 모두 저장 위치를 갖는다. 마이그레이션 경로(v2 픽스처 → v3 열기 → 단언)가 ADR-0011의 본보기를 그대로 재사용한다.
- 감수하는 점: `STORES_V1`·`STORES_V2` 두 상수가 앱 코드에서는 안 쓰이고 마이그레이션 테스트만 쓴다 — ADR-0011이 예고한 "세 개를 넘으면 `stores-history.ts`로 분리"가 이제 해당한다(재검토 트리거로 남긴다).
- 측정한 것/측정하지 않은 것: ADR-0011과 동일 — fake-indexeddb에서 재색인을 확인하고, 실제 브라우저 엔진 확인은 E2E 몫이다.

## 지켜야 할 규칙 (검증 가능한 문장 — 리뷰 판정 근거)

1. `STORES_V1`·`STORES_V2`와 `db.version(1)`·`db.version(2)` 블록은 수정하지 않는다. 스키마 변경은 `version(3).stores(...)` 추가로만 한다.
2. 이 버전업 PR은 ADR + `db.ts`(세 테이블 스토어 문자열 **한 번에**) + 마이그레이션 테스트(v2 픽스처 → v3 열기 → 단언)를 함께 담는다. **셋을 나눠서 순서대로 `db.ts`를 고치지 않는다** — `version(3)` 블록은 머지되는 순간 v1·v2처럼 불변이 되므로, 먼저 머지된 PR이 `ddays`만 넣은 v3를 배포하면 뒤이은 PR은 `diaryEntries`·`routines`를 더하기 위해 v4·v5를 새로 열어야 해 §결정의 "한 버전에 묶는다"는 전제가 깨진다. 그래서 `db.ts`·마이그레이션 테스트는 **이 ADR을 accepted로 올리는 것과 같은 PR(T-78)** 에서 세 테이블을 동시에 선언한다 — 세 스펙의 도메인·저장소·화면 구현(T-79~T-81)은 그 뒤에 빈 테이블 위에서 각자 진행한다.
3. `.upgrade()`를 생략하므로 "기존 로우의 값을 바꾸지 않는다"를 마이그레이션 테스트로 보여야 한다.
4. `diaryEntries.date`에 유일 인덱스(`&date`)를 걸지 않는다(§결정 1).
5. `todos` 테이블 스토어 문자열은 이 버전업에서 바뀌지 않는다(§결정 2).

## 정정 (T-79, `version(3)` 블록이 불변이 되기 전에 바로잡음)

`routines`의 인덱스 선언을 §결정 1의 원문 `'id, active'`에서 **`'id'`** 로 정정한다. IndexedDB는
boolean 값을 색인 키로 쓸 수 없다(`Routine.active: boolean`) — 그 상태로 열면 죽은 인덱스가 되고
`where('active')` 조회는 런타임 `DataError`로 죽는다. `version(3)` 블록은 머지되는 순간 v1·v2처럼
불변이 되므로(§결정 4의 근거와 같다) 실제로 열리기 전인 지금 고친다. `list({ includeInactive })`는
전량을 읽고 메모리에서 `active`로 거른다 — 루틴은 수십 건 규모라 예산 안이며, §결정 1이 이미 같은
논리로 `ddays`·`routines`에 조회 없는 인덱스를 넣지 않기로 한 것의 연장이다.

**정정 2 (T-79 리뷰 라운드 1 Major-4).** `BACKUP_SCHEMA_VERSION`(`backup-document.ts`)이 `DB_VERSION`을
따라 3으로 오르지만, 지금 내보내는 v3 백업 파일에는 **`ddays`·`diaryEntries`·`routines` 세 배열이 아예
없다** — 세 테이블 신설은 아직 백업 payload에 들어가지 않는다(T-86 범위, `migrateV2ToV3`는 항등 함수).
**같은 `schemaVersion: 3` 이 "세 배열이 없는 파일"과 "세 배열이 있는 파일" 양쪽을 다 가리킬 수 있다는
뜻이다** — 이 모호성은 스키마 버전 번호만으로는 풀리지 않는다. T-86이 이 세 배열을 실제로 읽게 될
때, `validate-backup.ts#readDocument`는 **`readRows(body['ddays'], …)`처럼 배열이 있다고 가정해서는
안 된다** — 그러면 지금 이미 배포된 내보내기가 만든 v3 파일이 `asArray(undefined, …)` → `SHAPE_INVALID`
로 가져오기를 거부당한다. 대신 **`body['ddays'] ?? []`**(없으면 빈 배열)로 읽어야 한다. 그리고 이것은
**마이그레이션 단계(`migrate-backup.ts`)로 고칠 수 있는 문제가 아니다** — `STEPS`는 시작 버전으로만
키를 잡으므로 "3→3" 변환 단계를 둘 자리가 없고, 애초에 같은 버전 번호 안에서 모양이 갈리는 문제라
버전을 하나 올리는 방식의 마이그레이션으로는 표현할 수 없다. 회귀 테스트로
`migrate-backup.test.ts`(리뷰 라운드 1 Major-4 대응 테스트)가 이 계약을 고정한다.

**T-86 완료 기록.** 위 정정이 예고한 대로 세 배열을 실제로 읽게 됐다 — `readDocument`는
`body['ddays'] ?? []` **그대로가 아니라** `body['ddays'] === undefined ? [] : body['ddays']` 로
읽는다(`??`는 명시적으로 들어온 `null`까지 "없음"으로 묻어 버려, 형식 오류여야 할 값이 조용히
빈 배열로 통과한다 — `validate-backup.test.ts` "routines 가 배열이 아님 → { routines: null }" 가
이 차이를 고정한다). `BACKUP_SCHEMA_VERSION`은 **올리지 않았다** — `DB_VERSION`과 반드시 같아야
한다는 계약(`backup-document.test.ts`)이 있고, 이번 변경은 IndexedDB 스키마(테이블 신설)를 새로
하지 않으므로 `DB_VERSION`을 올릴 이유가 없다. `ddays`·`diaryEntries`는 내보낼 때 툼스톤을 뺀다
(아무 배열도 그 id를 참조하지 않는다 — `todos`와 같은 판단). `routines`는 `categories`와 같은 자리에
있다 — 살아 있는 것 + 남은 `todos`가 `routineId`로 가리키는 툼스톤까지 싣는다(routine.md R10
"기록 보존"). `Routine.materializedThrough`(루틴 워터마크, ADR-0017)는 **그대로 싣는다** — 제외를
검토했으나 대안(초기값 재설정·투두에서 역산)이 모두 "복원했더니 투두가 중복되거나 지운 인스턴스가
부활한다"는 더 큰 위험을 낳아 기각했다(근거는 `validate-rows.ts` `ROUTINE_KEYS` 주석). 병합(R6)이
루틴 레코드와 투두를 따로 합치며 생기는 위험(ADR-0017 "감수하는 점")은 `plan-import.ts` 의
`planMergeRoutines` 가 병합에서만 워터마크를 "두 값 중 더 늦은 쪽"으로 고정해 막는다 — **역사적 기록
(더는 유효하지 않음, Nit, PR #121 리뷰): `planMergeRoutines` 는 ADR-0018 에서 필드가
`materializedThrough` → `fillFloor`(일반 필드)로 바뀌며 삭제됐다. 지금은 일반 `planMerge`
(newer-wins)가 이 필드도 병합한다.** 상세는
`docs/decisions/ADR-0017-routine-watermark-materialization.md` 재검토 트리거 항목과
`docs/decisions/ADR-0018-sync-local-schema-and-ports.md` §결정 4 를 본다.

## 재검토 트리거

- **sync.md(ADR-0015) 구현 착수 시 `(routineId, date)` 중복 생성 경합을 반드시 재검토한다**(§결정 2) — 두 기기가 같은 미생성 구간에 동시에 들어가면 애플리케이션 레벨 dedup만으로는 같은 인스턴스가 두 번 생길 수 있다. 그때 `[routineId+date]` 복합 유일 인덱스(조회용이 아니라 DB 레벨 제약용)를 v4에서 추가할지, 서버(D1) 쪽 유일 제약으로 해결할지 sync 구현 티켓에서 정한다.
- "이 루틴이 만든 투두 전부 보기" 같은 `routineId` 조회가 실제로 필요해질 때 → `todos`에 `routineId` 인덱스를 더하는 버전업(v4) 재검토(위 항목과 같은 버전업으로 묶일 가능성이 높다).
- **T-81이 루틴 N 대비 날짜 이동당 읽는 행 수를 실측하고, 필요하면 `[routineId+date]`와 함께 v4에서 `active`를 숫자 키(`0|1`)로 올린다**(위 §대안과 기각 이유의 `active: 0|1` 행 — 지금은 "어차피 전량을 읽는다"는 근거로 기각했지만, 실측이 그 전제를 깨면 재판단한다).
- `STORES_V*` 상수가 3개를 넘었다(ADR-0011이 예고한 지점) → `stores-history.ts`로 분리.
- sync.md(ADR-0015) 구현 착수 시 `listChangedSince(rev)`가 `rev` 인덱스를 요구하면 별도 버전업으로 추가(이 ADR의 범위 밖).
- ARCHITECTURE.md §4(데이터 모델)는 MVP 스코프라 의도적으로 이 세 엔티티가 없다 — Phase 2 구현 착수 시 그 표를 갱신할지는 별도 판단(이 ADR은 §4를 갱신하지 않는다).
- **PR 분할 보류의 기록**: T-79 리뷰 라운드 1이 "이 PR을 세 스펙(dday·diary·routine)별로 쪼개라"고 지적했다 — §결정 2의 "한 **버전**에 묶는다"는 규칙을 "한 **PR**에 묶는다"로 오독한 지적이었지만, 이미 `feature/routine-domain`이 이 PR(`feature/calendar-dday`) 위에 얹힌 뒤라 지금 쪼개면 그 하위 브랜치가 깨진다. 그래서 분할은 **다음 스키마 버전업(v4)** 으로 미룬다. 그 판단에 참고할 사실 하나: **커밋 `9117d99`(스키마 v3 테이블 선언) 단독으로는 타입체크가 깨진다** — `ddays`·`diaryEntries`·`routines` 도메인 타입은 그 뒤 커밋들(T-79~T-81)이 나눠 들여오므로, 이 PR은 커밋 단위 이분 탐색(`git bisect`)이 되지 않는다. 다음에 나눌 때는 "한 커밋이 곧 빌드 가능한 상태"를 버전업 PR에도 요구할지 여기서 다시 정한다.
