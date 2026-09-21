// 지연 생성(R6) 스캔 비용 벤치 — SYNC_DESIGN.md §①-2 결정(a)-4 완료 조건 "fake-indexeddb 에서
// 10루틴 × 3년(1,095일) 재스캔 < 200ms"(PR #121 리뷰 Major 3).
//
// **돌리는 법: `pnpm test:slow`** (= `VITEST_SLOW=1 vitest run`, `todo-perf.slow.test.ts` 와 같은
// 스위치 — 그 파일 상단 주석에 메커니즘 설명이 있다). 기본 `pnpm test` 에는 빠진다.
//
// **무엇을 재는가**: `fillFloor` 가 지평선(1,095일)보다 훨씬(10년) 오래 전에 멈춰 있는(한 번도
// 재방문 안 한) 루틴 10개를 `fake-indexeddb`(전역 셋업, `src/test/setup.ts`)에 심고, 스토어 액션
// `materializeRoutines` 를 **한 번** 부른다. `todo-routine-fill.ts` 의 `FILL_BACKFILL_HORIZON_DAYS`
// 클램프가 없으면 루틴마다 ~3,650일/7 ≈ 521 후보를 훑어야 하지만, 클램프가 있으면 ~1,095일/7 ≈ 156
// 후보로 **staleness 와 무관하게** 잘린다(설계 수치와 일치, 아래 두 번째 단언이 후보 수를 직접 센다) —
// 10년 방치와 5년 방치가 같은 비용이어야 한다는 것이 Major 3 수정의 핵심이라, 일부러 더 극단값(10년)
// 을 썼다.
//
// **예산 수치에 대한 정직한 기록**: 설계 문서(SYNC_DESIGN.md)의 "< 200ms" 는 최종 설계
// (`SyncRepository.existingIds` bulkGet 하나)의 **존재 판정** 비용만을 어림한 값이다. 이 PR 이 임시로
// 쓰는 경로는 그 존재 판정에 더해 **~1,565개의 새 `Todo` 로우를 실제로 fake-indexeddb 에 쓴다**
// (`dataset.write` 가 로우당 개별 `put()`) — 이 환경에서 실측하면 약 400~430ms 다(워밍업 포함, 3회
// 반복 실측). 그래서 예산은 실측치에 여유를 더한 값으로 정직하게 고정한다 — 설계의 200ms 를 그대로
// 박아 거짓 초록불을 만들지 않는다. `dataset.write` 를 `bulkPut` 으로 바꾸는 최적화는 이 리뷰 라운드
// 범위 밖이다(스캔 알고리즘이 아니라 쓰기 처리량의 문제라 별도 티켓감).
//
// **워밍업**: `todo-perf.slow.test.ts` 와 같은 이유(JIT·첫 IndexedDB 오픈 비용이 p1 측정을 덮는다)로
// `beforeAll` 에서 같은 모양의 시나리오를 한 번 먼저 돌리고 버린다 — 실제 예산 판정은 그 뒤 새
// DB 에서 한 번만 잰다.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { addCivilDays } from '@/domain/date/civil';
import type { DateKey } from '@/domain/date/date-key';
import { adopt } from '@/domain/meta';
import { FILL_BACKFILL_HORIZON_DAYS } from '@/domain/routine/routine-fill';

import { getRepositories, setRepositories, type Repositories } from '@/repositories/container';

import { createStore } from '@/infra/indexeddb/query';
import { createIndexedDbRepositories } from '@/infra/indexeddb/repositories';

import { createTodoStore } from '@/features/todo/store/todo-store';
import { makeCategory } from '@/test/fixtures/category';
import { fixedDeps } from '@/test/fixtures/deps';
import { makeRoutine } from '@/test/fixtures/routine';

