// 카테고리 스토어 테스트 (category.md R1~R9·R18~R20). 저장소는 memory 구현이고 매 테스트 새로 주입한다.
//
// 픽스처는 **비대칭**으로 둔다: 카테고리를 2~3개, `order` 와 이름·색을 서로 다르게 깔고 단언한다.
// 양쪽에 1건씩만 두면 옳은 구현과 틀린 구현이 같은 값을 내서 테스트가 아무것도 지키지 못한다.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Category } from '@/domain/category/category';
import { CATEGORY_MAX_COUNT } from '@/domain/category/category.rules';
import { markDeleted, type Persistable } from '@/domain/meta';
import { PALETTE } from '@/domain/theme/palette';

import { getRepositories, setRepositories, type Repositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';
import { RepositoryError } from '@/repositories/repository-error';

import { createCategoryStore, type CategoryStore } from '@/features/category/store/category-store';
import { fixedDeps } from '@/test/fixtures/deps';

const SAVE_FAILED = '저장하지 못했어요. 다시 시도해 주세요';
const [CORAL, PEACH, ORANGE] = PALETTE;

let store: ReturnType<typeof createCategoryStore>;

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  store = createCategoryStore(fixedDeps());
});

const state = (): CategoryStore => store.getState();

/** 이름으로 현재 상태의 카테고리를 집는다 — id 는 주입기가 정하므로 이름이 더 읽기 좋다. */
function find(name: string): Category {
  const found = Object.values(state().byId).find((category) => category.name === name);
  if (found === undefined) {
    throw new Error(`상태에 "${name}" 이 없습니다`);
  }
  return found;
}

/** 활성 목록을 `order` 순 이름으로 — 재매김 결과를 한 줄로 단언한다. */
function activeNames(): string[] {
  return Object.values(state().byId)
    .filter((category) => category.status === 'active')
    .sort((a, b) => a.order - b.order)
    .map((category) => category.name);
}

/** 활성 `order` 값 자체 — 0..n-1 연속성을 보기 위해. */
function activeOrders(): number[] {
  return Object.values(state().byId)
    .filter((category) => category.status === 'active')
    .map((category) => category.order)
    .sort((a, b) => a - b);
}

/**
 * 서로 다른 이름·색의 카테고리 세 개(공부 0 · 운동 1 · 독서 2). 이후 테스트가 이 비대칭 배치 위에서
 * 단언한다 — 한 개짜리 픽스처는 `order` 를 잘못 매겨도 통과한다.
 */
async function seedThree(): Promise<void> {
  await state().load();
  await state().createCategory({ name: '공부', color: CORAL.light, emoji: '📚' });
  await state().createCategory({ name: '운동', color: PEACH.light });
  await state().createCategory({ name: '독서', color: ORANGE.light });
}

/** 쓰기를 전부 거절하는 저장소로 갈아 끼운다(조회는 그대로). */
function failWrites(): void {
  const repos = getRepositories();
  const fail = (): Promise<never> =>
    Promise.reject(new RepositoryError('DATASET_WRITE_INVALID', '테스트'));
  setRepositories({
    ...repos,
    categories: { ...repos.categories, upsert: fail },
    dataset: { ...repos.dataset, write: fail },
  } satisfies Repositories);
}

