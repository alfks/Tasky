<!-- 읽기 조건: IndexedDB 스키마·마이그레이션·레포지토리 구현을 수정할 때. -->

# src/infra/ — AGENTS

## 목적

저장소 인터페이스의 실제 구현. `indexeddb/`(Dexie) — 엔티티·데이터셋·동기화 저장소. `sync/`(ADR-0018,
`SyncTransport` 의 실제 HTTP 구현) — 별도 `AGENTS.md`(관할이 아니라 자체 문서, 그 디렉토리가 직접
규칙을 갖는다).

`indexeddb/` 파일 구성: `db.ts`(스키마·버전) → `query.ts`(엔티티 테이블에 닿는 유일한 파일)·
`sync-store.ts`(`syncOutbox`·`syncState` 에 닿는 유일한 파일, ADR-0018) → `*-indexeddb-repository.ts`
(계약 6종 구현 — 엔티티 4 + dataset + sync) → `repositories.ts`(조립, `src/app/providers.tsx` 가 부른다).

`social/`은 별도 온라인 HTTP 포트 구현이다. 쿠키·actor는 adapter 경계에 두고, 개인 IndexedDB나 sync 아웃박스에 공유 내용을 넣지 않는다. 실제 구현은 provider가 지연 주입한다.

## 규칙

1. 스키마는 `indexeddb/db.ts` 한 곳. 변경은 `version(n+1).stores({...})` 추가로만(기존 버전 수정 금지) + ADR + 마이그레이션 테스트(fake-indexeddb로 n → n+1). 비인덱스 필드 추가는 버전업 불필요. `.upgrade(...)` 는 값 변환이 있을 때만 달고, 생략하려면 "기존 로우의 값이 바뀌지 않는다"를 테스트로 보인다(ADR-0011 규칙 3).
2. 앱 DB 이름은 `DB_NAME`(= `tasky`) 하나, 현재 버전 `DB_VERSION`(= 4, ADR-0018). 테이블: `todos`·`categories`·`settings`·`focusSessions`·`ddays`·`diaryEntries`·`routines`·`syncOutbox`·`syncState`. 인덱스는 `docs/ARCHITECTURE.md` §4. `createDb(name)`·`createStore(name)` 로 **다른 이름의 DB** 를 여는 것은 테스트 격리 전용이다 — 앱 코드는 `tables`(기본 묶음) 하나만 쓴다.
   - **아웃박스 적재(ADR-0018 §B-4)**: `query.ts#put`·`bulkPut` 이 엔티티 put 과 `syncOutbox.put({tbl,id,rev})` 를 **같은 Dexie 트랜잭션 안**에서 한다(`Table.db`·`Table.name`). `Store.transaction`(아래 `DatasetRepository` 트랜잭션)이 이미 열려 있으면 그 호출은 서브트랜잭션이 되므로, `Store.transaction` 의 테이블 목록에 `syncOutbox` 가 끼어 있어야 한다(안 끼면 `SubTransactionError`). `Store.sync.putRemote`·`clear` 는 적재하지 않는다.
   - `syncOutbox`·`syncState` 에 닿는 조회·쓰기는 `query.ts` 의 헬퍼가 아니라 **`sync-store.ts#createSyncStore(database)`** 가 만드는 `SyncStore`(`Store.sync`)를 거친다 — `db.ts` 를 import 하지 않는 별도 통로다(`dexie` 타입만, `NO_DB_IMPORT` 유지). `sync-indexeddb-repository.ts` 가 그 위에서 `planClientMerge`·`reconcileAck` 판정을 적용해 `SyncRepository` 를 구현한다.
