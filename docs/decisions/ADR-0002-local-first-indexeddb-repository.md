<!-- 읽기 조건: domain / repositories / infra 를 수정하거나, 저장 방식·스키마·동기화를 논의하기 전. -->

# ADR-0002: 로컬 우선 데이터 — IndexedDB(Dexie) + Repository 패턴 + 소프트 삭제

- 상태: accepted
- 날짜: 2026-09-15
- 관련: docs/ARCHITECTURE.md §1·§4·§5, ADR-0001

## 맥락
MVP는 서버 없이 동작해야 하며, Phase 2에서 클라우드 동기화와 SNS로 확장한다. 저장소 구현이 UI에 새어 나가면 확장 시 전면 수정이 필요하다.

## 결정
도메인은 프레임워크 의존 0. 저장은 `src/repositories`의 인터페이스로만 접근하고, 구현은 `src/infra/indexeddb`(Dexie 4). 런타임 주입은 `setRepositories()` 컨테이너.
- Dexie: 버전/마이그레이션 내장, 인덱스 선언이 명시적, fake-indexeddb로 테스트 가능.
- 모든 엔티티에 `createdAt/updatedAt/deletedAt?` + 클라이언트 생성 ID(nanoid) → 후일 동기화 충돌 해결 키.
- 삭제는 소프트 삭제(`deletedAt`). 목록 조회는 기본적으로 제외.

## 대안과 기각 이유
| 대안 | 기각 이유 |
|------|----------|
| `localStorage` JSON | 용량·성능·트랜잭션 없음, 마이그레이션 불가 |
| 순수 `idb` 래퍼 | 마이그레이션·인덱스 관리를 직접 구현해야 함 |
| Dexie liveQuery를 컴포넌트에서 직접 사용 | 저장소 구현이 UI에 결합, 교체 불가 |
| 처음부터 서버 DB | MVP 범위 초과, 오프라인 우선 UX 저해 |

## 결과
- 좋은 점: 테스트에서 memory 구현으로 교체, 동기화 어댑터를 인터페이스 뒤에 추가 가능.
- 감수하는 점: 컨테이너 주입 보일러플레이트, liveQuery의 자동 반응성을 포기(스토어가 갱신 책임).

## 지켜야 할 규칙
1. `infra`를 import하는 파일은 `src/app/providers.tsx`, `src/test/setup.ts` 뿐.
2. 레포지토리 인터페이스는 도메인 타입만 노출. Dexie 타입 금지.
3. 스키마 변경은 `db.ts`의 새 `version(n+1)` + 마이그레이션 테스트 + 새 ADR.
4. 물리 삭제 금지(`deletedAt`). 엔티티 공통 필드 유지.
5. 계약 테스트(`*.contract.test.ts`)를 memory·indexeddb 구현 둘 다 통과.
