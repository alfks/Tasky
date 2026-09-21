<!-- 읽기 조건: 무기한 루틴 엔티티 타입·검증·워터마크 지연 생성 규칙을 추가·수정할 때. -->

# src/domain/routine/ — AGENTS

## 목적

무기한 루틴(routine.md) 엔티티와 그 규칙 — R21(`@/domain/todo/routine.rules`)의 확장. 부모
`src/domain/AGENTS.md`가 이 디렉토리를 관할 선언하지 않으므로 별도로 둔다(D-day·`src/domain/dday/`와
같은 이유).

## 여기 있는 것 / 없는 것

- 있음: `routine.ts`(엔티티 타입), `routine.rules.ts`(검증·생성·중지·재개·삭제·정렬·지연 생성 판정
  `shouldMaterialize`), `routine-fill.ts`(즉시 채우기·지연 생성이 공유하는 채우기 계획
  `planRoutineFill`, R3 구간 보정 `resolveImmediateFillThrough`), `slot-id.ts`(루틴 인스턴스 결정적
  id `routineInstanceSlotId` — ADR-0018, T-92 가 `domain/sync/` 에서 옮겼다).
- 없음(다른 곳): `RoutineRecurrence` 타입과 즉시 채우기 날짜 계산(`expandRoutineDates`)은
  `@/domain/todo/routine.rules`가 단일 소스다(R21, 옮기지 않는다 — 그 경로를 이미 쓰는 다른 티켓
  파일들이 깨진다). 저장소 인터페이스·구현은 `src/repositories/routine-repository*`·
  `src/infra/indexeddb/routine-indexeddb-repository.ts`. 화면·스토어는 `src/features/todo/`.

## 규칙 (이 디렉토리에만 적용)

1. `src/domain/AGENTS.md`의 도메인 공통 규칙(외부 패키지 0, 시각·ID는 `deps` 주입, `Persistable`은
   `meta.ts`만 만듦)을 그대로 따른다.
2. `(routineId, date)` 중복 생성 방지는 **조회가 아니라 슬롯 id**(`routineInstanceSlotId`, `slot-id.ts`)
   로 한다(ADR-0017 최초 결정을 ADR-0018 이 갱신). `planRoutineFill`은 `TodoRepository.listByDateRange`
   같은 조회 결과의 "없음"을 근거로 판정하지 않는다 — 소프트 삭제 툼스톤이 조회에서 빠지므로 그 판정은
   삭제한 인스턴스를 부활시킨다. 대신 호출부가 넘기는 `existingIds`(살아 있든 툼스톤이든 이미 있는
   슬롯 id 집합) 멤버십만 본다. `Routine.fillFloor`(구 `materializedThrough`)는 이제 **채우기가 건드리지
   않는** 사용자 조작 전용 하한이다(ADR-0018) — `createRoutine`·`resumeRoutine`만 바꾼다.
3. `shouldMaterialize`는 시각 의존이 없는 순수 함수다 — `today`를 스스로 읽지 않고 호출부가 판단할
   날짜를 인자로 준다.
4. 정렬(`compareRoutines`)은 이 파일이 단일 소스다 — memory·indexeddb 저장소 구현이 각자 정렬하지
   않는다(dday와 같은 패턴).

## 의존 방향

- import 가능: `@/domain/date/*`, `@/domain/errors`, `@/domain/ids`, `@/domain/meta`,
  `@/domain/todo/routine.rules`(타입·`expandRoutineDates`·`matchesRoutineRecurrence` 만),
  `@/domain/todo/todo.rules`(`createTodo`·`normalizeTodoTitle`·`validateTodoTitle`·`validateTodoMemo`).
- import 금지: react·zustand·dexie·`@/repositories/**`·`@/features/**`.

## 검증

```bash
pnpm test src/domain/routine --reporter=dot
```

## 자주 하는 실수

- `deletedAt`을 객체 리터럴로 직접 쓰기 — `markDeleted`/`touch`(meta.ts)만 쓴다(NO_META_WRITE 린트).
- `planRoutineFill`을 부르기 전에 `existingIds`(살아 있든 툼스톤이든 이미 있는 슬롯 id)를 제대로
  안 채워서 호출 — 슬롯 id dedup 이 안 먹혀 같은 슬롯이 두 번 생기거나(부활), 같은 제목의 기존
  투두를 못 봐서(호출부가 그 슬롯 id 를 `existingIds` 에 안 넣으면) R4 dedup 이 깨진다.
- 재개(`resumeRoutine`)에서 `fillFloor`를 `today`가 아니라 무조건 앞으로만 옮기기 — 이미
  `today` 전날보다 나중이면(드문 경우) 뒤로 물러나면 안 된다(`max` 여야 한다, R7 "소급 없음").
- 배경 채우기(`planRoutineFill`)가 루틴 로우를 다시 `touch()`·저장하게 만들기 — ADR-0018 §위험 2
  (사용자 중지를 다른 기기의 배경 채우기가 덮는 경로)를 다시 연다.
