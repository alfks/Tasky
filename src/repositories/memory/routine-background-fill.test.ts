// F2(배경 채우기가 사용자의 "중지" 를 덮는다)·부활(소프트 삭제한 인스턴스가 재방문으로 되살아난다)
// 동시 방어 증명(코디네이터 요청, ADR-0018 §재검토 트리거·ADR-0017 §재검토 위험 2).
//
// **이 파일이 증명하는 것**: `SyncRepository.existingIds`(툼스톤 포함, T-92b 의 실제 산출물)를
// 배경 채우기에 배선하면 — `planRoutineFill` 이 돌려주는 `routine`(fillFloor 가 전진한 값)을
// **쓰지 않고** `todos` 만 저장해도 — 부활이 나지 않는다(existingIds 가 툼스톤을 이미 본다). 그
// 루틴 로우를 아예 안 쓰므로 아웃박스에도 실리지 않고, 그래서 다른 기기의 "중지" 를 덮을 것도 없다
// (F2 는 애초에 성립하지 않는다) — 이 설계가 사용자 조작 없이 도는 트레이드오프를 요구하지 않는
// 이유다(권장안 (a), §D-9 "살아 있는 id·툼스톤 id 포함, 없는 id 제외 — 한 호출로 세 부류").
//
// **이 파일이 증명하지 않는 것**: 실제 호출부(`src/features/todo/store/todo-routine-fill.ts`)가
// 이렇게 배선돼 있다는 것. 그 파일과 `src/domain/routine/routine-fill.ts`(`planRoutineFill` 이
// 아직도 `routine` 을 항상 touch 해 돌려준다, PR #121 리뷰 Blocker 임시 조치)는 T-92b owns 밖이라
// 이 PR 에서 고치지 않았다 — 실제 제품 경로를 닫으려면 별도 범위 확장·후속 티켓이 필요하다(핸드오프
// 보고 참고). 아래 테스트는 도메인 함수(`planRoutineFill`·`pauseRoutine`)를 **읽기 전용으로** import
// 해 "호출부가 이렇게 배선했다면" 을 재현할 뿐, 그 파일들을 수정하지 않는다.
import { describe, expect, it } from 'vitest';

import { addCivilDays } from '@/domain/date/civil';
import type { DateKey } from '@/domain/date/date-key';
import { createMeta, markDeleted, type MetaDeps, type Persistable } from '@/domain/meta';
import type { Routine } from '@/domain/routine/routine';
import { planRoutineFill } from '@/domain/routine/routine-fill';
import { pauseRoutine } from '@/domain/routine/routine.rules';
import { toSyncChange } from '@/domain/sync/outbox';
import { readRemoteRow } from '@/domain/sync/remote-rows';
import { isResyncResponse, type SyncOkResponse, type SyncRequest } from '@/domain/sync/wire';

