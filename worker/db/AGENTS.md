<!-- 읽기 조건: worker/db/** 의 어떤 파일이든 읽거나 고치기 전. -->

# worker/db/ — AGENTS

## 목적

`entities`·`devices` 테이블 SQL. `sql.ts`(태그 함수, 표기 장치뿐) · `entities.ts`(`entities`·
`devices` SQL, **전부 `sub = ?` 바인딩**) · `user-db.ts`(`forUser(db, sub): UserDb` — 사용자
격리의 유일한 진입점).

`migrations/` 는 개인 스키마와 소셜 스키마의 별도 `AGENTS.md` 를 자기 것으로 갖는다(이 파일이 `관할:` 로 대신 선언하지 않는다
— 스키마 규칙은 이 디렉토리와 결이 달라 따로 두는 편이 낫다).

## 규칙 (이 디렉토리에만 적용)

1. **모든 SQL 문은 `sub = ?` 를 직접 바인딩한다**(`scripts/check-worker-sql.sh` 가 강제,
   SYNC_DESIGN.md §②-5). 예외는 `sessions` 테이블 조회뿐이고, 그래서 그 조회는 이 디렉토리가
   아니라 `auth/session.ts` 에 있다(`auth/AGENTS.md`) — "sub 없이 시작하는 조회가 존재한다"는
   사실을 검사 대상 밖에 정직하게 드러낸다.
2. **핸들러는 `sub` 를 문자열로 들고 다니지 않는다.** `user-db.ts#forUser(db, sub)` 가 유일한
   진입점 — 새 쿼리가 필요하면 `entities.ts` 에 함수를 추가하고 `UserDb` 에 메서드를 더한다.
3. **`.prepare()` 인자는 `sql` 태그·문자열 리터럴·파일 스코프 식별자만** — 태그 없는 백틱 템플릿
   리터럴(보간 가능)은 `check-worker-sql.sh` 가 실패시킨다(SQLi 통로).
4. **판정 로직은 `@/domain/sync/server-rules.ts#applyServerRules` 를 그대로 부른다** — 다시
   구현하지 않는다. "실제로 적용됐는가"는 SQL 의 `RETURNING`(원자적 `ON CONFLICT … WHERE`)
   결과로만 판정한다(`entities.ts` jsdoc).

## 검증

```bash
pnpm vitest run --project=worker worker/db worker/sync/apply.test.ts
bash scripts/check-worker-sql.sh
```
