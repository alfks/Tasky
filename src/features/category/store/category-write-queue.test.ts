// 카테고리 쓰기 큐가 **하나**라는 것을 고정한다 (category R2 이름 유일성 · R5 order).
//
// 예전에는 `createCategoryActions` 와 `createRemovalActions` 가 각자 `createCategoryWriter` 를
// 불러 **큐가 두 갈래**였다. 두 큐는 서로의 차례를 기다리지 않으므로, 생성이 저장 중인 사이에
// 삭제가 시작되면 삭제 쪽 계획이 **한 건 낡은 모집단**을 읽는다 — ② 즉석 생성이 방금 만들어진
// 카테고리와 같은 이름·같은 `order` 를 발급할 수 있었다. 투두 스토어가 같은 유형의 경쟁으로
// `orders=[0,0]` 을 냈던 전례가 있다.
//
// 그 창을 여는 방법: `categories.upsert`(생성 경로) 만 문(gate)으로 막는다. 삭제는 `dataset.write`
// 를 타므로 막히지 않고, 큐가 갈라져 있으면 생성이 끝나기 전에 계획을 세운다.
import { beforeEach, describe, expect, it } from 'vitest';

import type { Category } from '@/domain/category/category';
import { PALETTE } from '@/domain/theme/palette';

import { setRepositories, type Repositories } from '@/repositories/container';
import { createMemoryTables, type MemoryTables } from '@/repositories/memory/live';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { createCategoryStore } from '@/features/category/store/category-store';
import { makeCategory } from '@/test/fixtures/category';
import { fixedDeps } from '@/test/fixtures/deps';

const [CORAL, PEACH, ORANGE] = PALETTE;

/** 삭제 대상. 활성 목록의 유일한 항목이라 `order` 모집단이 한눈에 보인다. */
const 공부 = makeCategory({ seq: 1, name: '공부', order: 0, color: CORAL.light });

let tables: MemoryTables;
let store: ReturnType<typeof createCategoryStore>;
let openGate: () => void;

beforeEach(async () => {
  tables = createMemoryTables();
  tables.categories.rows.set(공부.id, 공부);
  const memory = createMemoryRepositories(tables);
  const gate = new Promise<void>((resolve) => {
    openGate = resolve;
  });
  const gated: Repositories = {
    ...memory,
    categories: {
      ...memory.categories,
      // 생성 경로만 붙잡는다 — 삭제(`dataset.write`)는 그대로 흐른다.
      upsert: async (entity) => {
        await gate;
        await memory.categories.upsert(entity);
      },
    },
  };
  setRepositories(gated);
  store = createCategoryStore(fixedDeps());
  await store.getState().load();
});

/** 저장소에 실제로 남은 살아 있는 카테고리(툼스톤 제외). 상태가 아니라 로우로 본다. */
function livingRows(): Category[] {
  return [...tables.categories.rows.values()].filter((row) => row.deletedAt === undefined);
}

/**
 * 생성과 삭제를 **같은 틱에** 건다. 문이 닫혀 있는 동안 둘 다 큐에 들어가고, 큐가 하나면
 * 삭제는 생성이 상태에 반영된 **뒤에** 계획을 세운다.
 */
async function raceCreateAndRemove(instant: { name: string; color: string }): Promise<void> {
  const creating = store.getState().createCategory({ name: '운동', color: PEACH.light });
  const removing = store.getState().removeCategory({
    category: 공부,
    choice: { incomplete: 'create', name: instant.name, color: instant.color },
  });
  // 두 액션이 각자의 큐에서 이미 출발하도록 몇 틱 흘린다(경쟁 창을 최대로 연다).
  for (let tick = 0; tick < 5; tick += 1) {
    await Promise.resolve();
  }
  openGate();
  await Promise.all([creating, removing]);
}

describe('생성과 삭제가 같은 쓰기 큐를 공유한다', () => {
  it('② 즉석 생성이 방금 만들어진 카테고리와 같은 이름을 발급하지 않는다 (R2)', async () => {
    await raceCreateAndRemove({ name: '운동', color: ORANGE.light });

    const 운동들 = livingRows().filter((row) => row.name === '운동');
    expect(
      운동들.map((row) => row.id),
      '같은 이름의 카테고리가 둘 생겼다 — 삭제 계획이 낡은 모집단을 읽었다',
    ).toHaveLength(1);
  });

  it('② 즉석 생성이 방금 발급된 order 를 다시 쓰지 않는다 (R5)', async () => {
    await raceCreateAndRemove({ name: '독서', color: ORANGE.light });

    const orders = livingRows()
      .filter((row) => row.status === 'active')
      .map((row) => row.order)
      .sort((a, b) => a - b);
    expect(orders, '살아남은 카테고리가 둘이 아니다 — 픽스처 전제가 깨졌다').toHaveLength(2);
    expect(new Set(orders).size, `order 가 겹쳤다: ${orders.join(', ')}`).toBe(orders.length);
  });

  it('대조군: 문이 열려 있으면 둘 다 성공하고 저장소에 그대로 남는다', async () => {
    openGate();

    expect(await store.getState().createCategory({ name: '운동', color: PEACH.light })).toBe(true);
    expect(
      await store.getState().removeCategory({
        category: 공부,
        choice: { incomplete: 'create', name: '독서', color: ORANGE.light },
      }),
    ).toBe(true);

    expect(
      livingRows()
        .map((row) => row.name)
        .sort(),
    ).toEqual(['독서', '운동']);
  });
});
