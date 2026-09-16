<!-- 읽기 조건: 엔티티를 저장·삭제·조회하는 코드(domain/meta.ts, repositories, infra, feature store)를 쓰기 전. UI 만 만질 때는 불필요. -->

# ADR-0007: 쓰기 경로 브랜드(`Persistable`)와 툼스톤 조회 규칙

- 상태: accepted
- 날짜: 2026-09-15
- 관련: ADR-0005(규칙 4·5 를 구체화 — supersede 아님), ADR-0009(규칙 2·결정 1·4 의 적용 범위 한정 — supersede 아님), **ADR-0014(결정 4 개정: 툼스톤 전용 조회 `listDeletedByIds` 추가 — supersede 아님)**, ADR-0002, docs/conventions/code-style.md §5·§11

## 맥락

ADR-0005 는 `rev`·`updatedAt` 갱신을 도메인 `touch()` 한 곳으로 정했지만 강제 수단이 관례와 리뷰뿐이었다. 스토어가 `repo.upsert({ ...todo, done: true })` 로 저장하면 `rev` 가 그대로 남고, Phase 2 LWW 에서 그 로우는 항상 지는 쪽이 되어 편집이 조용히 사라진다. 소프트 삭제 필터도 "조회 메서드마다 기억할 규칙" 이었고 `getById` 의 툼스톤 동작은 어디에도 없었다.

## 결정

**저장 가능한 값은 타입으로만 만들어지고, 툼스톤은 조회 API 밖에 있다.**

1. 브랜드 타입: `src/domain/meta.ts` 가 `Persistable<T extends Meta> = T & { readonly [PERSISTABLE]: T }`(`declare const PERSISTABLE: unique symbol` — 런타임 흔적 없음)를 정의한다. **브랜드 값은 `true` 가 아니라 `T` 자신이다** — T 에 대해 불변(invariant)이라 교차 타입으로 다른 엔티티에 옮겨붙지 않는다(아래 '결과' 절의 실측). 이 타입을 만드는 함수는 같은 파일의 `createMeta(deps, fields)`, `touch(e, now)`, `markDeleted(e, now)` 셋뿐이며, `createMeta` 는 **완성된 엔티티**를 만든다(도메인 필드를 인자로 받고 `Meta` 를 붙여 돌려준다) — 브랜드가 붙은 반쪽짜리 `Meta` 중간값이 존재하지 않아야 위조 출발점이 사라지기 때문이다. ADR-0009 가 백업 가져오기 전용 `adopt(e)` 를 **넷째**로 더한다 — 시각·`rev` 를 찍지 않고 `Meta` 형식만 검증하며 호출처는 `src/domain/backup/**` 하나다.
2. 레포지토리의 쓰기 메서드는 `upsert(entity: Persistable<T>): Promise<void>` 하나. 조회는 브랜드 없는 `T` 를 돌려주므로 읽은 값을 그대로, 또는 스프레드해서 다시 저장하면 **컴파일 에러**(TS2345 — 실측). `remove()` 는 없다: 삭제는 `upsert(markDeleted(e, deps.now()))`.
3. 린트 보조(`eslint.config.mjs`): `src/domain/meta.ts` 밖에서 `rev`·`updatedAt`·`createdAt`·`deletedAt` 를 객체 리터럴·대입으로 **쓰면** 에러(읽기·구조분해는 허용), `as Persistable<…>` 캐스팅 에러, `as never` 캐스팅 에러(어떤 타입에도 대입되므로 브랜드 검사를 통째로 무력화한다), `Object.assign`·`Object.create`·`Object.defineProperty(ies)`·`Object.setPrototypeOf` 호출 에러(Meta 필드를 리터럴 키 없이 덮어쓰고 교차 타입으로 브랜드를 옮긴다). 테스트 계층(`src/test/**`, `*.test.*`)은 픽스처를 위해 이 둘이 허용된다(실측 — 결과 절). `src/infra/indexeddb/db.ts` 는 테스트 계층 밖에서 `query.ts` 만 import 할 수 있다. `meta.ts` 예외 블록이 푸는 것은 이 둘뿐 — 도메인 결정성 규칙(`Date`·`crypto`·`Math.random`)은 그 파일에서도 그대로 걸린다(`meta.ts` 는 시각·ID 를 `deps` 로 받으므로 필요하지 않다).
4. 툼스톤 조회: **엔티티 레포지토리의** 모든 조회 메서드는 툼스톤을 반환하지 않는다 — `getById` 는 `undefined`, `list*`/`get` 은 제외. 데이터셋 단위 `DatasetRepository.readAll()` 은 툼스톤을 포함하며 그 근거·호출처 제한은 ADR-0009 다. `includeDeleted` 옵션은 MVP 에 두지 않는다(호출처가 없다). Phase 2 동기화는 별도 인터페이스(`SyncRepository.listChangedSince`)로 툼스톤을 읽는다.
5. 필터 위치: IndexedDB 에서는 `src/infra/indexeddb/query.ts` 만 테이블에 닿는다. 레포지토리 구현이 받는 핸들은 raw Dexie 테이블이 아니라 브랜드 타입 `LiveTable` 이라 **Dexie API 를 직접 부를 수 없고**(`tables.todos.where(...)` 는 컴파일 에러), 조회는 `liveOne`/`liveBy`/`liveBetween`/`liveOrderBy`/`liveAll` 과 쓰기 `put` 으로만 한다 — 툼스톤 필터는 그 안에 한 번씩 있다. 이 여섯이 스펙의 조회 패턴(날짜별·카테고리별·날짜 범위·정렬 목록)을 전부 인덱스로 처리하므로 "전수 스캔" 과 "필터 복제" 중 하나를 고를 필요가 없다. 인덱스 이름은 `db.ts` 의 `STORES` 문자열에서 뽑은 타입이라 선언되지 않은 인덱스로 조회하면 컴파일 에러다. memory 구현도 같은 이름의 헬퍼 하나를 거친다. 필터를 빼먹을 수 있는 코드 경로가 하나뿐이다.
6. 계약 테스트(`*.contract.test.ts`, memory·indexeddb 공용)의 `READS` 는 **배열이 아니라 매핑 타입**이다 — `type ReadName = Exclude<keyof TodoRepository, 'upsert'>` 에 대해 `const READS = { getById: (r, id) => r.getById(id), … } satisfies Record<ReadName, ReadCall>`. 조회 메서드를 추가하고 목록을 안 고치면 `TS1360`(빠진 이름을 지목), 쓰기 메서드를 넣으면 `TS2353` 이다. `satisfies readonly (keyof T)[]` 형태는 **전수성을 검사하지 않으므로**(원소 하나하나만 본다 — tsc 5.9 실측 exit 0) 쓰지 않는다.

