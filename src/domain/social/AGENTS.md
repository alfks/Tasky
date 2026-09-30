<!-- 읽기 조건: Phase 3 소셜 타입·입력 검증·상태 전이·권한·멱등 계약을 추가하거나 수정할 때. -->

# src/domain/social/ — AGENTS

## 목적

클라이언트·메모리 구현·Worker가 공유하는 순수 계약이다. 공개 DTO, 입력 검증, 상태 전이와 권한·멱등 벡터를 이곳에 둔다.

## 규칙

1. React, Dexie, Worker 환경, 저장소 구현을 import하지 않는다. 시각·난수·해시는 호출자가 주입한다.
2. 공개 DTO에는 구글 식별자, 세션, 원본 할 일/카테고리 id·메모를 넣지 않는다. ADR-0024의 별도 공개 category id와 확인한 metadata만 허용한다. 서버 actor 사실과 공개 요청 타입을 분리한다.
3. 순수 권한 판정은 SQL 내부의 현재 세션·관계·차단 검사를 대신하지 않는다. 구현은 같은 벡터를 직접 실행한다.
4. 개인 `Meta`·`Persistable`·LWW와 독립이다. 상태 전이는 서버 version과 예상 version으로 판정한다.
5. export 함수마다 단위 테스트를 두고 실제 메모리/Worker 계약 테스트가 `social-vectors.ts`를 복사 없이 import한다.
