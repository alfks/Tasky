<!-- 읽기 조건: 동기화 로컬 스키마(아웃박스·`syncState`)·`SyncRepository`/`SyncTransport` 포트·루틴
슬롯 id·`fillFloor`를 만지기 전. 서버 판정·클라이언트 병합 축(`updatedAt` LWW)은 ADR-0005·ADR-0015 §2. -->

# ADR-0018: 동기화 로컬 스키마(v4) — 아웃박스·슬롯 id·`fillFloor`·포트 분리

- 상태: **accepted, 2026-09-21 정정(PR #121 리뷰 Blocker) 반영** — 아래 §결정 3·4, §감수하는 점,
  §지켜야 할 규칙 1·2 는 원안 그대로가 **아니다**. 맨 아래 "## 정정" 절을 먼저 읽는다.
- 날짜: 2026-09-21
- 관련: 티켓 T-92, ADR-0005(충돌 정책), ADR-0007(툼스톤 조회), ADR-0009(규칙 1 개정),
  ADR-0015(§2 LWW), ADR-0016(스키마 v3), ADR-0017(**partially superseded by ADR-0018**),
  docs/specs/sync.md, docs/specs/routine.md §4

## 맥락

T-91 이 동기화 판정 함수(순수)를 만들었지만 로컬 저장소·루틴 배선은 비어 있었다. 그 사이 실측된 세
위험(ADR-0017 §재검토 트리거)을 그대로 두면: (1) 두 기기가 같은 루틴 슬롯을 독립 생성하면 id 가 달라
중복이 남는다, (2) 배경 채우기가 루틴 로우를 `touch()` 하면 그 워터마크 전진이 동기화 아웃박스에
실려 다른 기기의 "중지" 를 LWW 로 덮을 수 있다, (3) 워터마크가 행 전체 LWW 를 타면 후퇴한다.

## 결정

**로컬 아웃박스(`syncOutbox`)·동기화 표식(`syncState`)을 IDB v4 로 열고, 서버 `seq` 와 로컬
`Meta.rev` 를 섞지 않으며(아웃박스 적재는 `deriveBaseSeq`, `outbox.ts`), 루틴 인스턴스 id 를
`(routineId, date)` 결정적 값(`routineInstanceSlotId`)으로 바꾸고, 워터마크를 사용자 조작으로만
바뀌는 하한 `fillFloor` 로 재정의해 채우기가 루틴 로우를 전혀 쓰지 않게 한다.**

1. **`syncOutbox: '[tbl+id]'`·`syncState: 'id'`** — 인덱스는 실제 쓰는 쿼리만(§B-4 실측, 과설계
   방지). `seq` 인덱스는 쓰는 쿼리가 없어 만들지 않는다.
2. **슬롯 id(F1 방어)**: `routineInstanceSlotId(routineId, date)`(`src/domain/routine/slot-id.ts`,
   FNV-1a 순수 산술)가 `createTodo` 의 `id` 를 결정한다 — 두 기기가 독립 생성해도 같은 id 라 서버의
   "생성은 없을 때만"(`server-rules.ts`)이 하나만 남긴다.
3. **`fillFloor`(F2 방어, 구 `materializedThrough`)**: "이 날짜 이하 슬롯은 만들지 않는다" 하한.
   **사용자 조작(생성·재개)으로만** 바뀐다 — `planRoutineFill` 은 더 이상 이 값을 옮기지 않는다.
   중복 방지는 `existingIds`(호출부가 넘기는, 살아 있든 툼스톤이든 이미 있는 슬롯 id 집합)로 옮겼다.
4. **F3(워터마크 후퇴) 방어**: `fillFloor` 가 일반 필드가 됐으므로 일반 newer-wins(`planMerge`)로
   충분하다 — 전용 병합(`planMergeRoutines`)·`watermark-merge.ts` 는 삭제한다.
5. **`adopt()` 둘째 호출처**: `src/domain/sync/remote-rows.ts#readRemoteRow` 가 검증된 원격 로우를
   `Persistable` 로 봉인한다 — ADR-0009 규칙 1 을 "`plan-import.ts` + `sync/remote-rows.ts` 둘" 로
   개정한다. 호출처 제한은 도구가 아니라 리뷰가 지킨다(`meta.ts` jsdoc).
6. **포트(`SyncRepository`/`SyncTransport`, `wipeLocal` 포함 물리 삭제 둘째 경로)와 실제 저장소
   구현·아웃박스 적재·`applyRemote`·풀·계정 삭제 왕복은 후속 티켓(T-92 뒷부분)이 배선한다** — 이
   결정은 그 인터페이스가 기댈 로컬 스키마·도메인 불변식만 지금 고정한다.

## 대안과 기각 이유

| 대안                                               | 기각 이유                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `routine.rules.ts` 를 안 바꾸고 워터마크 이름 유지 | "만든 곳까지"라는 이름이 "만들지 마라"를 뜻하게 재정의돼 다음 에이전트가 오독한다                |
| 슬롯 id 해시를 `src/lib/hash.ts` 로 분리           | 도메인이 `@/lib` 를 0건 import 하는 현재 상태(Worker 번들 안전)를 지키는 값이 40줄 분리보다 크다 |
| existingIds 대신 조회 결과 "없음"으로 판정         | 소프트 삭제 툼스톤이 조회에서 빠져 지운 인스턴스가 부활한다(ADR-0017 §맥락 그대로)               |

## 결과

- 좋은 점: F1 이 앱 경로에서 실제로 닫힌다(`risk-scenarios.test.ts`). 백업·동기화가 같은 `fillFloor`
  필드·같은 병합 규칙(newer-wins)을 공유한다.
- 감수하는 점(**2026-09-21 정정 — 원래는 "임시로 부활을 감수한다" 였다. 감수하지 않기로 했다.
  아래 "## 정정" 절을 본다**): `existingIds` 의 툼스톤 인식은 `SyncRepository`(T-92 후속)가 배선되기
  전까지, 대신 `fillFloor` 전진(F2 를 다시 여는 대가)으로 부활을 막는다.

## 지켜야 할 규칙 (검증 가능한 문장 — 리뷰 판정 근거)

1. ~~`planRoutineFill` 은 `existingIds` 멤버십만 보고 루틴 로우를 읽지도 쓰지도 않는다~~ —
   **2026-09-21 정정으로 무효.** 지금은 `existingIds` 멤버십을 보되, `routine`(fillFloor 전진)도
   함께 돌려준다. "## 정정" 절을 본다.
2. ~~`fillFloor` 를 바꾸는 함수는 `createRoutine`·`resumeRoutine` 둘뿐이다~~ — **2026-09-21 정정으로
   무효.** 지금은 `planRoutineFill` 도 바꾼다("## 정정" 절).
3. `syncOutbox`·`syncState` 의 인덱스는 실제로 쓰는 쿼리가 있는 것만(`db.ts` §B-4 표와 대조). (그대로
   유효)

## 재검토 트리거

- `SyncRepository.existingIds` 가 배선되면(T-92 후속) "## 정정" 절의 `fillFloor` 전진을 되돌려 규칙
  1·2 를 원안대로 복원하고, `todo-routine-fill.ts`·`routine-fill.ts`·`routine.ts` 의 관련 주석을
  지운다(아래 정정 절이 정확히 그 되돌릴 지점을 명시한다).
- **동기화 아웃박스 적재가 실제 쓰기 경로(`dataset.write` 또는 그 주변)에 배선되는 순간** — 지금은
  `syncOutbox` 가 빈 스토어이고 그걸 채우는 코드가 없어 "## 정정" 의 `fillFloor` 전진이 F2 를 당장
  재현하지 않는다. 적재가 배선되면 이 전제가 깨지므로, 그 PR 은 반드시 이 ADR 을 먼저 읽고 위
  재검토 트리거의 되돌리기를 함께 하거나(포트가 같이 들어오면) 최소한 F2 회귀를 알고 진행해야 한다.

## 정정 (2026-09-21, PR #121 리뷰 Blocker — `fillFloor` 전진을 임시로 되살린다)

**무엇이 잘못됐었나**: 위 §결정 3·4 원안은 "채우기가 `fillFloor` 를 절대 옮기지 않는다"였다. 그런데
그 전제가 기대는 `SyncRepository.existingIds`(툼스톤 포함 벌크 조회)가 아직 배선되지 않아, 호출부
(`todo-routine-fill.ts`)의 `existingIds` 는 **살아 있는 로우만** 본다. `fillFloor` 가 멈춰 있으면
재방문마다 지난 구간을 다시 훑고, 그 구간에서 소프트 삭제한 슬롯은 조회에 안 잡혀 **같은 슬롯 id 로
다시 만들어진다 — 부활**. 이건 정확히 ADR-0017 §맥락이 "조회 판정을 기각한 이유"로 든 그 실패
모드이고, §대안과 기각 이유 표의 "existingIds 대신 조회 결과 '없음'으로 판정" 행이 바로 이 실패를
근거로 기각했던 대안과 결과적으로 같은 구멍이 남은 것이다 — §결정 3 은 그 구멍을 안 남긴다고
주장했지만, `SyncRepository.existingIds` 없이는 주장이 성립하지 않았다.

**골랐던 것 (리뷰가 제시한 1안·2안 중 2안)**: `SyncRepository.existingIds` 로 정확히 고치는 1안
(후보 슬롯 id 를 툼스톤 포함으로 직접 조회)은 새 포트 메서드가 필요한데, 그 인터페이스는 T-92b 가
동시에 작업 중인 owns 라 이 PR 에서 만들 수 없었다. 대신 `fillFloor` 전진을 **임시로 되살렸다**
(pre-ADR-0018, main 이 하던 방식과 같다) — 지난 구간을 다시 안 훑으면 부활도 없다. 슬롯 id(F1)는
그대로 살아 있으므로 두 기기 독립 생성 중복 방지는 안 깨진다.

**바뀐 것**:

- `planRoutineFill`(`routine-fill.ts`) 이 다시 `routine`(fillFloor 가 `through` 까지 전진한 값)을
  돌려준다. `todo-routine-fill.ts` 의 `planCreateRoutine`·`planMaterializeRoutines` 둘 다 그 값을
  `dataset.write` 로 같이 쓴다.
- `FILL_BACKFILL_HORIZON_DAYS`(`routine-fill.ts`, 1,095일=3년)를 새로 뒀다 — `fillFloor` 가 그보다
  오래 전에 멈춰 있어도(한 번도 재방문 안 한 루틴) 그만큼만 뒤로 훑는다(PR #121 리뷰 Major 3, 스캔
  비용 상한). `todo-routine-fill.slow.test.ts` 가 fake-indexeddb 에서 그 상한을 실측한다.

**왜 지금은 안전한가(F2 가 잠들어 있다)**: `fillFloor` 전진이 되살아나면 배경 채우기가 다시 루틴
로우를 `touch()` 한다 — ADR-0017 §재검토 위험 2("배경 채우기가 사용자 중지를 다른 기기 동기화로
덮는다")가 그래서 걱정하던 그 경로다. 그런데 **동기화 아웃박스 적재(`syncOutbox` 를 채우는 코드)가
아직 어떤 쓰기 경로에도 없다**(T-92b 가 이 PR 과 동시에 착수 중) — `syncOutbox` 테이블은 v4 스키마로
열려 있을 뿐 비어 있고 아무도 채우지 않는다. 그래서 이 전진이 지금 당장 F2 를 재현하지는 않는다.
**이건 "고쳤다"가 아니라 "아직 안 터진다"다** — 위 재검토 트리거가 그 시점을 명시한다.

**대가**: `Routine.fillFloor` 가 다시 사용자 조작 밖에서(배경 채우기로) 바뀌는 필드가 된다 — §대안과
기각 이유 표의 첫 행("워터마크 이름 유지 — 오독 위험")이 우려했던 것과 결이 같은 대가를 잠깐 다시
진다. `docs/specs/routine.md` §4 의 "채우기는 이 값을 바꾸지 않는다" 서술도 지금은 정확하지 않다 —
같은 정정을 반영하는 후속 문서 티켓이 필요하다(이 PR owns 밖이라 여기 남긴다).