import type { Repositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';
import { createMemorySyncServer, type MemorySyncServer } from '@/repositories/memory/sync-server';
import { createMemorySyncTransport } from '@/repositories/memory/sync-transport';
import type { RemoteWrite } from '@/repositories/sync-repository';
import type { SessionInfo, SyncTransport } from '@/repositories/sync-transport';

const SESSION: SessionInfo = {
  sub: 'user-1',
  email: 'user@example.com',
  expiresAt: '2099-01-01T00:00:00.000Z',
};
const CATEGORY_ID = '20000000-0000-4000-8000-000000000001';
const START = '2026-01-15' as DateKey; // 목요일

function depsAt(now: string, seed = 1): MetaDeps {
  let seq = seed;
  return { now: () => now, id: () => `f0000000-0000-4000-8000-${String(seq++).padStart(12, '0')}` };
}

function freshRoutine(deps: MetaDeps, fillFloor: DateKey): Persistable<Routine> {
  return createMeta<Routine>(deps, {
    title: '아침 명상',
    categoryId: CATEGORY_ID,
    recurrence: { type: 'weekly', daysOfWeek: [4] }, // 목요일마다
    startDate: START,
    active: true,
    fillFloor,
  });
}

/** 한 기기의 상태: 저장소·트랜스포트·이 기기가 아는 커서. */
type Device = { repos: Repositories; transport: SyncTransport; deviceId: string; cursor: number };

function createDevice(server: MemorySyncServer, deviceId: string): Device {
  return {
    repos: createMemoryRepositories(),
    transport: createMemorySyncTransport(server, SESSION),
    deviceId,
    cursor: 0,
  };
}

/** 한 왕복: 아웃박스 전량 push → ack/drop → pull 결과를 검증·적용(applyRemote) → 커서 갱신. 미니
 * 엔진(T-94 가 실제로 구현할 사이클의 축소판) — 이 저장소·트랜스포트 조합이 실제로 맞물리는지 보는
 * 목적이라 여기서만 손으로 만든다. */
async function sync(device: Device): Promise<void> {
  const outbox = await device.repos.sync.listOutbox(500);
  const rows = await device.repos.sync.readForPush(outbox);
  const changes = rows
    .filter((r): r is typeof r & { row: NonNullable<typeof r.row> } => r.row !== undefined)
    .map((r) => toSyncChange(r.entry, r.row));
  const missing = rows.filter((r) => r.row === undefined).map((r) => r.entry);
  if (missing.length > 0) {
    await device.repos.sync.dropOutbox(missing);
  }

  const request: SyncRequest = {
    protocol: 1,
    deviceId: device.deviceId,
    cursor: device.cursor,
    changes,
  };
  const response = await device.transport.sync(request);
  if (isResyncResponse(response)) {
    throw new Error('테스트 시나리오에서는 resync 가 나오면 안 된다');
  }
  const ok: SyncOkResponse = response;

  const outboxByKey = new Map(outbox.map((e) => [`${e.tbl}|${e.id}`, e]));
  const appliedEntries = ok.applied
    .map((a) => outboxByKey.get(`${a.tbl}|${a.id}`))
    .filter((e): e is NonNullable<typeof e> => e !== undefined);
  if (appliedEntries.length > 0) {
    await device.repos.sync.ackOutbox(appliedEntries);
  }
  const rejectedToDrop = ok.rejected
    .filter((r) => r.reason === 'exists' || r.reason === 'stale')
    .map((r) => ({ tbl: r.tbl, id: r.id }));
  if (rejectedToDrop.length > 0) {
    await device.repos.sync.dropOutbox(rejectedToDrop);
  }

  const validated: RemoteWrite[] = [];
  for (const pulled of ok.pulled) {
    const result = readRemoteRow(pulled.tbl, pulled.id, pulled.row);
    if (result.ok) {
      validated.push({ tbl: pulled.tbl, seq: pulled.seq, entity: result.entity } as RemoteWrite);
    }
  }
  if (validated.length > 0) {
    await device.repos.sync.applyRemote(validated);
  }
  device.cursor = ok.cursor;
}

describe('배경 채우기 — existingIds(툼스톤 포함)로 fillFloor 를 얼려도 부활하지 않는다', () => {
  it('소프트 삭제한 인스턴스는 더 넓은 범위를 재방문해도 부활하지 않는다', async () => {
    const server = createMemorySyncServer();
    const device = createDevice(server, 'device-a');
    const routine = freshRoutine(depsAt('2026-01-01T00:00:00.000Z'), addCivilDays(START, -1));

    // 좁은 범위를 채운다 — 1/15·1/22·1/29 세 목요일.
    const narrow = planRoutineFill(
      { routine, through: '2026-01-29' as DateKey, existingIds: new Set() },
      depsAt('2026-01-29T00:00:00.000Z'),
    );
    expect(narrow?.todos.map((t) => t.date).sort()).toEqual([
      '2026-01-15',
      '2026-01-22',
      '2026-01-29',
    ]);
    for (const todo of narrow?.todos ?? []) {
      await device.repos.todos.upsert(todo);
    }
    // fillFloor 를 얼린다(옵션 (a)) — `narrow.routine`(전진한 값)을 저장하지 않는다.

    // 1/22 인스턴스를 소프트 삭제한다.
    const target = (narrow?.todos ?? []).find((t) => t.date === '2026-01-22')!;
    await device.repos.todos.upsert(markDeleted(target, '2026-02-01T00:00:00.000Z'));

    // 더 넓은 범위(2/28 까지)를 재방문한다. existingIds 는 SyncRepository(툼스톤 포함)로 구한다.
    const candidateIds = (narrow?.todos ?? []).map((t) => t.id);
    const existingIds = await device.repos.sync.existingIds('todos', candidateIds);
    const wide = planRoutineFill(
      {
        routine /* fillFloor 그대로 — 전진시키지 않았다 */,
        through: '2026-02-28' as DateKey,
        existingIds,
      },
      depsAt('2026-02-28T00:00:00.000Z'),
    );

    // `wide.todos` 는 **새로 만든** 인스턴스만 담는다(existingIds 에 걸린 것은 아예 안 실린다) —
    // 1/15·1/29 는 이미 있어 안 실리고(중복 생성 0건), 1/22 는 툼스톤인데도 안 실린다(부활 0건).
    const dates = (wide?.todos ?? []).map((t) => t.date).sort();
    expect(dates).not.toContain('2026-01-22'); // 부활 0건
    expect(dates).not.toContain('2026-01-15'); // 이미 있음 — 중복 생성 0건
    expect(dates).not.toContain('2026-01-29'); // 이미 있음 — 중복 생성 0건
    expect(dates).toEqual(['2026-02-05', '2026-02-12', '2026-02-19', '2026-02-26']);

    // 최종적으로 살아 있는 상태(기존 + 새로 만든 것)도 6개(1/22 제외)여야 한다 — 저장까지 확인한다.
    for (const todo of wide?.todos ?? []) {
      await device.repos.todos.upsert(todo);
    }
    const finalLive = (
      await device.repos.todos.listByDateRange('2026-01-15' as DateKey, '2026-02-28' as DateKey)
    )
      .map((t) => t.date)
      .sort();
    expect(finalLive).toEqual([
      '2026-01-15',
      '2026-01-29',
      '2026-02-05',
      '2026-02-12',
      '2026-02-19',
      '2026-02-26',
    ]);
  });

  it('[돌연변이] existingIds 를 살아 있는 로우만으로 구하면(예전 방식) 부활한다', async () => {
    const server = createMemorySyncServer();
    const device = createDevice(server, 'device-a');
    const routine = freshRoutine(depsAt('2026-01-01T00:00:00.000Z'), addCivilDays(START, -1));

    const narrow = planRoutineFill(
      { routine, through: '2026-01-29' as DateKey, existingIds: new Set() },
      depsAt('2026-01-29T00:00:00.000Z'),
    );
    for (const todo of narrow?.todos ?? []) {
      await device.repos.todos.upsert(todo);
    }
    const target = (narrow?.todos ?? []).find((t) => t.date === '2026-01-22')!;
    await device.repos.todos.upsert(markDeleted(target, '2026-02-01T00:00:00.000Z'));

    // 방어를 되돌린다: existingIds 를 listByDateRange(살아 있는 로우만)로 구한다 — 툼스톤을 못 본다.
    const stillAlive = await device.repos.todos.listByDateRange(
      '2026-01-15' as DateKey,
      '2026-02-28' as DateKey,
    );
    const staleExistingIds = new Set(stillAlive.map((t) => t.id));
    const wide = planRoutineFill(
      { routine, through: '2026-02-28' as DateKey, existingIds: staleExistingIds },
      depsAt('2026-02-28T00:00:00.000Z'),
    );

    const dates = (wide?.todos ?? []).map((t) => t.date);
    expect(dates).toContain('2026-01-22'); // 방어 없이는 부활한다 — 이 단언이 실패하면 방어가 살아났다는 뜻
  });
});

describe('배경 채우기 — 루틴 로우를 안 쓰면 다른 기기의 "중지" 를 덮지 않는다(F2)', () => {
  it('기기 A 가 중지 → 기기 B 배경 채우기(existingIds 배선, 루틴 로우 미기록) → 동기화 → A 의 중지가 유지된다', async () => {
    const server = createMemorySyncServer();
    const deviceA = createDevice(server, 'device-a');
    const deviceB = createDevice(server, 'device-b');

    // 두 기기가 같은 루틴을 이미 동기화해 뒀다고 가정 — A 가 만들어 올리고 B 가 받는다.
    const routine0 = freshRoutine(depsAt('2026-01-01T00:00:00.000Z'), addCivilDays(START, -1));
    await deviceA.repos.routines.upsert(routine0);
    await sync(deviceA);
    await sync(deviceB);
    expect((await deviceB.repos.routines.getById(routine0.id))?.active).toBe(true);

    // 기기 A: 사용자가 중지한다(t1).
    const localA = (await deviceA.repos.routines.getById(routine0.id))!;
    const paused = pauseRoutine(localA, depsAt('2026-03-01T00:00:00.000Z'));
    await deviceA.repos.routines.upsert(paused);
    await sync(deviceA); // 서버에 중지가 올라간다.

    // 기기 B: A 의 중지를 아직 모른 채(오프라인) 배경 채우기를 한다(t2 > t1) — existingIds(툼스톤
    // 포함)만 쓰고 루틴 로우는 쓰지 않는다(옵션 (a)).
    const localB = (await deviceB.repos.routines.getById(routine0.id))!;
    const plan = planRoutineFill(
      { routine: localB, through: '2026-03-15' as DateKey, existingIds: new Set<string>() },
      depsAt('2026-03-10T00:00:00.000Z'),
    );
    for (const todo of plan?.todos ?? []) {
      await deviceB.repos.todos.upsert(todo);
    }
    // plan.routine(전진한 값)을 쓰지 않는다 — 그래서 아웃박스에 루틴 쓰기가 없다.
    const outboxAfterFill = await deviceB.repos.sync.listOutbox(100);
    expect(outboxAfterFill.some((e) => e.tbl === 'routines')).toBe(false);

    await sync(deviceB); // 자신의 todos 만 밀어올리고, A 의 중지를 받아온다.

    const afterB = await deviceB.repos.routines.getById(routine0.id);
    expect(afterB?.active).toBe(false); // A 의 중지가 유지된다 — F2 없음
  });

  it('[돌연변이] 배경 채우기가 fillFloor 전진을 아웃박스에 함께 실으면 A 의 중지가 덮인다(F2 재현)', async () => {
    const server = createMemorySyncServer();
    const deviceA = createDevice(server, 'device-a');
    const deviceB = createDevice(server, 'device-b');

    const routine0 = freshRoutine(depsAt('2026-01-01T00:00:00.000Z'), addCivilDays(START, -1));
    await deviceA.repos.routines.upsert(routine0);
    await sync(deviceA);
    await sync(deviceB);

    const localA = (await deviceA.repos.routines.getById(routine0.id))!;
    const paused = pauseRoutine(localA, depsAt('2026-03-01T00:00:00.000Z'));
    await deviceA.repos.routines.upsert(paused);
    await sync(deviceA);

    const localB = (await deviceB.repos.routines.getById(routine0.id))!;
    const plan = planRoutineFill(
      { routine: localB, through: '2026-03-15' as DateKey, existingIds: new Set() },
      depsAt('2026-03-10T00:00:00.000Z'), // A 의 중지(2026-03-01)보다 늦다 — LWW 에서 이긴다
    );
    for (const todo of plan?.todos ?? []) {
      await deviceB.repos.todos.upsert(todo);
    }
    // 방어를 되돌린다: planRoutineFill 이 돌려준 routine(fillFloor 전진, active 는 B 의 stale 값
    // 그대로 true)을 그대로 저장한다 — 지금 코드(routine-fill.ts, PR #121 리뷰 Blocker 임시 조치)가
    // 실제로 하는 일이다.
    await deviceB.repos.routines.upsert(plan!.routine);

    await sync(deviceB); // B 의 fillFloor 전진(+ stale active:true)이 A 의 중지보다 늦은 시각으로 올라간다.
    await sync(deviceA); // A 가 B 의 갱신을 받는다 — LWW 로 B 가 이긴다.

    const afterA = await deviceA.repos.routines.getById(routine0.id);
    expect(afterA?.active).toBe(true); // 방어 없이는 A 의 중지가 덮인다 — 이 단언이 실패하면 방어가 살아났다는 뜻
  });
});
