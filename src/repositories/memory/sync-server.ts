// 메모리 가짜 서버(ADR-0018). **Worker(T-93)와 이 파일이 `server-rules.vectors.ts` 전 벡터를 함께
// 돈다**(SYNC_DESIGN §0 결론 9 "거짓 초록불 구조 차단") — `sync-server.test.ts` 가 그 파일을 그대로
// import 해서 트랜스포트 왕복으로 돌린다(복사하지 않는다).
//
// **테스트 전용** — 앱 코드 어디도 이 파일을 import 하지 않는다(§C-6). `src/test/setup.ts` 만 부른다.
// `memory/sync-repository.ts`(진입 청크)와 달리 이 파일은 제약이 없어 `wire.ts`·`server-rules.ts` 의
// 값을 그대로 쓴다.
import {
  applyServerRules,
  clampFutureUpdatedAt,
  type ExistingServerRow,
  type ServerChange,
} from '@/domain/sync/server-rules';
import {
  isSyncTable,
  type PulledRow,
  type SyncApplied,
  type SyncOkResponse,
  type SyncRejected,
  type SyncRejectReason,
  type SyncRequest,
  type SyncResponse,
  type SyncTable,
} from '@/domain/sync/wire';

import { pick, withField } from '@/repositories/sync-repository';

/** 요청 배치·풀 배치 공통 상한(SYNC_DESIGN §②-3). */
const MAX_BATCH = 500;

type StoredRow = {
  tbl: SyncTable;
  id: string;
  seq: number;
  deleted: boolean;
  updatedAt: string;
  /** 이 로우의 **현재** 값을 마지막으로 쓴 기기 — 풀의 "자기 기기 제외" 판정에 쓴다. */
  deviceId: string;
  /** 클라이언트가 보낸 직렬화된 `Persistable<T>` 그대로. */
  body: unknown;
};

type UserState = {
  nextSeq: number;
  rows: Map<string, StoredRow>;
  gcFloor: number;
};

export type MemorySyncServer = {
  /** 한 왕복. `worker/sync/handler.ts`(T-93)가 HTTP 위에서 하는 일과 같은 판정을 메모리 위에서 한다. */
  sync(sub: string, deviceId: string, request: SyncRequest, receivedAt: string): SyncResponse;
  /** 테스트 전용 — GC 플로어를 올려 `resync` 응답을 재현한다. */
  setGcFloor(sub: string, floor: number): void;
  /** 계정 삭제(E-3) 시뮬레이션 — 그 사용자의 서버 상태를 통째로 지운다. */
  deleteUser(sub: string): void;
};

function rowKey(tbl: string, id: string): string {
  return `${tbl}|${id}`;
}

function readUpdatedAt(row: unknown): string {
  if (typeof row === 'object' && row !== null && 'updatedAt' in row) {
    const value = (row as { updatedAt?: unknown }).updatedAt;
    if (typeof value === 'string') {
      return value;
    }
  }
  return '';
}

function readDeleted(row: unknown): boolean {
  return (
    typeof row === 'object' &&
    row !== null &&
    'deletedAt' in row &&
    (row as { deletedAt?: unknown }).deletedAt !== undefined
  );
}

function rejectReasonFor(
  result: 'reject-exists' | 'reject-stale' | 'reject-invalid',
): SyncRejectReason {
  if (result === 'reject-exists') {
    return 'exists';
  }
  return result === 'reject-stale' ? 'stale' : 'invalid';
}

