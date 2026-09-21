// 지연 청크(`sync-engine-*.js`, T94_LAZY_BOUNDARY.md §D-9). 동기화 사이클·트리거·격리·재수신을
// 전부 여기서 다룬다. `sync-store.ts`(진입)가 `await import(...)` 로 딱 한 번 가져와 `startEngine()`
// 을 부른다.
import { planOutboxAfterReject, shouldQuarantine, toSyncChange } from '@/domain/sync/outbox';
import { readRemoteRow } from '@/domain/sync/remote-rows';
import { isResyncResponse } from '@/domain/sync/wire';
import type { SyncChange, SyncOkResponse, SyncState, SyncTable } from '@/domain/sync/wire';

import { getRepositories, getSyncTransport } from '@/repositories/container';
import type { RemoteWrite, SyncRepository } from '@/repositories/sync-repository';
import { isTransportError } from '@/repositories/sync-transport';

import { verifySession } from '@/features/sync/store/auth-actions';
import { reloadAdoptedViews } from '@/features/sync/store/reload-views';
import type { SyncRuntime } from '@/features/sync/store/sync-store';

import { nowIso } from '@/lib/date';
import { onLocalWrite } from '@/lib/write-signal';

const PAGE_SIZE = 500;
const VISIBLE_POLL_MS = 30_000;
const TRIGGER_DEBOUNCE_MS = 2_000;
const WRITE_DEBOUNCE_MS = 1_500;

let started = false;
let running = false;
/** `startEngine` 이 한 번 받아 두는 진입 상태 핸들 — 값으로 `sync-store.ts` 를 import 하지 않기
 * 위해 인자로 받는다(머리주석). `started` 가드 덕분에 엔진 수명 동안 하나로 고정된다. */
let rt: SyncRuntime;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
/** (tbl,id) → 연속 `invalid` 거절 횟수(③-4). 탭이 살아 있는 동안만 유지한다 — 새로고침하면
 * 다시 0부터 세지만, 그사이 격리된 것은 `SyncState.quarantined` 에 남아 재시도되지 않는다. */
const consecutiveInvalid = new Map<string, number>();

function keyOf(tbl: SyncTable, id: string): string {
  return `${tbl}|${id}`;
}

function schedule(delayMs: number): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runCycle();
  }, delayMs);
}

function stopPolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/** 보이는 동안에만 30초마다. 숨김이면 타이머가 없다(돌연변이 (5)의 대상). */
function restartPollingIfVisible(): void {
  stopPolling();
  if (document.visibilityState === 'visible') {
    pollTimer = setInterval(() => void runCycle(), VISIBLE_POLL_MS);
  }
}

async function runCycle(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await cycleOnce();
  } catch (error) {
    console.error('동기화 사이클이 실패했습니다.', error);
  } finally {
    running = false;
  }
}

/** 한 왕복 처리: 적용된 항목은 ack, 거절된 항목은 판정대로 drop/keep(+격리), 풀 결과는 검증 후
 * `applyRemote`, 커서·`dataRevision`·`pendingCount` 갱신, 채택된 테이블만 재조회. */
