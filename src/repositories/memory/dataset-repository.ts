// memory 데이터셋 저장소 (ADR-0009). 엔티티 레포지토리와 **별개 계약**이라 툼스톤을 포함해 읽고
// 물리 삭제(`restore`)를 한다 — 그 예외의 근거와 안전 조건은 ADR-0009 결정 2·4 다.
import type { DatasetWrite } from '@/domain/dataset';
import type { Meta } from '@/domain/meta';
import { SETTINGS_ID } from '@/domain/theme/settings';

import type { DatasetRepository } from '@/repositories/dataset-repository';
import {
  allRows,
  put,
  replaceRows,
  type MemoryTable,
  type MemoryTables,
} from '@/repositories/memory/live';
import { RepositoryError } from '@/repositories/repository-error';

/**
 * 에러 `detail` — **엔티티 본문은 싣지 않는다.** 투두 제목·메모 같은 사용자 데이터가 `Error.message`
 * 를 타고 로그·리포팅으로 새면 회수할 수 없고, `JSON.stringify` 는 순환 참조·BigInt 에서 스스로
 * 던져 에러 타입이 `RepositoryError` 가 아니게 된다(그러면 아래 원자성 보장도 같이 깨진다).
 */
function writeDetail(write: unknown, reason: string): string {
  const table: unknown =
    typeof write === 'object' && write !== null ? (write as { table?: unknown }).table : undefined;
  return `${reason} table=${typeof table === 'string' ? table : typeof table}`;
}

/**
 * 원소의 `entity` 축 검증. **1단계(쓰기 전)에 돈다** — 여기를 통과하지 못하면 `put()` 이 한 번도
 * 불리지 않으므로 변화가 0 이다. 이 검사가 없던 시절에는 `table` 은 맞고 `entity` 가 불량인 원소가
 * 1단계를 그냥 지나가 2단계 `put()` 에서 던졌고, **앞의 쓰기가 남아** Dexie 트랜잭션(롤백)과 갈렸다.
 * 검사는 `put` 이 실제로 요구하는 것(`entity.id` 를 Map 키로 쓸 수 있는가)까지만 한다.
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
 * "중간 실패 시 아무것도 쓰지 않는다" 가 성립한다.
 */
function planWrite(tables: MemoryTables, write: DatasetWrite): () => Promise<void> {
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

/**
 * 2단계(적용)를 감싸는 **마지막 그물**. 1단계 검증이 모든 실패를 예견한다는 보장은 없으므로
 * (던지는 getter·Proxy 처럼 값 자체가 이상한 경우), 적용 직전 테이블 스냅샷을 떠 두고 실패하면
 * 되돌린다. Dexie 구현은 트랜잭션이 같은 일을 하므로 이것이 있어야 두 구현의 보장이 같다.
 * 로우는 `put` 이 통째로 갈아끼우므로 Map 얕은 복사로 충분하다.
 */
function snapshotTable<T extends Meta>(table: MemoryTable<T>): () => void {
  const rows = new Map(table.rows);
  return () => {
    table.rows.clear();
    for (const [key, row] of rows) {
      table.rows.set(key, row);
    }
  };
}

function withRollback(tables: MemoryTables, apply: () => Promise<void>): Promise<void> {
  const restores = [
    snapshotTable(tables.todos),
    snapshotTable(tables.categories),
    snapshotTable(tables.focusSessions),
    snapshotTable(tables.settings),
  ];
  return apply().catch((error: unknown) => {
    for (const restore of restores) {
      restore();
    }
    throw error;
  });
}

/** 주어진 테이블 묶음 위에서 동작하는 데이터셋 저장소. */
export function createMemoryDatasetRepository(tables: MemoryTables): DatasetRepository {
  return {
    readAll: async () => {
      // 단일 행의 정의는 **`SETTINGS_ID` 하나**다 — `SettingsRepository.get()` 과 같은 기준으로 읽는다.
      // `id` 오름차순 첫 행을 쓰면 다른 id 의 설정 행이 들어왔을 때 두 API 의 답이 갈린다(계약이 단언한다).
      const settings = allRows(tables.settings).find((row) => row.id === SETTINGS_ID);
      if (settings === undefined) {
        throw new RepositoryError('SETTINGS_MISSING');
      }
      return {
        todos: allRows(tables.todos),
        categories: allRows(tables.categories),
        focusSessions: allRows(tables.focusSessions),
        settings,
      };
    },
    write: async (writes) => {
      // 1단계: 전량 해석·검증(쓰기 없음) — `table`·`entity` 두 축 모두. 2단계: 적용.
      // memory 는 단일 스레드라 이 둘 사이에 끼어들 수 없고, 2단계의 예상 밖 실패는 withRollback 이 되돌린다.
      const appliers = writes.map((write) => planWrite(tables, write));
      await withRollback(tables, async () => {
        for (const apply of appliers) {
          await apply();
        }
      });
    },
    restore: async (snapshot) => {
      replaceRows(tables.todos, snapshot.todos);
      replaceRows(tables.categories, snapshot.categories);
      replaceRows(tables.focusSessions, snapshot.focusSessions);
      replaceRows(tables.settings, [snapshot.settings]);
    },
  };
}