/** 메모리 가짜 서버를 만든다. `options.gcFloor` 는 새 사용자의 초기 GC 플로어(기본 0 = 재수신 없음). */
export function createMemorySyncServer(options: { gcFloor?: number } = {}): MemorySyncServer {
  const users = new Map<string, UserState>();
  const initialGcFloor = options.gcFloor ?? 0;

  function stateFor(sub: string): UserState {
    let state = users.get(sub);
    if (state === undefined) {
      state = { nextSeq: 1, rows: new Map(), gcFloor: initialGcFloor };
      users.set(sub, state);
    }
    return state;
  }

  return {
    setGcFloor(sub, floor) {
      stateFor(sub).gcFloor = floor;
    },

    deleteUser(sub) {
      users.delete(sub);
    },

    sync(sub, deviceId, request, receivedAt) {
      const state = stateFor(sub);
      if (request.cursor < state.gcFloor) {
        return { resync: true, gcFloor: state.gcFloor };
      }

      const applied: SyncApplied[] = [];
      const rejected: SyncRejected[] = [];
      const batch = request.changes.slice(0, MAX_BATCH);

      for (const change of batch) {
        if (!isSyncTable(change.tbl)) {
          rejected.push({ tbl: change.tbl, id: change.id, reason: 'unknown-table' });
          continue;
        }
        const key = rowKey(change.tbl, change.id);
        const existingRow = state.rows.get(key);
        // pick(): `updatedAt` 키를 리터럴로 쓰면 NO_META_WRITE(ADR-0007, eslint.config.mjs)에 걸린다
        // — `ExistingServerRow.updatedAt` 은 `Meta.updatedAt` 과 이름만 같은 별개 필드다
        // (`sync-repository.ts#pick` jsdoc). `existingRow` 가 이미 필요한 네 필드를 그대로 갖고
        // 있어(`StoredRow`) 캐스팅 없이 그대로 옮긴다.
        const existing: ExistingServerRow | undefined =
          existingRow === undefined
            ? undefined
            : pick(existingRow, ['tbl', 'id', 'deleted', 'updatedAt']);
        // `change`(SyncChange) 에는 `updatedAt` 이 없다(본문 안에 있다) — `pick` 으로 나머지 셋을
        // 옮기고 계산값(`readUpdatedAt`)만 `withField` 로 더한다.
        const serverChange: ServerChange = {
          ...pick(change, ['tbl', 'id', 'baseSeq']),
          ...withField('updatedAt', readUpdatedAt(change.row)),
        };
        const result = applyServerRules(existing, serverChange, receivedAt);

        if (result === 'insert' || result === 'update') {
          const seq = state.nextSeq;
          state.nextSeq += 1;
          // `tbl`·`id`·`seq`·`deleted`·`deviceId`·`body` 는 제한 대상이 아니라 리터럴로 바로 쓴다 —
          // `updatedAt` 하나만 `withField` 를 거친다.
          state.rows.set(key, {
            tbl: change.tbl,
            id: change.id,
            seq,
            deleted: readDeleted(change.row),
            deviceId,
            body: change.row,
            ...withField('updatedAt', clampFutureUpdatedAt(serverChange.updatedAt, receivedAt)),
          });
          applied.push({ tbl: change.tbl, id: change.id, seq });
        } else {
          rejected.push({ tbl: change.tbl, id: change.id, reason: rejectReasonFor(result) });
        }
      }

      // 풀: 이 커서 이후 + 자기 기기 제외, seq 오름차순, ≤ 500 (SYNC_DESIGN §③-1·§③-3).
      const candidates = [...state.rows.values()]
        .filter((row) => row.seq > request.cursor && row.deviceId !== deviceId)
        .sort((a, b) => a.seq - b.seq);
      const pulled: PulledRow[] = candidates
        .slice(0, MAX_BATCH)
        .map((row) => ({ tbl: row.tbl, id: row.id, seq: row.seq, row: row.body }));
      const more = candidates.length > MAX_BATCH;

      // cursor: 풀 결과의 max, 없으면 요청 그대로(wire.ts#SyncOkResponse jsdoc) — 이 기기 자신이 쓴
      // change 의 seq 는 cursor 에 반영하지 않는다(그 change 는 애초에 pulled 에 나오지 않는다).
      const cursor = pulled.length > 0 ? Math.max(...pulled.map((row) => row.seq)) : request.cursor;

      const response: SyncOkResponse = {
        cursor,
        applied,
        rejected,
        pulled,
        more,
        gcFloor: state.gcFloor,
      };
      return response;
    },
  };
}