describe('첫 실행 시드 (R18)', () => {
  it('빈 저장소를 읽으면 📝 todo 한 개만 만든다', async () => {
    await state().load();

    const seeded = Object.values(state().byId);
    expect(seeded).toHaveLength(1);
    expect(seeded[0]).toMatchObject({
      name: 'todo',
      emoji: '📝',
      color: '#7CC6FF',
      status: 'active',
      order: 0,
    });
    await expect(getRepositories().categories.list()).resolves.toHaveLength(1);
  });

  it('시드와 함께 `seededAt` 을 기록한다', async () => {
    await state().load();

    const settings = await getRepositories().settings.get();
    expect(settings?.seededAt).toBeDefined();
  });

  it('이미 카테고리가 있으면 시드하지 않는다', async () => {
    await seedThree();
    // 시드가 이름만 보고 판단하면 여기서 네 번째가 생긴다.
    await state().load();

    expect(activeNames()).toEqual(['todo', '공부', '운동', '독서']);
  });

  it('시드한 카테고리를 지운 뒤 다시 읽어도 되살아나지 않는다', async () => {
    await state().load();
    const seeded = find('todo');
    await getRepositories().categories.upsert(markDeleted(seeded, '2026-02-01T00:00:00.000Z'));

    await state().load();

    expect(Object.values(state().byId)).toHaveLength(0);
  });

  /**
   * 회귀 가드(e2e 리뷰 라운드 #111 Major): `load()` 가 시드 쓰기를 기다리지 않고 먼저
   * `status: 'ready'` 를 찍으면, 사이드바가 잠깐 "카테고리 없음" 으로 그려졌다가 시드된
   * 카테고리로 바뀌는 깜빡임이 생긴다 — 그 창에서 사용자가 카테고리를 만들면 시드분과 합쳐져
   * 개수가 어긋난다(실측: 핵심 흐름 e2e 가 간헐적으로 "기대 1개·실제 2개"로 깨졌다). 이
   * 테스트는 브라우저·타이밍 추측 없이, `dataset.write` 를 수동으로 막아 시드 쓰기가 아직
   * 끝나지 않은 순간의 `status` 를 직접 잰다.
   */
  it('시드 쓰기가 끝나기 전까지는 status 가 loading 이다(빈 상태 깜빡임 회귀)', async () => {
    const repos = getRepositories();
    let releaseWrite: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const write = vi.fn((writes: Parameters<Repositories['dataset']['write']>[0]) =>
      gate.then(() => repos.dataset.write(writes)),
    );
    setRepositories({ ...repos, dataset: { ...repos.dataset, write } } satisfies Repositories);

    const loading = state().load();
    // `write` 가 불릴 때까지만 기다린다(값이 아니라 "시드 쓰기가 시작됐다" 는 사실을 기다리는
    // 것이라 시간 추측이 아니다) — 그 시점에도 `gate` 가 안 풀렸으니 시드는 아직 끝나지 않았다.
    await vi.waitFor(() => expect(write).toHaveBeenCalled());

    expect(state().status).toBe('loading');
    expect(state().byId).toEqual({});

    releaseWrite();
    await loading;

    expect(state().status).toBe('ready');
    expect(Object.values(state().byId)).toHaveLength(1);
  });
});

describe('이름 유일성·개수 제한 (R1·R2·R6)', () => {
  it('종료된 카테고리와도 이름이 겹치면 거절한다', async () => {
    await seedThree();
    await state().setStatus(find('독서').id, 'completed');

    await expect(state().createCategory({ name: '공부', color: PEACH.light })).resolves.toBe(false);
    expect(state().error).toBe('같은 이름이 이미 있어요');
    // 종료된 '독서' 는 목록에서 빠져 있지만 유일성 모집단에는 남아 있다.
    await expect(state().createCategory({ name: '독서', color: PEACH.light })).resolves.toBe(false);
    expect(activeNames()).toEqual(['todo', '공부', '운동']);
  });

  it('대소문자만 다른 이름도 같은 이름으로 본다', async () => {
    await state().load();
    await state().createCategory({ name: 'Study', color: CORAL.light });

    await expect(state().createCategory({ name: 'STUDY', color: PEACH.light })).resolves.toBe(
      false,
    );
  });

  it('수정할 때 자기 이름은 중복이 아니다', async () => {
    await seedThree();

    await expect(
      state().updateCategory(find('운동').id, { name: '운동', color: ORANGE.light }),
    ).resolves.toBe(true);
    expect(find('운동').color).toBe(ORANGE.light);
  });

  it('빈 이름과 20자 초과를 각각 다른 문구로 거절한다', async () => {
    await state().load();

    await expect(state().createCategory({ name: '   ', color: CORAL.light })).resolves.toBe(false);
    expect(state().error).toBe('이름을 입력해 주세요');
    await expect(
      state().createCategory({ name: '가'.repeat(21), color: CORAL.light }),
    ).resolves.toBe(false);
    expect(state().error).toBe('20자까지 쓸 수 있어요');
  });

  it('삭제되지 않은 카테고리가 50개면 더 만들지 못한다', async () => {
    await state().load();
    for (let i = 1; i < CATEGORY_MAX_COUNT; i += 1) {
      await state().createCategory({ name: `카테고리 ${i}`, color: CORAL.light });
    }
    expect(Object.values(state().byId)).toHaveLength(CATEGORY_MAX_COUNT);

    await expect(state().createCategory({ name: '한 개 더', color: PEACH.light })).resolves.toBe(
      false,
    );
    expect(state().error).toBe('카테고리는 50개까지 만들 수 있어요');
  });
});

