// IndexedDB 데이터셋 저장소 (ADR-0009). 엔티티 레포지토리와 **별개 계약**이라 툼스톤을 포함해 읽고
// 물리 삭제(`restore`)를 한다 — 그 예외의 근거와 안전 조건은 ADR-0009 결정 2·4 다.
//
// 원자성은 Dexie 트랜잭션 롤백이 준다. 그 위에 memory 구현과 같은 2단계 구조(검증 → 적용)를 얹되,
// **검증이 무엇을 벌어 주는지는 재어 보고 적는다**: 검증을 통째로 지워도 계약 55건이 전부 통과한다
// (Dexie 가 `put(불량값)` 에서 던지고 트랜잭션이 롤백하므로 "변화 0" 은 그대로다 — 실측).
// 그러니 검증의 값은 "부분 쓰기 방지" 가 아니라 둘이다:
//   (1) 실패가 Dexie 내부 에러가 아니라 `RepositoryError('DATASET_WRITE_INVALID')` 로 나간다(UI 가 code 로 분기).
//   (2) 트랜잭션을 열기 전에 끝나므로 잘못된 목록이 DB 에 닿지 않고, 에러 detail 에 사용자 데이터가 실리지 않는다.
// 이 둘은 계약이 단언하지 않으므로 `dataset-atomicity.test.ts` 가 단언한다 — 아니면 이 함수는 죽은 코드다.
import type { DatasetWrite } from '@/domain/dataset';
import type { Meta, Persistable } from '@/domain/meta';
import { SETTINGS_ID } from '@/domain/theme/settings';

import type { DatasetRepository } from '@/repositories/dataset-repository';
import { RepositoryError } from '@/repositories/repository-error';

import {
  allRows,
  bulkPut,
  clear,
  put,
  tables,
  transaction,
  type LiveTable,
} from '@/infra/indexeddb/query';

/** 백업 가져오기의 청크 크기(TECH_PLAN §6·§8 — 5만 행에서 메인 스레드 블로킹을 50ms 단위로 쪼갠다). */
const CHUNK = 500;

/**
 * 에러 `detail` — **엔티티 본문은 싣지 않는다.** 투두 제목·메모 같은 사용자 데이터가 `Error.message` 를
 * 타고 로그로 새면 회수할 수 없고, `JSON.stringify` 는 순환 참조·BigInt 에서 스스로 던져 에러 타입이
 * `RepositoryError` 가 아니게 된다. memory 구현(`repositories/memory/dataset-repository.ts`)과 같은 문장을
 * 쓰는데, 두 구현이 서로를 import 할 수 없어(레이어 방향) 지금은 복제다 — 공통 파일로 올리는 것은
 * `src/repositories/` 소유 티켓의 몫이다.
 */
function writeDetail(write: unknown, reason: string): string {
  const table: unknown =
    typeof write === 'object' && write !== null ? (write as { table?: unknown }).table : undefined;
  return `${reason} table=${typeof table === 'string' ? table : typeof table}`;
}

/**
 * 원소의 `entity` 축 검증. **트랜잭션 밖(1단계)에서 돈다** — 여기를 통과하지 못하면 `put()` 이 한 번도
 * 불리지 않고 트랜잭션도 열리지 않는다. 검사는 저장이 실제로 요구하는 것(객체인가 · `id` 가 기본 키로
 * 쓸 수 있는 문자열인가)까지만 한다. 구조적 복제 가능 여부까지는 보지 않는다 — 그건 Dexie 가 트랜잭션
 * 안에서 잡고 롤백한다(`dataset-atomicity.test.ts` 의 복제 불가 로우 주입이 그 경로다).
 */
function checkedEntity<W extends DatasetWrite>(write: W): W['entity'] {
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
 * "중간 실패 시 아무것도 쓰지 않는다" 가 트랜잭션 없이도 성립한다.
 */
function planWrite(write: DatasetWrite): () => Promise<void> {
  if (typeof write !== 'object' || write === null) {
    throw new RepositoryError('DATASET_WRITE_INVALID', writeDetail(write, '원소가 객체가 아니다'));
  }
  switch (write.table) {
    case 'todos': {
      const entity = checkedEntity(write);
      return () => put(tables.todos, entity);
    }
    case 'categories': {
      const entity = checkedEntity(write);
      return () => put(tables.categories, entity);
    }
    case 'focusSessions': {
      const entity = checkedEntity(write);
      return () => put(tables.focusSessions, entity);
    }
    case 'settings': {
      const entity = checkedEntity(write);
      return () => put(tables.settings, entity);
    }
    default:
      throw new RepositoryError(
        'DATASET_WRITE_INVALID',
        writeDetail(write, '계약에 없는 테이블이다'),
      );
  }
}

/** 한 테이블을 비우고 스냅샷으로 채운다. 청크로 쪼개 한 번의 `bulkPut` 이 지나치게 커지지 않게 한다. */
async function replaceRows<T extends Meta>(
  table: LiveTable<T, string>,
  rows: readonly Persistable<T>[],
): Promise<void> {
  await clear(table);
  for (let from = 0; from < rows.length; from += CHUNK) {
    await bulkPut(table, rows.slice(from, from + CHUNK));
  }
}

/** Dexie 테이블 위에서 동작하는 데이터셋 저장소. */
export function createIndexedDbDatasetRepository(): DatasetRepository {
  return {
    readAll: async () => {
      // 단일 행의 정의는 **`SETTINGS_ID` 하나**다 — `SettingsRepository.get()` 과 같은 기준으로 읽는다.
      // `id` 오름차순 첫 행을 쓰면 다른 id 의 설정 행이 들어왔을 때 두 API 의 답이 갈린다(계약이 단언한다).
      const settings = (await allRows(tables.settings)).find((row) => row.id === SETTINGS_ID);
      if (settings === undefined) {
        throw new RepositoryError('SETTINGS_MISSING');
      }
      return {
        todos: await allRows(tables.todos),
        categories: await allRows(tables.categories),
        focusSessions: await allRows(tables.focusSessions),
        settings,
      };
    },
    write: async (writes) => {
      // 1단계: 전량 해석·검증(쓰기 없음, 트랜잭션 밖). 2단계: 트랜잭션 안에서 적용 — 여기서 나는
      // 실패는 Dexie 가 롤백한다. 콜백 안에는 Dexie 가 아닌 `await` 가 없다(query.ts 의 transaction 주석).
      const appliers = writes.map(planWrite);
      await transaction(async () => {
        for (const apply of appliers) {
          await apply();
        }
      });
    },
    restore: async (snapshot) => {
      await transaction(async () => {
        await replaceRows(tables.todos, snapshot.todos);
        await replaceRows(tables.categories, snapshot.categories);
        await replaceRows(tables.focusSessions, snapshot.focusSessions);
        await replaceRows(tables.settings, [snapshot.settings]);
      });
    },
  };
}