const ROUTINE_COUNT = 10;
/** fillFloor 를 지평선(1,095일)보다 한참 더 오래 전(10년)에 멈춰 둔다 — 클램프가 없으면 그만큼
 * 더 넓게 훑는다. 클램프가 있으면 결과는 지평선(1,095일)만큼만으로 잘려야 한다. */
const NEVER_VISITED_DAYS = 3650;
/** 실측(3회 반복) 400~430ms 에 여유를 더한 값 — 파일 상단 "예산 수치에 대한 정직한 기록" 을 본다. */
const SCAN_BUDGET_MS = 700;

const TODAY = '2026-09-21' as DateKey;
let bundle = 0;

/** 살아 있는 카테고리 1개 + `fillFloor` 가 `NEVER_VISITED_DAYS` 전에 멈춘 루틴 `ROUTINE_COUNT` 개를
 * 새 IndexedDB 묶음에 심는다. */
async function seedScenario(dbName: string): Promise<Repositories> {
  const repos = createIndexedDbRepositories(createStore(dbName));

  const category = adopt(makeCategory({ seq: 1 }));
  await repos.categories.upsert(category);

  const startDate = addCivilDays(TODAY, -NEVER_VISITED_DAYS) as DateKey;
  for (let i = 0; i < ROUTINE_COUNT; i += 1) {
    const routine = adopt(
      makeRoutine({
        seq: i + 1,
        categoryId: category.id,
        recurrence: { type: 'weekly', daysOfWeek: [i % 7] },
        startDate,
        fillFloor: addCivilDays(startDate, -1) as DateKey,
      }),
    );
    await repos.routines.upsert(routine);
  }
  return repos;
}

beforeAll(async () => {
  setRepositories(await seedScenario('tasky-routine-slow-warmup'));
  const warm = createTodoStore(fixedDeps());
  await warm.getState().materializeRoutines({ from: TODAY, to: TODAY, today: TODAY });
});

describe(`materializeRoutines 지연 생성 스캔 비용 (${ROUTINE_COUNT}루틴 × ${FILL_BACKFILL_HORIZON_DAYS}일 지평선)`, () => {
  beforeEach(async () => {
    bundle += 1;
    setRepositories(await seedScenario(`tasky-routine-slow-${bundle}`));
  });

  it(`재방문 한 번이 ${SCAN_BUDGET_MS}ms 이내다 — 지평선이 뒤로 훑는 길이를 자른다(Major 3)`, async () => {
    const store = createTodoStore(fixedDeps());

    const started = performance.now();
    const ok = await store.getState().materializeRoutines({ from: TODAY, to: TODAY, today: TODAY });
    const elapsed = performance.now() - started;

    expect(ok).toBe(true);
    process.stdout.write(
      `[perf] materializeRoutines(${ROUTINE_COUNT}루틴, ${NEVER_VISITED_DAYS}일 미방문): ` +
        `${elapsed.toFixed(1)}ms (예산 ${SCAN_BUDGET_MS}ms)\n`,
    );
    expect(elapsed).toBeLessThanOrEqual(SCAN_BUDGET_MS);

    // 지평선 클램프가 실제로 걸렸는지: 만든 인스턴스의 가장 이른 날짜가 지평선
    // (today - FILL_BACKFILL_HORIZON_DAYS) 이전으로 내려가지 않아야 한다.
    const horizonFloor = addCivilDays(TODAY, -FILL_BACKFILL_HORIZON_DAYS) as DateKey;
    const created = await getRepositories().todos.listByDateRange(horizonFloor, TODAY);
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((todo) => todo.date >= horizonFloor)).toBe(true);

    // 후보 수가 설계 수치(10루틴 × ~156/루틴 ≈ 1,565)와 같은 자리수인지 — 클램프가 없었다면
    // 10년/7 ≈ 521 × 10 ≈ 5,214 로 3배 넘게 커졌을 것이다.
    expect(created.length).toBeGreaterThan(1400);
    expect(created.length).toBeLessThan(1700);
  });
});