describe('색 배정 (R3·R20)', () => {
  it('팔레트 밖의 색은 거절한다', async () => {
    await state().load();

    await expect(state().createCategory({ name: '공부', color: '#123456' })).resolves.toBe(false);
    expect(state().error).toBe('색을 골라 주세요');
  });

  it('색 변경은 재조회 없이 상태에 반영된다', async () => {
    await seedThree();
    const repos = getRepositories();
    const list = vi.fn(repos.categories.list);
    setRepositories({ ...repos, categories: { ...repos.categories, list } } satisfies Repositories);

    await state().updateCategory(find('공부').id, { color: ORANGE.light });

    expect(find('공부').color).toBe(ORANGE.light);
    expect(find('운동').color).toBe(PEACH.light);
    expect(list).not.toHaveBeenCalled();
  });
});

describe('순서 (R5)', () => {
  it('새 카테고리는 활성 목록 끝을 받는다', async () => {
    await seedThree();

    expect(activeNames()).toEqual(['todo', '공부', '운동', '독서']);
    expect(activeOrders()).toEqual([0, 1, 2, 3]);
  });

  it('순서를 바꾸면 활성 목록이 0..n-1 로 다시 매겨진다', async () => {
    await seedThree();

    await state().reorder(find('독서').id, 1);

    expect(activeNames()).toEqual(['todo', '독서', '공부', '운동']);
    expect(activeOrders()).toEqual([0, 1, 2, 3]);
  });

  it('`Alt+↑/↓` 는 한 칸씩 옮기고 목록 끝에서는 아무것도 하지 않는다', async () => {
    await seedThree();

    await expect(state().moveBy(find('운동').id, -1)).resolves.toBe(true);
    expect(activeNames()).toEqual(['todo', '운동', '공부', '독서']);

    await expect(state().moveBy(find('todo').id, -1)).resolves.toBe(false);
    expect(state().error).toBeNull();
    expect(activeNames()).toEqual(['todo', '운동', '공부', '독서']);
  });

  it('종료된 카테고리는 활성 목록의 좌표가 없다', async () => {
    await seedThree();
    await state().setStatus(find('공부').id, 'paused');

    await expect(state().moveBy(find('공부').id, -1)).resolves.toBe(false);
    expect(activeNames()).toEqual(['todo', '운동', '독서']);
  });
});