## 대안과 기각 이유

| 대안                                                                           | 기각 이유                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `upsert` 입력에서 `Omit<Meta, 'rev' \| 'updatedAt'>` 를 받고 레포지토리가 채움 | ADR-0005 "레포지토리는 저장만" 위반. 두 구현이 각자 시각·rev 를 만들어 계약 테스트가 복잡해지고 memory/indexeddb 가 갈릴 수 있다                                                                                |
| 런타임 심볼 브랜드                                                             | IndexedDB 직렬화에 심볼이 못 들어가 저장 직전에 벗겨야 한다. 타입 전용이면 비용 0                                                                                                                               |
| 브랜드 값을 `true` 로 두기(초기 형태)                                          | `Object.assign(a, b)`·스프레드·제네릭 병합의 결과 타입이 교차 타입이라 브랜드가 아무 엔티티에나 옮겨붙는다. 리뷰 라운드 1 에서 lint 0 / tsc 0 으로 통과하는 위조가 실측됐다                                     |
| `Persistable<T>` 를 값을 감싸는 상자(`{ [P]: T }`)로                           | 스프레드 구멍까지 닫히지만 런타임 래퍼가 생겨 저장 직전 `unwrap` 이 필요하고 `readAll`·계약 테스트의 모든 경계에 상자 여닫기가 번진다. 남는 구멍(아래 '감수하는 점')은 린트로 좁힐 수 있어 비용이 이익보다 크다 |
| `getById` 가 툼스톤을 반환                                                     | 상세/편집 경로에서 삭제 항목이 되살아나는 버그 경로. 필요해지면 옵션이 아니라 별도 메서드                                                                                                                       |
| `includeDeleted: true` 옵션                                                    | MVP 에 호출처가 없다. 옵션은 기본값 실수의 통로                                                                                                                                                                 |
| `remove(id, now)` 유지                                                         | 레포지토리가 도메인 함수를 호출해야 해 "저장만" 이 깨지고 쓰기 경로가 둘이 된다                                                                                                                                 |