async function applyResponse(
  repo: SyncRepository,
  state: SyncState,
  response: SyncOkResponse,
): Promise<void> {
  // 푸시한 것의 ack 는 호출부(`pushAndPull`)가 정확한 rev 로 먼저 처리한다(`ackApplied`) — 여기서는
  // 거절 판정 + 풀 적용 + 커서 갱신만 한다. `pullAll`(changes=[])은 애초에 `applied` 가 없다.
  await handleRejections(repo, response);

  const remoteWrites: RemoteWrite[] = [];
  const invalidPulled: { tbl: SyncTable; id: string }[] = [];
  for (const pulled of response.pulled) {
    const result = readRemoteRow(pulled.tbl, pulled.id, pulled.row);
    if (result.ok) {
      remoteWrites.push({ tbl: pulled.tbl, seq: pulled.seq, entity: result.entity } as RemoteWrite);
    } else {
      invalidPulled.push({ tbl: pulled.tbl, id: pulled.id });
    }
  }
  if (invalidPulled.length > 0) {
    console.error('동기화 풀 결과에 형식이 어긋난 로우가 있어 건너뜁니다.', invalidPulled);
  }

  const result = remoteWrites.length > 0 ? await repo.applyRemote(remoteWrites) : null;

  const pendingCount = await repo.countOutbox();
  // `handleRejections` 가 격리를 확정하며 `quarantined` 를 이미 저장소에 썼을 수 있다 — 여기서
  // 인자로 받은(함수 진입 시점의) `state` 를 그대로 스프레드하면 그 최신 `quarantined` 를 덮어써
  // `undefined` 로 되돌린다(실측: "3회 격리" 테스트가 이 순서 문제로 깨졌다). 커서만 갱신하려면
  // 저장소의 **지금** 값을 다시 읽어 그 위에 얹어야 한다.
  const latest = (await repo.getState()) ?? state;
  await repo.setState({ ...latest, cursor: response.cursor, lastSyncedAt: nowIso() });

  const adoptedAny = result !== null && Object.values(result.adopted).some((n) => n > 0);
  if (adoptedAny && result !== null) {
    await reloadAdoptedViews(result.adopted);
  }
  rt.setState((prev) => ({
    pendingCount,
    dataRevision: adoptedAny ? prev.dataRevision + 1 : prev.dataRevision,
  }));
}

/** `ackOutbox` 는 rev 를 다시 읽어 대조하므로(§B-4 T-92 완료 조건), 여기서는 실제 큐 항목을 다시
 * 끌어와 정확한 rev 로 부른다 — `applied` 응답에는 서버 seq 만 있고 rev 는 없다.
 *
 * **격리 카운터도 여기서 리셋한다.** `consecutiveInvalid` 는 "연속" invalid 거절만 세야 한다 —
 * 리셋 없이 두면 두 번 invalid 로 실패한 로우가 그사이 한 번 성공(applied)해도 카운트가 2로
 * 남아, 나중에 무관한 한 번의 invalid 거절만으로 "3회 연속"이 아닌데 격리된다(돌연변이 (6)
 * 대상 — `sync-engine.test.ts` 의 "연속 아니면 격리하지 않는다"가 이 리셋이 빠지면 빨개진다). */
async function ackApplied(repo: SyncRepository, applied: SyncOkResponse['applied']): Promise<void> {
  if (applied.length === 0) return;
  const keys = new Set(applied.map((a) => keyOf(a.tbl, a.id)));
  for (const key of keys) consecutiveInvalid.delete(key);
  const queued = await repo.listOutbox(PAGE_SIZE);
  const pushed = queued.filter((entry) => keys.has(keyOf(entry.tbl, entry.id)));
  await repo.ackOutbox(pushed);
}

