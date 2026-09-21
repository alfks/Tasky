<!-- 읽기 조건: 동기화 로컬 스키마(아웃박스·`syncState`)·`SyncRepository`/`SyncTransport` 포트·루틴
슬롯 id·`fillFloor`를 만지기 전. 서버 판정·클라이언트 병합 축(`updatedAt` LWW)은 ADR-0005·ADR-0015 §2. -->

# ADR-0018: 동기화 로컬 스키마(v4) — 아웃박스·슬롯 id·`fillFloor`·포트 분리

- 상태: accepted
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

- 좋은 점: F1·F2 가 앱 경로에서 실제로 닫힌다(`risk-scenarios.test.ts`). 백업·동기화가 같은
  `fillFloor` 필드·같은 병합 규칙(newer-wins)을 공유한다.
- 감수하는 점: `existingIds` 의 툼스톤 인식은 `SyncRepository`(T-92 후속)가 배선하기 전까지
  `todo-routine-fill.ts` 가 살아 있는 로우만 본다 — 그 사이 삭제된 인스턴스가 재방문에서 되살아날
  수 있다(임시, 명시적으로 남긴 결정).

## 지켜야 할 규칙 (검증 가능한 문장 — 리뷰 판정 근거)

1. `planRoutineFill` 은 `existingIds` 멤버십만 보고 루틴 로우를 읽지도 쓰지도 않는다(반환 타입에
   `routine` 필드가 없다).
2. `fillFloor` 를 바꾸는 함수는 `createRoutine`·`resumeRoutine` 둘뿐이다(`routine.rules.ts`).
3. `syncOutbox`·`syncState` 의 인덱스는 실제로 쓰는 쿼리가 있는 것만(`db.ts` §B-4 표와 대조).

## 재검토 트리거

- `SyncRepository.existingIds` 가 배선되면(T-92 후속) `todo-routine-fill.ts` 의 "알려진 한계" 주석을
  지우고 이 ADR "감수하는 점"을 다시 본다.
