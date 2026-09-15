<!-- 읽기 조건: IndexedDB 스키마·마이그레이션·레포지토리 구현을 수정할 때. -->

# src/infra/ — AGENTS

## 목적

저장소 인터페이스의 실제 구현. `indexeddb/`(Dexie) 현재, `sync/`(어댑터 + `conflict.ts` 충돌 정책) Phase 2.

## 규칙

1. 스키마는 `indexeddb/db.ts` 한 곳. 변경은 `version(n+1).stores({...}).upgrade(...)` 추가로만(기존 버전 수정 금지) + ADR + 마이그레이션 테스트(fake-indexeddb로 n → n+1). 비인덱스 필드 추가는 버전업 불필요.
2. DB 이름 `tasky`. 테이블: `todos`, `categories`, `settings`. 인덱스는 `docs/ARCHITECTURE.md` §4.
3. `db.ts`를 import하는 파일은 `indexeddb/query.ts`뿐(린트). 레포지토리 구현은 `query.ts`의 `liveAll/liveOne/put`만 쓴다 — 툼스톤 필터와 역직렬화 `as`가 그 한 곳에 있다.
4. 각 구현은 계약 테스트를 통과해야 한다(`repositories/*.contract.test.ts` 재사용). 트랜잭션은 다중 테이블 쓰기에만.
5. 출처: `docs/ARCHITECTURE.md` §1·§6, ADR-0002·0007.

## 관할: indexeddb/

`src/infra/indexeddb/`에는 별도 `AGENTS.md`를 두지 않는다(이 문서가 관할, 위 규칙이 그대로 적용된다).

## 검증

```bash
pnpm test -- src/infra --reporter=dot 2>&1 | tail -20
```
