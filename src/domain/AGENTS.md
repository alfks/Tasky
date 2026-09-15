<!-- 읽기 조건: 엔티티 타입·검증·계산 규칙을 추가·수정할 때. -->

# src/domain/ — AGENTS

## 목적

외부 패키지 0의 비즈니스 규칙. 엔티티별 디렉토리(`todo/`, `category/`, `date/`, `theme/`, `focus/`)와
공통 파일 `meta.ts`(`Meta`·`Persistable`·`createMeta`/`touch`/`markDeleted`/`adopt`), `ids.ts`,
`dataset.ts`(데이터셋 연산의 값 타입 — 계약 인터페이스는 `repositories`), `errors.ts`. 배럴 없음.

## 규칙

1. `meta.ts`는 `Persistable`을 만드는 유일한 파일. 다른 도메인 파일도 `Meta` 필드를 직접 쓰지 않고 `touch`/`markDeleted`를 호출한다(린트).
2. 시각 산술은 `date/instant.ts`(순수 ISO UTC 계산기)로만. `Date`·`crypto`·`Math.random`은 도메인 어디서도 부르지 않는다 — `deps = { now, id }` 주입(ADR-0005 규칙 2).
3. 모든 export 함수에 단위 테스트(같은 디렉토리 `*.test.ts`). 커버리지 100% 목표.
4. 출처: `docs/conventions/code-style.md` §5, ADR-0005·0007·0009.

## 관할: todo/

## 관할: category/

## 관할: date/

## 관할: theme/

## 관할: focus/

`src/domain/{todo,category,date,theme,focus}/`에는 별도 `AGENTS.md`를 두지 않는다(이 문서가 관할, CLAUDE.md §1-4의 면제 조건). 각 엔티티 디렉토리는 위 "규칙"을 그대로 따른다.

## 검증

```bash
pnpm test src/domain --coverage --reporter=dot 2>&1 | tail -20
```
