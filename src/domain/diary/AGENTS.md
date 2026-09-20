<!-- 읽기 조건: 다이어리 엔티티 타입·검증·기분 이모지 목록을 추가·수정할 때. -->

# src/domain/diary/ — AGENTS

## 목적

다이어리(하루 기록) 엔티티와 그 규칙(diary.md). 카테고리·투두와 연결되지 않는 독립 기록이다 — 부모
`src/domain/AGENTS.md`가 이 디렉토리를 관할 선언하지 않으므로 별도로 둔다(D-day·`src/domain/dday/`와
같은 이유).

## 여기 있는 것 / 없는 것

- 있음: `diary-entry.ts`(엔티티 타입), `mood-emoji.ts`(기분 이모지 제공 목록 24개),
  `diary.rules.ts`(검증·생성·수정·삭제·되돌리기·정렬).
- 없음(다른 곳): 저장소 인터페이스·구현은 `src/repositories/diary-repository*`·
  `src/infra/indexeddb/diary-indexeddb-repository.ts`. 화면·스토어는 `src/features/diary/`.
  카테고리 이모지(`@/domain/theme/emoji`)와는 다른 목록이다 — 섞지 않는다(`mood-emoji.ts` 머리주석).

## 규칙 (이 디렉토리에만 적용)

1. `src/domain/AGENTS.md`의 도메인 공통 규칙(외부 패키지 0, 시각·ID는 `deps` 주입, `Persistable`은
   `meta.ts`만 만듦)을 그대로 따른다.
2. 날짜당 유일성(diary R1)은 **여기**(`createDiaryEntry`의 `existing` 인자)에서 지킨다 — DB 인덱스가
   유일 인덱스가 아니다(`diaryEntries: 'id, date'`, 소프트 삭제 툼스톤이 같은 `date`로 남기 때문).
   호출부(스토어)가 `existing`을 최신으로 다시 읽어 넘겨야 두 번 눌러 두 개가 생기지 않는다.
3. 이모지·본문이 둘 다 비면 저장 불가(diary R3) — `assertNotEmpty`가 모든 생성·수정 경로에서 반드시
   돈다.

## 의존 방향

- import 가능: `@/domain/date/*`, `@/domain/errors`, `@/domain/meta`.
- import 금지: react·zustand·dexie·`@/repositories/**`·`@/features/**`.

## 검증

```bash
pnpm test src/domain/diary --reporter=dot
```

## 자주 하는 실수

- `deletedAt`을 객체 리터럴로 직접 쓰기 — `markDeleted`/`touch`(meta.ts)만 쓴다(NO_META_WRITE 린트).
- 되돌리기(`restoreDiaryEntry`)를 한 번만 touch — 방금 쓴 툼스톤과 rev 가 같아져 되돌리기 쓰기가
  먹히지 않는다(`dday.rules.ts#restoreDday`와 같은 함정).
- `emoji: undefined`를 객체 리터럴에 직접 쓰기 — 필드 자체를 없애는 스프레드 패턴을 따른다
  (`category.rules.ts#editCategory` 참고, IndexedDB 왕복에서 `undefined` 값 필드가 지저분해진다).
