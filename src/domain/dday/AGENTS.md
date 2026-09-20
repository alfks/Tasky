<!-- 읽기 조건: D-day 엔티티 타입·검증·계산 규칙을 추가·수정할 때. -->

# src/domain/dday/ — AGENTS

## 목적

D-day(미리 정해 둔 날짜까지 남은 일수) 엔티티와 그 규칙(calendar.md §4). 카테고리·투두와 연결되지
않는 독립 이벤트다 — 부모 `src/domain/AGENTS.md`가 이 디렉토리를 관할 선언하지 않으므로 별도로 둔다.

## 여기 있는 것 / 없는 것

- 있음: `dday.ts`(엔티티 타입), `dday.rules.ts`(검증·생성·삭제·되돌리기·D-n 계산·정렬).
- 없음(다른 곳): 저장소 인터페이스·구현은 `src/repositories/dday-repository*`·
  `src/infra/indexeddb/dday-indexeddb-repository.ts`. 화면·스토어는 `src/features/calendar/`.

## 규칙 (이 디렉토리에만 적용)

1. `src/domain/AGENTS.md`의 도메인 공통 규칙(외부 패키지 0, 시각·ID는 `deps` 주입, `Persistable`은
   `meta.ts`만 만듦)을 그대로 따른다.
2. 날짜 산술은 `Date.UTC`(DST 없는 순수 계산)만 쓴다 — `domain/date/civil.ts`의 그레고리력 알고리즘을
   다시 가져오지 않는다(사용 범위가 좁아 중복의 대가가 결합보다 싸다는 그 파일의 판단과 같다).
3. 정렬(`sortDdays`)은 이 파일이 단일 소스다 — memory·indexeddb 저장소 구현이 각자 정렬하지 않는다
   (calendar.md §4 "list()는 전량 조회 후 메모리 정렬").

## 의존 방향

- import 가능: `@/domain/date/*`, `@/domain/errors`, `@/domain/meta`.
- import 금지: react·zustand·dexie·`@/repositories/**`·`@/features/**`.

## 검증

```bash
pnpm test src/domain/dday --reporter=dot
```

## 자주 하는 실수

- `deletedAt` 을 객체 리터럴로 직접 쓰기 — `markDeleted`/`touch`(meta.ts)만 쓴다(NO_META_WRITE 린트).
- 되돌리기(`restoreDday`)를 한 번만 touch — 방금 쓴 툼스톤과 rev 가 같아져 되돌리기 쓰기가 먹히지
  않는다(`dday.rules.ts` 주석 참고, `category/removal.ts#rewind`와 같은 함정).
