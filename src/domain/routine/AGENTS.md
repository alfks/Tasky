<!-- 읽기 조건: 무기한 루틴 엔티티 타입·검증·워터마크 지연 생성 규칙을 추가·수정할 때. -->

# src/domain/routine/ — AGENTS

## 목적

무기한 루틴(routine.md) 엔티티와 그 규칙 — R21(`@/domain/todo/routine.rules`)의 확장. 부모
`src/domain/AGENTS.md`가 이 디렉토리를 관할 선언하지 않으므로 별도로 둔다(D-day·`src/domain/dday/`와
같은 이유).

## 여기 있는 것 / 없는 것

- 있음: `routine.ts`(엔티티 타입), `routine.rules.ts`(검증·생성·중지·재개·삭제·정렬·`shouldMaterialize`),
  `routine-fill.ts`(채우기 계획 `planRoutineFill`·`resolveImmediateFillThrough`), `slot-id.ts`(결정적 id
  `routineInstanceSlotId`), `routine-rank.ts`(순서 R13 — `reorderRoutines`·`routineRank`·`applyRoutineRank`).
- 없음(다른 곳): `RoutineRecurrence` 타입과 날짜 계산(`expandRoutineDates`)은 `@/domain/todo/routine.rules`가
  단일 소스다(R21, 옮기지 않는다 — 그 경로를 쓰는 다른 티켓 파일들이 깨진다). 저장소는
  `src/repositories/routine-repository*`·`src/infra/indexeddb/routine-indexeddb-repository.ts`, 화면·스토어는 `src/features/todo/`.

## 규칙 (이 디렉토리에만 적용)

1. `src/domain/AGENTS.md`의 공통 규칙(외부 패키지 0, 시각·ID는 `deps` 주입, `Persistable`은 `meta.ts`만)을 따른다.
2. `(routineId, date)` 중복 생성 방지는 **조회가 아니라 슬롯 id**(`routineInstanceSlotId`, `slot-id.ts`)
   로 한다(ADR-0017 최초 결정을 ADR-0018 이 갱신). 살아 있든 툼스톤이든 호출부가 넘기는 `existingIds`
   멤버십만 본다 — 조회 결과의 "없음"을 근거로 삼지 않는다(툼스톤이 빠져 부활한다). **`fillFloor`(구
   `materializedThrough`)는 최종 설계에서는 사용자 조작 전용 하한이지만, 2026-09-21 정정(PR #121
   리뷰 Blocker, ADR-0018 "## 정정" 절)으로 지금은 `planRoutineFill` 도 `through` 까지 전진시킨다** —
   `SyncRepository.existingIds`(T-92 후속) 배선 전까지 임시. `FILL_BACKFILL_HORIZON_DAYS`(1,095일)가
   얼마나 뒤로 훑을지 상한을 둔다(Major 3).
3. `shouldMaterialize`는 시각 의존이 없는 순수 함수다 — `today`를 스스로 읽지 않고 호출부가 날짜를 준다.
4. 정렬(`compareRoutines`)은 이 파일이 단일 소스다 — memory·indexeddb 저장소 구현이 각자 정렬하지
   않는다(dday와 같은 패턴). `order`(R13) → `createdAt` → `id` 순, `order` 없는 옛 레코드는 뒤. 순서 변경은
   `routine-rank.ts` — `applyRoutineRank` 는 인스턴스가 차지한 `order` 슬롯 **집합을 보존**하고 일반
   투두·완료 항목·과거 날짜를 건드리지 않는다.

## 의존 방향

- import 가능: `@/domain/date/*`, `@/domain/errors`, `@/domain/ids`, `@/domain/meta`,
  `@/domain/todo/routine.rules`(타입·`expandRoutineDates`·`matchesRoutineRecurrence` 만),
  `@/domain/todo/todo.rules`(`createTodo`·`normalizeTodoTitle`·`validateTodoTitle`·`validateTodoMemo`),
  `@/domain/todo/ordering`(`compareTodos` 만, `routine-rank.ts`).
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
- 배경 채우기가 루틴 로우를 다시 `touch()`하는 것 자체는 **지금은 의도된 것**이다(위 규칙 2) —
  `SyncRepository.existingIds` 가 배선되면 되돌린다. `fillFrom`(호출부) 과 지평선 클램프(여기)가
  다른 값을 쓰게 만들면 쿼리 범위와 채우는 범위가 어긋나 중복이 난다.