async function handleRejections(repo: SyncRepository, response: SyncOkResponse): Promise<void> {
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

/** cursor 0 부터 전량 풀(재수신·계정 전환 공용). 서버가 `more` 를 주는 동안 계속 당긴다. */
async function pullAll(repo: SyncRepository): Promise<void> {
  const state = await repo.getState();
  if (state === undefined) return;
  let cursor = 0;
  for (;;) {
    const response = await getSyncTransport().sync({
      protocol: 1,
      deviceId: state.deviceId,
      cursor,
      changes: [],
    });
    if (isResyncResponse(response)) {
      cursor = 0;
      continue; // 재수신이 재수신을 부르는 것은 이론상 GC 플로어가 또 앞섰을 때뿐 — 드묾
    }
    await applyResponse(repo, { ...state, cursor }, response);
    cursor = response.cursor;
    if (!response.more) break;
  }
}

async function pushAndPull(repo: SyncRepository, state: SyncState): Promise<boolean> {
  const entries = await repo.listOutbox(PAGE_SIZE);
  const pushRows = await repo.readForPush(entries);
  const toDropPhysical: { tbl: SyncTable; id: string }[] = [];
  const changes: SyncChange[] = [];
  for (const { entry, row } of pushRows) {
    if (row === undefined) {
      toDropPhysical.push({ tbl: entry.tbl, id: entry.id }); // 물리 삭제됨 — 보낼 것이 없다
    } else {
      changes.push(toSyncChange(entry, row));
    }
  }
  if (toDropPhysical.length > 0) await repo.dropOutbox(toDropPhysical);

  let response;
  try {
    response = await getSyncTransport().sync({
      protocol: 1,
      deviceId: state.deviceId,
      cursor: state.cursor,
      changes,
    });
  } catch (error) {
    if (isTransportError(error) && error.kind === 'unauthorized') stopPolling();
    return false;
  }
  if (isResyncResponse(response)) {
    await pullAll(repo);
    return false;
  }
  await ackApplied(repo, response.applied);
  await applyResponse(repo, state, response);
  return response.more;
}

async function cycleOnce(): Promise<void> {
  // 오프라인이어도 "○ 대기 N건"(R6)은 정직해야 한다 — 아래 왕복(applyResponse)만 pendingCount 를
  // 갱신하면 오프라인 중에는 로컬에 막 쌓인 변경이 화면에 전혀 안 보인다(실측: e2e 로 잡힌 문제).
  // 로컬 아웃박스 건수는 네트워크 없이도 읽을 수 있으므로 온라인 판정보다 먼저 한 번 반영한다.
  const localRepo = getRepositories().sync;
  rt.setState({ pendingCount: await localRepo.countOutbox() });
  if (!navigator.onLine) return;
  const verify = await verifySession(rt);
  if (verify === 'signed-out') {
    stopPolling();
    return;
  }
  if (verify === 'offline') return;
  if (verify === 'account-deleted') return; // 안내가 떴다 — 사용자가 확인할 때까지 아무것도 안 한다
  const repo = getRepositories().sync;
  if (verify === 'switched') {
    await pullAll(repo);
    return;
  }
  let state = await repo.getState();
  if (state === undefined || state.userSub === undefined) return;
  // `more` 는 재귀 `runCycle()` 이 아니라 여기서 직접 루프를 돈다 — `runCycle` 의 재진입 가드
  // (`running`)가 아직 풀리기 전이라 재귀 호출은 그 가드에 막혀 조용히 아무 일도 안 한다(실측).
  // 매 반복 `state` 를 다시 읽는다 — `pushAndPull` 이 커서를 저장소에 올려 두므로 그대로 쓰면
  // 이전 커서로 같은 페이지를 또 요청하게 된다.
  let more = await pushAndPull(repo, state);
  while (more) {
    state = (await repo.getState()) ?? state;
    more = await pushAndPull(repo, state);
  }
}

/** 앱이 시작할 때 딱 한 번. 첫 사이클을 즉시 돌리고, 트리거를 건다. */
export function startEngine(runtime: SyncRuntime): void {
  if (started) return;
  started = true;
  rt = runtime;

  void runCycle();
  restartPollingIfVisible();

  document.addEventListener('visibilitychange', () => {
    restartPollingIfVisible();
    if (document.visibilityState === 'visible') schedule(TRIGGER_DEBOUNCE_MS);
  });
  window.addEventListener('focus', () => schedule(TRIGGER_DEBOUNCE_MS));
  window.addEventListener('online', () => schedule(TRIGGER_DEBOUNCE_MS));
  onLocalWrite(() => schedule(WRITE_DEBOUNCE_MS));
}

/** 테스트 전용 — 모듈 스코프 가드·타이머를 되돌린다. */
export function resetEngineForTest(): void {
  started = false;
  running = false;
  stopPolling();
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  consecutiveInvalid.clear();
}