## 결과

- 좋은 점: **브랜드 없는 값을 브랜드 있는 값으로 만드는 경로가 타입 단계에서 닫힌다.** 위조 시도 13종(`Object.assign` · 스프레드 조합 · `Object.defineProperty` · 구조분해 후 재조립 · `structuredClone` · JSON 왕복 · 제네릭 병합 헬퍼 · `satisfies` · 배열 `map` · `Object.create` · `Object.setPrototypeOf` · `as never` · 이미 브랜드가 붙은 값 위에 덮어쓰기)를 실제로 돌린 결과 **12종이 막힌다** — 7종은 tsc(TS2345), 나머지는 린트(`no-restricted-syntax`)다. 음성 대조: 브랜드를 `true` 로 되돌리면 그중 6종이 **lint 0 / tsc 0** 으로 통과한다(리뷰 라운드 1 재현). 조회 필터 누락의 방어는 세 겹이다 — 필터 진입점 1개(이제 **타입**이 강제: `LiveTable` 이 Dexie API 를 감춘다), 인덱스 이름 타입 검사, `READS` 전수 대조(tsc).
- 감수하는 점 1: **남는 위조 경로는 하나다** — 이미 브랜드가 붙은 **같은 엔티티** 위에 다른 값을 통째로 스프레드하는 것(`const { ...b } = createMeta<Todo>(…); ({ ...b, ...stale })`). 브랜드는 구조적 타입이라 스프레드로 복사되고, "덮어쓰는 값이 낡았는지" 는 타입이 구분할 수 없다. `Object.*` 경유는 린트가 막지만 순수 스프레드는 `{ ...state, ...patch }` 같은 정당한 코드와 구문이 같아 린트로도 구분할 수 없다 — **도구가 아니라 리뷰가 잡는 항목**이다(리뷰 체크: `upsert` 인자에 도메인 함수 호출이 마지막 단계로 있는가). 이 한 문장이 이 ADR 이 약속할 수 있는 정확한 경계다.
- 감수하는 점 2: `{ ...touch(e, now), done: true }` 처럼 touch **뒤** 스프레드는 브랜드가 남는다 — `rev` 는 이미 +1 됐으므로 LWW 에 무해(의도된 허용). 픽스처(`src/test/**`, `*.test.*`)는 Meta 리터럴·`as Persistable`·`Object.assign` 허용 — 그 계층에서는 위조 시도 **자체가 테스트**이며(`src/domain/meta.test.ts`) 판정은 tsc 의 `@ts-expect-error` 가 한다.
- 감수하는 점 3: `Object.assign` 금지는 `src/**`(테스트·`meta.ts` 제외) 전역이다. 병합은 스프레드로 쓴다.
- 감수하는 점 4(T-05 에서 실측해 추가): **규칙 3 의 `deletedAt` 리터럴 금지에는 합법 통로가 하나 있고, 그 통로의 결과를 스프레드로 결합하는 것은 린트가 잡지 못한다.** `meta.ts` 의 `deletionStamp(tombstone)` 은 `CategoryRemovalResult.deletedAt`(TECH_PLAN §6 이 고정한 **결과 객체**의 필드명)을 규칙을 끄지 않고 만들기 위한 함수다 — 반환값은 평범한 `{ deletedAt: string }` 이라 브랜드를 만들지 못하고, 값의 출처가 실제 툼스톤이라 category R14("카테고리와 같은 deletedAt")가 구조적으로 보장된다. 다만 `touch({ ...entity, ...deletionStamp(other) }, now)` 처럼 **엔티티에 결합**하면 `markDeleted` 를 거치지 않고 임의 시각의 툼스톤이 만들어지며 lint 0 / tsc 0 으로 통과한다(실측). 구문이 정당한 `{ ...state, ...patch }` 와 같아 '감수하는 점 1' 과 **같은 이유로** 린트로는 구분할 수 없다 — 도구가 아니라 리뷰가 잡는 항목이다(리뷰 체크: `deletionStamp` 의 결과가 엔티티가 아닌 결과 객체에만 실렸는가). 규칙 1 의 "실측한 허용 범위"는 이 한 줄만큼 넓다. 좁히려면 `scripts/check-arch.sh` 에 이 패턴을 **음성 대조 픽스처**로 넣어야 하는데(현재 없음) 그 파일은 T-05 소유 밖이라 후속 조치로 남긴다.
- 감수하는 점 5(T-05 에서 실측해 추가): **`adopt` 의 호출처 제한(규칙 1·ADR-0009 규칙 1: `src/domain/backup/**` 하나)은 어떤 도구도 강제하지 않는다.** `src/domain/**` 의 아무 파일에서 `adopt(plainEntity)` 를 불러도 lint·tsc 가 통과해 브랜드가 붙는다(실측). 현재 호출처 0건이라 실해는 없으나, 백업 티켓(T-14) 착수 **전에** `eslint.config.mjs` 의 `no-restricted-imports`(`@/domain/meta` 의 `importNames: ['adopt']` 를 `src/domain/backup/**`·테스트 계층 밖에서 금지) + `scripts/check-arch.sh` 픽스처 1건으로 못 박아야 한다. 두 파일 모두 T-05 소유 밖이라 이 ADR 은 "현재 강제되지 않는다"는 사실만 적는다 — 지키지 못하는 것을 지킨다고 쓰지 않는다.