describe('동시 쓰기 직렬화 (R2·R5)', () => {
  // `category-writes.ts` 의 쓰기 큐가 지키는 문장을 테스트로 옮긴다. 큐가 없으면 두 액션이 **같은
  // 스냅샷**을 읽는다 — `await` 한 번 뒤에 `build()` 가 도는 구조라 두 번째 액션이 첫 번째의 결과를
  // 보지 못한다. 현실 트리거: 추가 버튼 더블클릭, Enter 연타, 셸이 붙일 단축키 연타.
  it('동시에 두 개를 만들어도 `order` 가 중복 발급되지 않는다 (R5)', async () => {
    await seedThree();

    await Promise.all([
      state().createCategory({ name: '요리', color: CORAL.light }),
      state().createCategory({ name: '청소', color: PEACH.light }),
    ]);

    expect(activeNames()).toEqual(['todo', '공부', '운동', '독서', '요리', '청소']);
    // 직렬화가 없으면 둘 다 활성 최대 order 를 같은 값으로 읽어 [0,1,2,3,4,4] 가 된다.
    expect(activeOrders()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('같은 이름을 동시에 두 번 만들면 하나만 통과한다 (R2)', async () => {
    await state().load();

    const results = await Promise.all([
      state().createCategory({ name: '요리', color: CORAL.light }),
      state().createCategory({ name: '요리', color: PEACH.light }),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(state().error).toBe('같은 이름이 이미 있어요');
    expect(activeNames()).toEqual(['todo', '요리']);
    await expect(getRepositories().categories.list()).resolves.toHaveLength(2);
  });
});

describe('상태 전이 (R7·R9)', () => {
  it('종료하면 `closedAt` 이 남고 재개하면 사라진다', async () => {
    await seedThree();

    await state().setStatus(find('공부').id, 'completed');
    expect(find('공부')).toMatchObject({ status: 'completed' });
    expect(find('공부').closedAt).toBeDefined();

    await state().setStatus(find('공부').id, 'active');
    expect(find('공부').status).toBe('active');
    expect(find('공부').closedAt).toBeUndefined();
  });

  it('완료 ⇄ 중단 상태 바꾸기가 된다', async () => {
    await seedThree();

    await state().setStatus(find('운동').id, 'completed');
    await expect(state().setStatus(find('운동').id, 'paused')).resolves.toBe(true);
    expect(find('운동').status).toBe('paused');
  });

  it('같은 상태로는 전이하지 않는다(자동 전이 없음)', async () => {
    await seedThree();

    await expect(state().setStatus(find('독서').id, 'active')).resolves.toBe(false);
    expect(state().error).toBe('지금 상태에서는 바꿀 수 없어요');
  });

  it('재개하면 활성 목록 **끝** 으로 간다', async () => {
    await seedThree();
    // 가운데(order 1)를 종료했다가 재개한다 — 제자리로 돌아오면 R9 위반이다.
    await state().setStatus(find('공부').id, 'paused');

    await state().setStatus(find('공부').id, 'active');

    expect(activeNames()).toEqual(['todo', '운동', '독서', '공부']);
  });

  it('없는 카테고리는 실패가 아니라 대상 없음이다', async () => {
    await state().load();

    await expect(state().setStatus('없는-id', 'completed')).resolves.toBe(false);
    expect(state().error).toBeNull();
  });
});

describe('적재와 저장 실패 (§2-D)', () => {
  it('종료된 카테고리까지 함께 읽는다', async () => {
    await seedThree();
    await state().setStatus(find('독서').id, 'completed');

    const reloaded = createCategoryStore(fixedDeps());
    await reloaded.getState().load();

    expect(Object.values(reloaded.getState().byId)).toHaveLength(4);
    expect(reloaded.getState().status).toBe('ready');
  });

  it('조회가 실패하면 상태가 error 가 된다', async () => {
    const repos = getRepositories();
    setRepositories({
      ...repos,
      categories: {
        ...repos.categories,
        list: () => Promise.reject(new RepositoryError('DATASET_WRITE_INVALID', '테스트')),
      },
    } satisfies Repositories);

    await state().load();

    expect(state().status).toBe('error');
    expect(state().error).toBe(SAVE_FAILED);
  });

  it('저장이 실패하면 만들어지지 않고 문구가 남는다', async () => {
    await seedThree();
    failWrites();

    await expect(state().createCategory({ name: '새 카테고리', color: PEACH.light })).resolves.toBe(
      false,
    );
    expect(state().error).toBe(SAVE_FAILED);
    expect(activeNames()).toEqual(['todo', '공부', '운동', '독서']);
  });

  it('순서 변경이 실패하면 이전 순서로 되돌린다', async () => {
    await seedThree();
    failWrites();

    await expect(state().reorder(find('독서').id, 0)).resolves.toBe(false);

    expect(activeNames()).toEqual(['todo', '공부', '운동', '독서']);
    expect(state().error).toBe(SAVE_FAILED);
  });
});

describe('T-12b 이음새', () => {
  it('되돌리기 창의 삭제 직전 값 자리가 비어 있다', () => {
    expect(state().pendingRemoval).toBeNull();
  });

  it('단일 트랜잭션으로 소프트 삭제된 카테고리는 다시 읽을 때 목록에 없다', async () => {
    await seedThree();
    const target = find('독서');
    const tombstone: Persistable<Category> = markDeleted(target, '2026-02-01T00:00:00.000Z');

    await getRepositories().dataset.write([{ table: 'categories', entity: tombstone }]);
    const reloaded = createCategoryStore(fixedDeps());
    await reloaded.getState().load();

    expect(Object.values(reloaded.getState().byId).map((c) => c.name)).toEqual([
      'todo',
      '공부',
      '운동',
    ]);
  });
});

describe('서버 확인 후 지연된 로컬 캐시', () => {
  it('캐시 모듈을 기다리는 사이 계정이 바뀌면 기존 개인 카테고리를 쓰지 않는다', async () => {
    await seedThree();
    const original = find('공부');
    let sameAccount = true;
    const pending = state().confirmAudience(
      original.id,
      { id: 'a'.repeat(32), visibility: 'public', version: 1 },
      () => sameAccount,
    );
    sameAccount = false;
    expect(await pending).toBe(false);
    expect(state().byId[original.id]).toEqual(original);
    expect(await getRepositories().categories.getById(original.id)).toEqual(original);
  });
  it('원격 응답 뒤 로컬 연결이 바뀌면 queued guard가 새 연결을 보존한다', async () => {
    await seedThree();
    const original = find('공부');
    const newer = {
      ...original,
      socialCategoryId: 'b'.repeat(32),
      socialCategoryVersion: 3,
      name: '새 이름',
    };
    const pending = state().confirmAudience(
      original.id,
      { id: 'a'.repeat(32), visibility: 'public', version: 1 },
      () => {
        const latest = state().byId[original.id];
        return (
          latest.socialCategoryId === original.socialCategoryId && latest.name === original.name
        );
      },
    );
    store.setState({ byId: { ...state().byId, [original.id]: newer } });
    expect(await pending).toBe(false);
    expect(state().byId[original.id]).toEqual(newer);
  });
});
