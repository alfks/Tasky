<!-- 읽기 조건: domain / repositories / infra 를 수정하거나, 저장 방식·스키마를 논의하기 전. 공통 필드·ID·시각·삭제·충돌 정책은 ADR-0005. -->

# ADR-0002: 로컬 우선 데이터 — IndexedDB(Dexie) + Repository 패턴

- 상태: accepted
- 날짜: 2026-09-15
- 관련: docs/ARCHITECTURE.md §1·§4·§5·§6, ADR-0001, ADR-0005(엔티티 공통 필드·동기화 대비 규칙)

## 맥락

MVP는 서버 없이 동작해야 하며, Phase 2에서 클라우드 동기화와 SNS로 확장한다. 저장소 구현이 UI에 새어 나가면 확장 시 전면 수정이 필요하다.

## 결정

도메인은 프레임워크 의존 0. 저장은 `src/repositories`의 인터페이스로만 접근하고, 구현은 `src/infra/indexeddb`(Dexie 4). 런타임 주입은 `setRepositories()` 컨테이너.

- Dexie: 버전/마이그레이션 내장, 인덱스 선언이 명시적, fake-indexeddb로 테스트 가능.
- 엔티티 공통 필드(`Meta`)·ID 형식·시각 의미·소프트 삭제·충돌 정책은 **ADR-0005**가 정한다(이 ADR 초판의 "nanoid·`updatedAt` 충돌 키" 문구는 ADR-0005가 대체).
- 레포지토리는 도메인이 `touch`로 갱신한 엔티티를 **저장만** 한다(시각·`rev`를 만들지 않는다).

## 대안과 기각 이유

| 대안                                     | 기각 이유                                   |
| ---------------------------------------- | ------------------------------------------- |
| `localStorage` JSON                      | 용량·성능·트랜잭션 없음, 마이그레이션 불가  |
| 순수 `idb` 래퍼                          | 마이그레이션·인덱스 관리를 직접 구현해야 함 |
| Dexie liveQuery를 컴포넌트에서 직접 사용 | 저장소 구현이 UI에 결합, 교체 불가          |
| 처음부터 서버 DB                         | MVP 범위 초과, 오프라인 우선 UX 저해        |

## 결과

- 좋은 점: 테스트에서 memory 구현으로 교체, 동기화 어댑터를 인터페이스 뒤에 추가 가능.
- 감수하는 점: 컨테이너 주입 보일러플레이트, liveQuery의 자동 반응성을 포기(스토어가 갱신 책임).

## 지켜야 할 규칙

1. `infra` 밖의 비테스트 파일 중 `infra`를 import하는 것은 `src/app/providers.tsx` **하나뿐**이다(`infra` 내부끼리는 당연히 서로 import 한다) — `pnpm lint`(`import/no-restricted-paths`)와 2차 패스가 막는다(ARCHITECTURE.md §1, 실측). `src/test/setup.ts` 도 `infra` 를 import 하지만 그것은 테스트 계층이라 경계가 면제된 것이다(금지 목록의 예외가 아니다).
2. 레포지토리 인터페이스는 도메인 타입만 노출. Dexie 타입 금지.
3. 스키마 변경은 `db.ts`의 새 `version(n+1)` + 마이그레이션 테스트 + 새 ADR.
4. 공통 필드·삭제·갱신 규칙은 ADR-0005 규칙 1~5를 따른다.
5. 계약 테스트(`*.contract.test.ts`)를 memory·indexeddb 구현 둘 다 통과.