3. `db.ts`를 import하는 **비테스트** 파일은 `indexeddb/query.ts`뿐(린트). 테스트 파일은 `eslint.config.mjs`의 테스트 블록이 `no-restricted-imports`를 리셋하므로 **예외**이고(실측: `migration.test.ts`에 eslint rc=0), 스키마 문자열을 직접 읽는 마이그레이션 테스트가 그 예외를 쓰는 유일한 자리다. 레포지토리 구현이 받는 테이블 핸들은 raw Dexie 테이블이 아니라 브랜드 타입 `LiveTable`이라 **Dexie API를 직접 부를 수 없다**(`tables.todos.where(...)`는 컴파일 에러 — 린트가 아니라 타입이 막는다). 조회는 `query.ts`의 헬퍼로만 한다:
   - `liveOne(t, id)` 단건 · `liveBy(t, index, key)` 인덱스 동등(복합 인덱스는 키가 배열) · `liveBetween(t, index, a, b)` 범위(양끝 포함) · `liveOrderBy(t, index)` 정렬 · `liveAll(t)` 전량 · `put(t, entity)` 쓰기.
   - **`DatasetRepository` 전용**(이름에 `live` 가 없다 = 툼스톤을 감추지 않거나 물리 삭제를 한다, ADR-0009): `allRows(t)` 툼스톤 포함 전량(id asc) · `clear(t)` 물리 삭제 · `bulkPut(t, entities)` 청크 쓰기 · `store.transaction(run)` 네 테이블 rw. 엔티티 레포지토리 구현은 이 넷을 부르지 않는다.
   - `store.transaction(run)` 의 `run` 안에서는 이 파일의 헬퍼만 쓴다 — Dexie 가 아닌 프라미스를 `await` 하면 트랜잭션이 먼저 커밋된다. 값 검증은 트랜잭션에 **들어가기 전에** 끝낸다. 단, 그 순서가 계약이나 에러 타입을 바꾸지는 않는다(실측) — 그 축을 고정하는 것은 `dataset-atomicity.test.ts` 의 트랜잭션 스파이 1건뿐이니, 순서를 바꾸려면 그 테스트부터 본다.
   - 레포지토리 구현은 테이블을 전역에서 꺼내 쓰지 않고 `Store`(테이블 넷 + 그 인스턴스의 `transaction`)를 **인자로 받는다**. `createIndexedDbRepositories(store = tables)` 가 그 주입 지점이다.
   - `index`로 넘길 수 있는 이름은 `db.ts`의 `STORES` 문자열에서 뽑아낸 타입(`IndexOf<>`)이라 **선언되지 않은 인덱스로 조회하면 컴파일 에러**다(Dexie가 조용히 전수 스캔으로 떨어지지 않는다 — TECH_PLAN §8 성능 예산).
   - `liveAll`은 인덱스를 탈 수 없는 조회(부분 문자열 검색·통계)에만 쓴다. 인덱스에 없는 필드(`done`, `order`) 정렬은 위 헬퍼가 좁혀 준 배열 위에서 한다.
   - 툼스톤 필터와 역직렬화 `as`가 그 한 곳에 있다(ADR-0007 결정 5).
4. **스키마 열기는 조회·쓰기와 다른 통로다**: `store.open()`. Dexie 는 지연 오픈이라 이 호출이 없으면 `upgrade` 실패가 아무 조회에서나 raw Dexie 에러로 터진다 — `store.open()` 은 그것을 `RepositoryError('SCHEMA_UPGRADE_FAILED')` 로 바꾼다(TECH_PLAN §5 규칙 4). 스키마와 무관한 실패(`MissingAPIError` 등, `query.ts` 의 제외 목록)는 **감싸지 않고 원본 그대로** 올린다 — 감싸면 앱 셸이 "백업 내보내기만 가능한 모드" 를 잘못 띄운다. 앱에서의 호출은 `repositories.ts` 의 `openIndexedDb(store = tables)` **한 곳**이고 그것을 부르는 것은 `src/app/providers.tsx` 하나다(`src/app/providers.test.tsx` 가 그 호출을 고정한다 — 사라지면 이 code 는 실전에서 발생하지 않는다). 실패 주입 테스트는 `migration.test.ts` 에 있고, 임의의 Dexie 인스턴스를 묶음으로 감싸는 `storeOn(database)` 이 그 통로다(앱 코드는 `tables` 하나만 쓴다).
5. 각 구현은 계약 테스트를 통과해야 한다 — `indexeddb/indexeddb.contract.test.ts` 가 `repositories/*.contract.ts` 의 러너를 부르고(엔티티 4 + dataset + sync), 스위트 본문은 손대지 않는다(그건 `src/repositories/` 소유다). 트랜잭션은 `DatasetRepository.write`·`restore`·`SyncRepository` 의 `applyRemote`·`ackOutbox`·`dropOutbox`·`enqueueAll`(`SyncStore.withOutboxTransaction`)·`wipeLocal` 에. `ContractTarget.create()` 는 호출마다 **이름이 다른 DB**(`createStore`)를 열어 memory 와 같은 의미의 격리를 준다 — 테이블 비우기로 대신하면 먼저 만든 묶음까지 지워지고, 계약은 그 차이를 잡지 못한다(실측). 그 격리는 같은 파일의 전용 테스트 1건이 지킨다.
6. 출처: `docs/ARCHITECTURE.md` §1·§6, ADR-0002·0007·0009·0011·0018.

## 관할: indexeddb/

`src/infra/indexeddb/`에는 별도 `AGENTS.md`를 두지 않는다(이 문서가 관할, 위 규칙이 그대로 적용된다).

## 검증

```bash
pnpm test src/infra --reporter=dot 2>&1 | tail -20
```
