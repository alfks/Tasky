<!-- 읽기 조건: 엔티티를 저장·삭제·조회하는 코드(domain/meta.ts, repositories, infra, feature store)를 쓰기 전. UI 만 만질 때는 불필요. -->

# ADR-0007: 쓰기 경로 브랜드(`Persistable`)와 툼스톤 조회 규칙

- 상태: accepted
- 날짜: 2026-09-15
- 관련: ADR-0005(규칙 4·5 를 구체화 — supersede 아님), ADR-0002, docs/conventions/code-style.md §5·§11

## 맥락
ADR-0005 는 `rev`·`updatedAt` 갱신을 도메인 `touch()` 한 곳으로 정했지만 강제 수단이 관례와 리뷰뿐이었다. 스토어가 `repo.upsert({ ...todo, done: true })` 로 저장하면 `rev` 가 그대로 남고, Phase 2 LWW 에서 그 로우는 항상 지는 쪽이 되어 편집이 조용히 사라진다. 소프트 삭제 필터도 "조회 메서드마다 기억할 규칙" 이었고 `getById` 의 툼스톤 동작은 어디에도 없었다.

## 결정
**저장 가능한 값은 타입으로만 만들어지고, 툼스톤은 조회 API 밖에 있다.**
1. 브랜드 타입: `src/domain/meta.ts` 가 `Persistable<T extends Meta> = T & { readonly [PERSISTABLE]: true }`(`declare const PERSISTABLE: unique symbol` — 런타임 흔적 없음)를 정의한다. 이 타입을 만드는 함수는 같은 파일의 `createMeta(deps)`, `touch(e, now)`, `markDeleted(e, now)` 셋뿐이다.
2. 레포지토리의 쓰기 메서드는 `upsert(entity: Persistable<T>): Promise<void>` 하나. 조회는 브랜드 없는 `T` 를 돌려주므로 읽은 값을 그대로, 또는 스프레드해서 다시 저장하면 **컴파일 에러**(TS2345 — 실측). `remove()` 는 없다: 삭제는 `upsert(markDeleted(e, deps.now()))`.
3. 린트 보조(`eslint.config.mjs`): `src/domain/meta.ts` 밖에서 `rev`·`updatedAt`·`createdAt`·`deletedAt` 를 객체 리터럴·대입으로 **쓰면** 에러(읽기·구조분해는 허용), `as Persistable<…>` 캐스팅 에러. `src/infra/indexeddb/db.ts` 는 `query.ts` 만 import 할 수 있다.
4. 툼스톤 조회: 모든 조회 메서드는 툼스톤을 반환하지 않는다 — `getById` 는 `undefined`, `list*`/`get` 은 제외. `includeDeleted` 옵션은 MVP 에 두지 않는다(호출처가 없다). Phase 2 동기화는 별도 인터페이스(`SyncRepository.listChangedSince`)로 툼스톤을 읽는다.
5. 필터 위치: IndexedDB 에서는 `src/infra/indexeddb/query.ts` 의 `liveAll()`/`liveOne()`/`put()` 만 테이블에 닿는다(3 이 강제). memory 구현도 같은 이름의 헬퍼 하나를 거친다. 필터를 빼먹을 수 있는 코드 경로가 하나뿐이다.
6. 계약 테스트(`*.contract.test.ts`, memory·indexeddb 공용)는 조회 메서드 목록 `READS` 를 `satisfies` 로 인터페이스와 대조한다 — 메서드를 추가하고 목록을 안 고치면 typecheck 가 실패한다.

## 대안과 기각 이유
| 대안 | 기각 이유 |
|------|----------|
| `upsert` 입력에서 `Omit<Meta, 'rev' \| 'updatedAt'>` 를 받고 레포지토리가 채움 | ADR-0005 "레포지토리는 저장만" 위반. 두 구현이 각자 시각·rev 를 만들어 계약 테스트가 복잡해지고 memory/indexeddb 가 갈릴 수 있다 |
| 런타임 심볼 브랜드 | IndexedDB 직렬화에 심볼이 못 들어가 저장 직전에 벗겨야 한다. 타입 전용이면 비용 0 |
| `getById` 가 툼스톤을 반환 | 상세/편집 경로에서 삭제 항목이 되살아나는 버그 경로. 필요해지면 옵션이 아니라 별도 메서드 |
| `includeDeleted: true` 옵션 | MVP 에 호출처가 없다. 옵션은 기본값 실수의 통로 |
| `remove(id, now)` 유지 | 레포지토리가 도메인 함수를 호출해야 해 "저장만" 이 깨지고 쓰기 경로가 둘이 된다 |

## 결과
- 좋은 점: `touch()` 우회가 컴파일 단계에서 막힌다. 조회 필터 누락이 구조적으로 불가능(진입점 1개 + 계약 테스트 전수 대조).
- 감수하는 점: `{ ...touch(e, now), done: true }` 처럼 touch **뒤** 스프레드는 브랜드가 남는다 — `rev` 는 이미 +1 됐으므로 LWW 에 무해. 픽스처(`src/test/**`, `*.test.*`)는 Meta 리터럴 허용.

## 지켜야 할 규칙 (검증 가능한 문장 — 리뷰 판정 근거)
1. `Persistable` 를 반환하는 함수는 `src/domain/meta.ts` 에만 있다. 다른 파일의 `as Persistable` 은 린트 에러.
2. 레포지토리 인터페이스에 `remove`·`delete` 메서드가 없다. 쓰기 메서드는 `upsert` 뿐이며 인자 타입은 `Persistable<T>`.
3. 계약 테스트 필수 케이스: (a) `Meta` 왕복 동일 (b) `upsert(touch(e))` 후 `getById(id)?.rev === e.rev + 1` (c) `upsert(markDeleted(e))` 후 `READS` 의 모든 메서드가 그 id 를 반환하지 않음 (d) `// @ts-expect-error` 로 `upsert(plain)` 컴파일 실패 고정 (e) `READS satisfies` 전수 대조.
4. `src/infra/indexeddb/*-repository.ts` 는 `db.ts` 를 import 하지 않는다(린트).

## 재검토 트리거
- 동기화 ADR(Phase 2)이 툼스톤 읽기·GC 를 정의할 때 규칙 4·5 를 다시 본다.
