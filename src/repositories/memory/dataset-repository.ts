// memory 데이터셋 저장소 (ADR-0009). 엔티티 레포지토리와 **별개 계약**이라 툼스톤을 포함해 읽고
// 물리 삭제(`restore`)를 한다 — 그 예외의 근거와 안전 조건은 ADR-0009 결정 2·4 다.
import type { DatasetWrite } from '@/domain/dataset';

import type { DatasetRepository } from '@/repositories/dataset-repository';
import { allRows, put, replaceRows, type MemoryTables } from '@/repositories/memory/live';
import { RepositoryError } from '@/repositories/repository-error';

/**
 * 한 건의 쓰기를 **적용 함수로 바꾸기만** 한다. 계약에 없는 테이블이면 여기서 던지므로,
 * 목록 전체를 먼저 이 함수에 통과시키면 "중간 실패 시 아무것도 쓰지 않는다" 가 성립한다.
 */
function planWrite(tables: MemoryTables, write: DatasetWrite): () => Promise<void> {
  switch (write.table) {
    case 'todos': {
      const { entity } = write;
      return () => put(tables.todos, entity);
    }
    case 'categories': {
      const { entity } = write;
      return () => put(tables.categories, entity);
    }
    case 'focusSessions': {
      const { entity } = write;
      return () => put(tables.focusSessions, entity);
    }
    case 'settings': {
      const { entity } = write;
      return () => put(tables.settings, entity);
    }
    default:
      throw new RepositoryError('DATASET_WRITE_INVALID', JSON.stringify(write));
  }
}

/** 주어진 테이블 묶음 위에서 동작하는 데이터셋 저장소. */
export function createMemoryDatasetRepository(tables: MemoryTables): DatasetRepository {
  return {
    readAll: async () => {
      const settings = allRows(tables.settings).at(0);
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
      // 1단계: 전량 해석·검증(쓰기 없음). 2단계: 적용. memory 는 단일 스레드라 이 둘 사이에 끼어들 수 없다.
      const appliers = writes.map((write) => planWrite(tables, write));
      for (const apply of appliers) {
        await apply();
      }
    },
    restore: async (snapshot) => {
      replaceRows(tables.todos, snapshot.todos);
      replaceRows(tables.categories, snapshot.categories);
      replaceRows(tables.focusSessions, snapshot.focusSessions);
      replaceRows(tables.settings, [snapshot.settings]);
    },
  };
}