## 지켜야 할 규칙 (검증 가능한 문장 — 리뷰 판정 근거)

1. `Persistable` 를 반환하는 함수는 `src/domain/meta.ts` 에만 있다. `meta.ts` 와 테스트 계층(`src/test/**`, `*.test.*`) 밖의 `as Persistable`·`as never`·`Object.assign` 계열은 린트 에러(실측한 허용 범위가 정확히 이것이다 — 픽스처는 `scripts/check-arch.sh`). `src/domain/meta.test.ts` 는 위조 시도 13종을 `@ts-expect-error` 로 고정하고 정당한 생성 경로를 음성 대조로 함께 돌린다.
2. 레포지토리 인터페이스에 `remove`·`delete` 메서드가 없다. 쓰기 메서드는 `upsert` 뿐이며 인자 타입은 `Persistable<T>`. **적용 범위는 엔티티 레포지토리다** — 교차 테이블·전량 작업을 담당하는 `DatasetRepository`(`readAll`/`write`/`restore`)는 ADR-0009 가 별개 계약으로 정하며, 그 `restore` 도 `Persistable` 만 받는다. 결정 4 의 "별도 인터페이스" 는 Phase 2 `SyncRepository` 를 가리키는 문장이고, MVP 의 툼스톤 읽기 경로의 근거는 ADR-0009 다.
3. 계약 테스트 필수 케이스: (a) `Meta` 왕복 동일 (b) `upsert(touch(e))` 후 `getById(id)?.rev === e.rev + 1` (c) `upsert(markDeleted(e))` 후 `READS` 의 모든 메서드가 그 id 를 반환하지 않음 (d) `// @ts-expect-error` 로 `upsert(plain)` 컴파일 실패 고정 (e) `READS satisfies Record<ReadName, ReadCall>` 전수 대조 — (c) 는 `Object.entries(READS)` 를 순회해 이 맵을 실제로 호출한다.
4. `src/infra/indexeddb/*-repository.ts` 는 `db.ts` 를 import 하지 않는다(린트).
5. `query.ts` 밖에서 Dexie 테이블 API(`where`·`toArray`·`put` …)를 부르는 코드가 없다 — `tables` 가 내보내는 것은 `LiveTable` 브랜드뿐이라 **컴파일 에러**다(린트가 아니라 타입). 새 조회 패턴이 필요하면 `query.ts` 에 헬퍼를 추가한다(그 안에 툼스톤 필터가 들어간다).

## 재검토 트리거

- 동기화 ADR(Phase 2)이 툼스톤 읽기·GC 를 정의할 때 규칙 4·5 를 다시 본다.
- 스펙(`docs/specs/**`)에 삭제 취소(undo)·휴지통이 들어오면 결정 4 를 다시 본다 — `includeDeleted` 옵션이 아니라 `listDeleted` 별도 메서드가 1안이다(그래야 `READS` 전수 대조가 그대로 산다). **발동함**: category R15 되돌리기가 들어왔고, ADR-0009 가 `listDeleted` 대신 "툼스톤 읽기는 `DatasetRepository.readAll` 하나 + 되돌리기는 호출자가 삭제 직전 값을 보관" 으로 결정했다(`READS` 전수 대조는 그대로 산다).
- `ReadName` 이 5개를 넘으면(현재 예정 4개) 조회 API 가 넓어지고 있다는 신호 — 필터 진입점 1개 원칙이 유지되는지 확인한다.
