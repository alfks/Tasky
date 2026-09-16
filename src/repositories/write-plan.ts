// `DatasetRepository.write` 의 **1단계(해석·검증)** — memory·indexeddb 두 구현이 같은 함수를 쓴다.
//
// 왜 여기인가: 두 구현은 서로를 import 할 수 없고(레이어 방향: infra → repositories 만 허용), 그래서
// 예전에는 아래 세 함수가 `memory/dataset-repository.ts` 와 `infra/indexeddb/dataset-indexeddb-repository.ts`
// 에 **글자 단위로 같은 본문**으로 복제돼 있었다(주석만 각 구현의 사정을 적어 달랐다). 복제는 한쪽만
// 고쳐도 계약 테스트가 통과하는 종류의 차이를 만든다 — `entity` 축 검증이 memory 에만 있던 시절이
// 정확히 그랬다(계약이 그 축을 주입하지 않아 두 구현의 보장이 갈린 채로 초록이었다).
//
// 두 구현의 차이는 "어느 테이블에 어떻게 쓰는가" 하나뿐이라, 그 부분만 `DatasetWriteAppliers` 로 받는다.
import type { DatasetWrite } from '@/domain/dataset';

import { RepositoryError } from '@/repositories/repository-error';

/**
 * 테이블별 실제 쓰기. 구현이 넣는 유일한 조각이다(memory 는 Map, indexeddb 는 Dexie 테이블).
 *
 * `DatasetWrite` 에서 파생된 매핑 타입이라 **테이블이 하나 늘면 두 구현 모두 컴파일 에러**가 난다 —
 * 예전처럼 한쪽에만 `case` 를 더하고 지나갈 수 없다.
 */
export type DatasetWriteAppliers = {
  readonly [K in DatasetWrite['table']]: (
    entity: Extract<DatasetWrite, { table: K }>['entity'],
  ) => Promise<void>;
};

/**
 * 에러 `detail` — **엔티티 본문은 싣지 않는다.** 투두 제목·메모 같은 사용자 데이터가 `Error.message`
 * 를 타고 로그·리포팅으로 새면 회수할 수 없고, `JSON.stringify` 는 순환 참조·BigInt 에서 스스로
 * 던져 에러 타입이 `RepositoryError` 가 아니게 된다(그러면 아래 원자성 보장도 같이 깨진다).
 */
export function writeDetail(write: unknown, reason: string): string {
  const table: unknown =
    typeof write === 'object' && write !== null ? (write as { table?: unknown }).table : undefined;
  return `${reason} table=${typeof table === 'string' ? table : typeof table}`;
}

/**
 * 원소의 `entity` 축 검증. **적용 전(1단계)에 돈다** — 여기를 통과하지 못하면 어느 구현에서도 쓰기가
 * 한 번도 일어나지 않는다(indexeddb 는 트랜잭션조차 열지 않는다). 이 검사가 없던 시절에는 `table` 은
 * 맞고 `entity` 가 불량인 원소가 1단계를 그냥 지나가 2단계 `put()` 에서 던졌고, memory 에는 **앞의
 * 쓰기가 남아** Dexie 트랜잭션(롤백)과 갈렸다.
 *
 * 검사는 저장이 실제로 요구하는 것(객체인가 · `id` 를 기본 키/Map 키로 쓸 수 있는 문자열인가)까지만
 * 한다. 구조적 복제 가능 여부까지는 보지 않는다 — 그건 Dexie 가 트랜잭션 안에서 잡고 롤백한다
 * (`dataset-atomicity.test.ts` 의 복제 불가 로우 주입이 그 경로다).
 */
export function checkedEntity<W extends DatasetWrite>(write: W): W['entity'] {
  const entity: unknown = write.entity;
  if (typeof entity !== 'object' || entity === null) {
    throw new RepositoryError(
      'DATASET_WRITE_INVALID',
      writeDetail(write, 'entity 가 객체가 아니다'),
    );
  }
  const id: unknown = (entity as { id?: unknown }).id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new RepositoryError('DATASET_WRITE_INVALID', writeDetail(write, 'entity.id 가 없다'));
  }
  return write.entity;
}

/**
 * 한 건의 쓰기를 **적용 함수로 바꾸기만** 한다. 계약에 없는 테이블(`table` 축)도 불량 엔티티
 * (`entity` 축)도 여기서 던지므로, 목록 전체를 먼저 이 함수에 통과시키면 두 축 모두에서
 * "중간 실패 시 아무것도 쓰지 않는다" 가 성립한다(indexeddb 는 트랜잭션 없이도 성립한다).
 */
export function planWrite(
  appliers: DatasetWriteAppliers,
  write: DatasetWrite,
): () => Promise<void> {
  if (typeof write !== 'object' || write === null) {
    throw new RepositoryError('DATASET_WRITE_INVALID', writeDetail(write, '원소가 객체가 아니다'));
  }
  switch (write.table) {
    case 'todos': {
      const entity = checkedEntity(write);
      return () => appliers.todos(entity);
    }
    case 'categories': {
      const entity = checkedEntity(write);
      return () => appliers.categories(entity);
    }
    case 'focusSessions': {
      const entity = checkedEntity(write);
      return () => appliers.focusSessions(entity);
    }
    case 'settings': {
      const entity = checkedEntity(write);
      return () => appliers.settings(entity);
    }
    default:
      throw new RepositoryError(
        'DATASET_WRITE_INVALID',
        writeDetail(write, '계약에 없는 테이블이다'),
      );
  }
}
