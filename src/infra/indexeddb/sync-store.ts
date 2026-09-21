// syncOutbox·syncState 두 스토어의 실제 Dexie 접근(ADR-0018). `query.ts` 가 이미 326줄이라
// (code-style §5) 이 조각을 여기로 뺀다 — `dexie` **타입만** import 하고 `db.ts` 는 import 하지
// 않으므로 `NO_DB_IMPORT`(query.ts 머리주석)가 그대로 유지된다. 테이블 이름은 `database.table(name)`
// 으로 제네릭하게 얻는다 — `TaskyDb`(db.ts)를 몰라도 되는 이유다.
//
// 이 파일은 **순수 Dexie 배관**만 한다(memory 쪽 `live.ts` 와 같은 자리) — `planClientMerge`·
// `reconcileAck` 같은 판정은 여기서 하지 않고, 호출부인 `sync-indexeddb-repository.ts`(memory
// `sync-repository.ts` 와 같은 자리)가 콜백으로 주입하거나 반환값을 받아 스스로 정한다. 대신
// indexeddb 구현은 진입 청크 제약이 없으므로(§C-6) 트랜잭션 경계만 여기서 정확히 잡아 준다.

import type { Meta } from '@/domain/meta';
import type { OutboxEntry } from '@/domain/sync/outbox';
import type { SyncState, SyncTable } from '@/domain/sync/wire';

import type { Dexie, Table } from 'dexie';

/** `db.ts#STORES` 의 일곱 엔티티 테이블 이름. 값을 다시 만들지 않고 이름만 나열한다(§A-1 memory
 * 구현의 `ENTITY_TABLES` 와 같은 재선언 — `db.ts` 를 import 하지 않기 위해서다). */
const ENTITY_TABLES: readonly SyncTable[] = [
  'todos',
  'categories',
  'settings',
  'focusSessions',
  'ddays',
  'diaryEntries',
  'routines',
];

const SYNC_STATE_ID = 'default';

export type SyncStore = {
  stateGet(): Promise<SyncState | undefined>;
  statePut(state: SyncState): Promise<void>;

  outboxList(limit: number): Promise<OutboxEntry[]>;
  outboxCount(): Promise<number>;
  outboxGet(tbl: SyncTable, id: string): Promise<OutboxEntry | undefined>;
  outboxPut(entry: OutboxEntry): Promise<void>;
  outboxDelete(tbl: SyncTable, id: string): Promise<void>;

  /** 툼스톤 **포함** 단건 조회(기본 키). */
  getAny(tbl: SyncTable, id: string): Promise<Meta | undefined>;
  /** 툼스톤 포함 bulkGet — 입력 순서와 결과 순서가 같다(없으면 그 자리에 `undefined`). */
  bulkGetAny(tbl: SyncTable, ids: readonly string[]): Promise<(Meta | undefined)[]>;
  /** 툼스톤 포함 전량 — `enqueueAll` 전용. */
  allRows(tbl: SyncTable): Promise<Meta[]>;
  /** **아웃박스에 적재하지 않는** put — 원격 적용 전용(`applyRemote`). */
  putRemote(tbl: SyncTable, entity: Meta): Promise<void>;

  /** 일곱 엔티티 테이블 + `syncOutbox` 를 묶는 rw 트랜잭션(`applyRemote`·`ackOutbox`·`enqueueAll` 공용). */
  withOutboxTransaction(run: () => Promise<void>): Promise<void>;

  /** 7테이블 + 아웃박스 물리 삭제, `syncState` 는 `deviceId` 만 남긴다. 스스로 트랜잭션을 연다. */
  wipeLocal(): Promise<void>;
};

function asMeta(row: unknown): Meta | undefined {
  return row as Meta | undefined;
}

/** 임의의 Dexie 인스턴스 위에 `SyncStore` 를 만든다. `query.ts#storeOn` 이 부른다. */
export function createSyncStore(database: Dexie): SyncStore {
  const entityTable = (tbl: SyncTable): Table<Meta, string> =>
    database.table(tbl) as unknown as Table<Meta, string>;
  const outboxTable = (): Table<OutboxEntry, [string, string]> =>
    database.table('syncOutbox') as unknown as Table<OutboxEntry, [string, string]>;
  const stateTable = (): Table<SyncState & { id: string }, string> =>
    database.table('syncState') as unknown as Table<SyncState & { id: string }, string>;

  return {
    stateGet: async () => {
      const row = await stateTable().get(SYNC_STATE_ID);
      if (row === undefined) {
        return undefined;
      }
      const { id: _id, ...state } = row;
      return state;
    },
    statePut: async (state) => {
      await stateTable().put({ ...state, id: SYNC_STATE_ID });
    },

    outboxList: async (limit) => outboxTable().toCollection().limit(Math.max(0, limit)).toArray(),
    outboxCount: async () => outboxTable().count(),
    outboxGet: async (tbl, id) => outboxTable().get([tbl, id]),
    outboxPut: async (entry) => {
      await outboxTable().put(entry);
    },
    outboxDelete: async (tbl, id) => {
      await outboxTable().delete([tbl, id]);
    },

    getAny: async (tbl, id) => asMeta(await entityTable(tbl).get(id)),
    bulkGetAny: async (tbl, ids) => entityTable(tbl).bulkGet([...ids]),
    allRows: async (tbl) => entityTable(tbl).toArray(),
    putRemote: async (tbl, entity) => {
      await entityTable(tbl).put(entity);
    },

    withOutboxTransaction: (run) =>
      database.transaction(
        'rw',
        [...ENTITY_TABLES.map((tbl) => database.table(tbl)), outboxTable()],
        run,
      ),

    wipeLocal: async () => {
      await database.transaction(
        'rw',
        [...ENTITY_TABLES.map((tbl) => database.table(tbl)), outboxTable(), stateTable()],
        async () => {
          for (const tbl of ENTITY_TABLES) {
            await entityTable(tbl).clear();
          }
          await outboxTable().clear();
          const current = await stateTable().get(SYNC_STATE_ID);
          if (current !== undefined) {
            await stateTable().put({ id: SYNC_STATE_ID, deviceId: current.deviceId, cursor: 0 });
          }
        },
      );
    },
  };
}
