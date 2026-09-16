// memory 데이터셋 저장소 (ADR-0009). 엔티티 레포지토리와 **별개 계약**이라 툼스톤을 포함해 읽고
// 물리 삭제(`restore`)를 한다 — 그 예외의 근거와 안전 조건은 ADR-0009 결정 2·4 다.
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
import { planWrite, type DatasetWriteAppliers } from '@/repositories/write-plan';

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

/** 테이블별 실제 쓰기 — `planWrite` 에 넘기는 유일한 구현별 조각이다. */
function puttersFor(tables: MemoryTables): DatasetWriteAppliers {
  return {
    todos: (entity) => put(tables.todos, entity),
    categories: (entity) => put(tables.categories, entity),
    focusSessions: (entity) => put(tables.focusSessions, entity),
    settings: (entity) => put(tables.settings, entity),
  };
}

/** 주어진 테이블 묶음 위에서 동작하는 데이터셋 저장소. */
export function createMemoryDatasetRepository(tables: MemoryTables): DatasetRepository {
  const putters = puttersFor(tables);
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
      const appliers = writes.map((write) => planWrite(putters, write));
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
