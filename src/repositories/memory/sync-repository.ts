// memory 동기화 저장소 (ADR-0018). **진입 청크에 정적으로 실린다**(`shell-storage-store.ts` 가
// `createMemoryRepositories` 를 정적 import 한다, §C-6) — 그래서 이 파일은 순수 함수만 끌고 온다:
// `planClientMerge`(`@/domain/sync/client-merge`)와 `reconcileAck`(`@/domain/sync/outbox`) 뿐이다.
// `readRemoteRow`·`server-rules.ts`·`wire.ts` 의 **값**(런타임 export)은 여기서 import 하지 않는다
// (검증은 호출부인 엔진의 몫, 7테이블 이름은 아래 `ENTITY_TABLES` 로 자급한다 — `wire.ts#SYNC_TABLES`
// 와 같은 모양을 재선언한 것뿐이다, `src/lib/AGENTS.md` 의 "동형 재선언은 복제로 보지 않는다"와 같은 판단).
import type { Meta } from '@/domain/meta';
import { planClientMerge } from '@/domain/sync/client-merge';
import { reconcileAck } from '@/domain/sync/outbox';
import type { SyncTable } from '@/domain/sync/wire';

import { putRemote, type MemoryTable, type MemoryTables } from '@/repositories/memory/live';
import {
  pick,
  type ApplyRemoteResult,
  type EntityOf,
  type OutboxRow,
  type RemoteWrite,
  type SyncRepository,
} from '@/repositories/sync-repository';

/** `wire.ts#SYNC_TABLES` 와 같은 모양의 로컬 재선언(위 머리주석) — 값을 import 하지 않기 위해서다. */
const ENTITY_TABLES = [
  'todos',
  'categories',
  'settings',
  'focusSessions',
  'ddays',
  'diaryEntries',
  'routines',
] as const satisfies readonly SyncTable[];

/** 아웃박스 맵의 키. `live.ts` 의 것과 같은 모양이다(그 파일 것은 export 되지 않는다). */
function outboxKey(tbl: SyncTable, id: string): string {
  return `${tbl}|${id}`;
}

/** `tbl` → 그 `MemoryTable`. 한 곳에서만 캐스팅한다(`query.ts` 의 `raw`/`brand` 와 같은 경계 패턴). */
function tableFor<K extends SyncTable>(tables: MemoryTables, tbl: K): MemoryTable<EntityOf<K>> {
  const byName: Record<SyncTable, MemoryTable<Meta>> = {
    todos: tables.todos,
    categories: tables.categories,
    settings: tables.settings,
    focusSessions: tables.focusSessions,
    ddays: tables.ddays,
    diaryEntries: tables.diaryEntries,
    routines: tables.routines,
  };
  return byName[tbl] as unknown as MemoryTable<EntityOf<K>>;
}

function zeroAdopted(): Record<SyncTable, number> {
  const result = {} as Record<SyncTable, number>;
  for (const tbl of ENTITY_TABLES) {
    result[tbl] = 0;
  }
  return result;
}

/** 주어진 테이블 묶음 위에서 동작하는 동기화 저장소. */
export function createMemorySyncRepository(tables: MemoryTables): SyncRepository {
  return {
    getState: async () => tables.syncState.row,
    setState: async (state) => {
      tables.syncState.row = { ...state };
    },

    listOutbox: async (limit) => [...tables.syncOutbox.values()].slice(0, Math.max(0, limit)),
    countOutbox: async () => tables.syncOutbox.size,

    readForPush: async (entries) =>
      entries.map((entry): OutboxRow => {
        const table = tableFor(tables, entry.tbl);
        return { entry, row: table.rows.get(entry.id) };
      }),

    ackOutbox: async (pushed) => {
      for (const change of pushed) {
        const key = outboxKey(change.tbl, change.id);
        const queued = tables.syncOutbox.get(key);
        if (queued !== undefined && reconcileAck(queued, change) === 'remove') {
          tables.syncOutbox.delete(key);
        }
      }
    },

    dropOutbox: async (keys) => {
      for (const key of keys) {
        tables.syncOutbox.delete(outboxKey(key.tbl, key.id));
      }
    },

    enqueueAll: async () => {
      let count = 0;
      for (const tbl of ENTITY_TABLES) {
        const table = tableFor(tables, tbl);
        for (const row of table.rows.values()) {
          table.outbox.set(outboxKey(tbl, row.id), { tbl, ...pick(row, ['id', 'rev']) });
          count += 1;
        }
      }
      return count;
    },

    applyRemote: async (rows: readonly RemoteWrite[]): Promise<ApplyRemoteResult> => {
      const adopted = zeroAdopted();
      let kept = 0;
      let droppedOutbox = 0;
      for (const row of rows) {
        const table = tableFor(tables, row.tbl);
        const local = table.rows.get(row.entity.id);
        const inOutbox = table.outbox.has(outboxKey(row.tbl, row.entity.id));
        const action = planClientMerge({ local, inOutbox });
        if (action.action === 'keep-local') {
          kept += 1;
          continue;
        }
        await putRemote(table, row.entity);
        adopted[row.tbl] += 1;
        if (action.action === 'adopt-remote-and-drop-outbox') {
          table.outbox.delete(outboxKey(row.tbl, row.entity.id));
          droppedOutbox += 1;
        }
      }
      return { adopted, kept, droppedOutbox };
    },

    existingIds: async (tbl, ids) => {
      const table = tableFor(tables, tbl);
      const found = new Set<string>();
      for (const id of ids) {
        if (table.rows.has(id)) {
          found.add(id);
        }
      }
      return found;
    },

    wipeLocal: async () => {
      for (const tbl of ENTITY_TABLES) {
        tableFor(tables, tbl).rows.clear();
      }
      tables.syncOutbox.clear();
      const current = tables.syncState.row;
      tables.syncState.row =
        current === undefined ? undefined : { deviceId: current.deviceId, cursor: 0 };
    },
  };
}
