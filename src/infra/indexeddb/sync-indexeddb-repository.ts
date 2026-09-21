// IndexedDB 동기화 저장소(ADR-0018). `Store.sync`(`sync-store.ts`, 순수 Dexie 배관) 위에서
// `planClientMerge`(`@/domain/sync/client-merge`)·`reconcileAck`(`@/domain/sync/outbox`) 판정을
// 적용한다 — memory `sync-repository.ts` 와 같은 자리다. 이 파일은 지연 청크(`repositories-*.js`)
// 안에 있으므로 `wire.ts` 값(`SYNC_TABLES`)을 자유롭게 쓴다(§C-6, memory 쪽의 진입 청크 제약이 없다).
import { planClientMerge } from '@/domain/sync/client-merge';
import { reconcileAck } from '@/domain/sync/outbox';
import { SYNC_TABLES, type SyncTable } from '@/domain/sync/wire';

import {
  pick,
  type ApplyRemoteResult,
  type OutboxRow,
  type RemoteWrite,
  type SyncRepository,
} from '@/repositories/sync-repository';

import { type Store } from '@/infra/indexeddb/query';

function zeroAdopted(): Record<SyncTable, number> {
  const result = {} as Record<SyncTable, number>;
  for (const tbl of SYNC_TABLES) {
    result[tbl] = 0;
  }
  return result;
}

/** 주어진 묶음(= 하나의 Dexie 인스턴스) 위에서 동작하는 동기화 저장소. */
export function createIndexedDbSyncRepository(store: Store): SyncRepository {
  const sync = store.sync;

  return {
    getState: () => sync.stateGet(),
    setState: (state) => sync.statePut(state),

    listOutbox: (limit) => sync.outboxList(limit),
    countOutbox: () => sync.outboxCount(),

    readForPush: async (entries) => {
      const rows = await Promise.all(entries.map((entry) => sync.getAny(entry.tbl, entry.id)));
      return entries.map((entry, index): OutboxRow => ({ entry, row: rows[index] }));
    },

    ackOutbox: (pushed) =>
      sync.withOutboxTransaction(async () => {
        for (const change of pushed) {
          const queued = await sync.outboxGet(change.tbl, change.id);
          if (queued !== undefined && reconcileAck(queued, change) === 'remove') {
            await sync.outboxDelete(change.tbl, change.id);
          }
        }
      }),

    dropOutbox: (keys) =>
      sync.withOutboxTransaction(async () => {
        for (const key of keys) {
          await sync.outboxDelete(key.tbl, key.id);
        }
      }),

    enqueueAll: async () => {
      let count = 0;
      await sync.withOutboxTransaction(async () => {
        for (const tbl of SYNC_TABLES) {
          const rows = await sync.allRows(tbl);
          for (const row of rows) {
            await sync.outboxPut({ tbl, ...pick(row, ['id', 'rev']) });
            count += 1;
          }
        }
      });
      return count;
    },

    applyRemote: async (rows: readonly RemoteWrite[]): Promise<ApplyRemoteResult> => {
      const adopted = zeroAdopted();
      let kept = 0;
      let droppedOutbox = 0;
      await sync.withOutboxTransaction(async () => {
        for (const row of rows) {
          const local = await sync.getAny(row.tbl, row.entity.id);
          const inOutbox = (await sync.outboxGet(row.tbl, row.entity.id)) !== undefined;
          const action = planClientMerge({ local, inOutbox });
          if (action.action === 'keep-local') {
            kept += 1;
            continue;
          }
          await sync.putRemote(row.tbl, row.entity);
          adopted[row.tbl] += 1;
          if (action.action === 'adopt-remote-and-drop-outbox') {
            await sync.outboxDelete(row.tbl, row.entity.id);
            droppedOutbox += 1;
          }
        }
      });
      return { adopted, kept, droppedOutbox };
    },

    existingIds: async (tbl, ids) => {
      const rows = await sync.bulkGetAny(tbl, ids);
      const found = new Set<string>();
      ids.forEach((id, index) => {
        if (rows[index] !== undefined) {
          found.add(id);
        }
      });
      return found;
    },

    wipeLocal: () => sync.wipeLocal(),
  };
}
