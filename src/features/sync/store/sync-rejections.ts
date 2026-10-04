// 격리 판정·풀 로우 검증 보조(③-4) — `sync-engine.ts` 가 300줄 상한 때문에 떼어 낸 응집 단위. 거절 응답을 받아
// drop/keep 을 정하고, "연속 invalid" 가 `shouldQuarantine` 임계를 넘으면 `SyncState.quarantined` 에 올린다.
import { planOutboxAfterReject, shouldQuarantine } from '@/domain/sync/outbox';
import { readRemoteRow } from '@/domain/sync/remote-rows';
import type { SyncOkResponse, SyncTable } from '@/domain/sync/wire';

import type { RemoteWrite, SyncRepository } from '@/repositories/sync-repository';

/** (tbl,id) → 연속 `invalid` 거절 횟수(③-4). 탭이 살아 있는 동안만 유지한다 — 새로고침하면
 * 다시 0부터 세지만, 그사이 격리된 것은 `SyncState.quarantined` 에 남아 재시도되지 않는다. */
const consecutiveInvalid = new Map<string, number>();

export function keyOf(tbl: SyncTable, id: string): string {
  return `${tbl}|${id}`;
}

export async function handleRejections(
  repo: SyncRepository,
  response: SyncOkResponse,
): Promise<void> {
  const toDrop: { tbl: SyncTable; id: string }[] = [];
  const quarantineNow: { tbl: SyncTable; id: string }[] = [];
  for (const rejected of response.rejected) {
    const plan = planOutboxAfterReject(rejected.reason);
    const key = keyOf(rejected.tbl, rejected.id);
    if (plan === 'remove') {
      toDrop.push({ tbl: rejected.tbl, id: rejected.id });
      consecutiveInvalid.delete(key);
      continue;
    }
    const count = (consecutiveInvalid.get(key) ?? 0) + 1;
    consecutiveInvalid.set(key, count);
    if (shouldQuarantine(count)) {
      quarantineNow.push({ tbl: rejected.tbl, id: rejected.id });
      consecutiveInvalid.delete(key);
    }
  }
  if (quarantineNow.length > 0) {
    toDrop.push(...quarantineNow);
    const state = await repo.getState();
    if (state !== undefined) {
      const quarantined = [...(state.quarantined ?? []), ...quarantineNow];
      await repo.setState({ ...state, quarantined });
    }
  }
  if (toDrop.length > 0) await repo.dropOutbox(toDrop);
}

/** (tbl,id) 의 연속 invalid 카운트를 잊는다 — 푸시가 적용(applied)됐을 때 `ackApplied` 가 부른다. */
export function forgetInvalid(keys: Iterable<string>): void {
  for (const key of keys) consecutiveInvalid.delete(key);
}

/** 테스트 전용 — 카운터를 비운다. */
export function resetRejectStateForTest(): void {
  consecutiveInvalid.clear();
}

/** 풀 결과를 `applyRemote` 입력으로 — 형식이 어긋난 로우는 건너뛰고 한 번만 로그한다. */
export function toRemoteWrites(pulled: SyncOkResponse['pulled']): RemoteWrite[] {
  const remoteWrites: RemoteWrite[] = [];
  const invalidPulled: { tbl: SyncTable; id: string }[] = [];
  for (const row of pulled) {
    const result = readRemoteRow(row.tbl, row.id, row.row);
    if (result.ok) {
      remoteWrites.push({ tbl: row.tbl, seq: row.seq, entity: result.entity } as RemoteWrite);
    } else {
      invalidPulled.push({ tbl: row.tbl, id: row.id });
    }
  }
  if (invalidPulled.length > 0) {
    console.error('동기화 풀 결과에 형식이 어긋난 로우가 있어 건너뜁니다.', invalidPulled);
  }
  return remoteWrites;
}
