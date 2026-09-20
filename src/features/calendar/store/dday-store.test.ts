// D-day 스토어 테스트 (calendar.md R1·R4·R5). 저장소는 memory 구현이고 매 테스트 새로 주입한다.
import { beforeEach, describe, expect, it } from 'vitest';

import { DDAY_MAX_COUNT } from '@/domain/dday/dday.rules';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { createDdayStore, type DdayStore } from '@/features/calendar/store/dday-store';
import { fixedDeps } from '@/test/fixtures/deps';

let store: ReturnType<typeof createDdayStore>;

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  store = createDdayStore(fixedDeps());
});

const state = (): DdayStore => store.getState();

describe('add (R1)', () => {
  it('제목·날짜로 새 D-day 를 만들고 목록에 더한다', async () => {
    const ok = await state().add({ title: '생일', date: '2026-03-01' });

    expect(ok).toBe(true);
    expect(state().ddays).toHaveLength(1);
    expect(state().ddays[0]?.title).toBe('생일');
    expect(state().error).toBeNull();
  });

  it('빈 제목은 거부하고 error 에 문구를 남긴다(목록은 그대로)', async () => {
    const ok = await state().add({ title: '  ', date: '2026-03-01' });

    expect(ok).toBe(false);
    expect(state().ddays).toHaveLength(0);
    expect(state().error).toBe('제목을 입력해 주세요');
  });

  it('50개를 넘기면 거부한다 (R1)', async () => {
    for (let i = 0; i < DDAY_MAX_COUNT; i += 1) {
      expect(await state().add({ title: `D-day ${i}`, date: '2026-03-01' })).toBe(true);
    }

    const ok = await state().add({ title: '하나 더', date: '2026-03-01' });

    expect(ok).toBe(false);
    expect(state().ddays).toHaveLength(DDAY_MAX_COUNT);
    expect(state().error).toBe('D-day는 50개까지 만들 수 있어요');
  });
});

describe('remove·undoRemove (R5)', () => {
  it('삭제하면 목록에서 빠지고 되돌리면 다시 나타난다', async () => {
    await state().add({ title: '생일', date: '2026-03-01' });
    const id = state().ddays[0]?.id as string;

    const removed = await state().remove(id);
    expect(removed).toBe(true);
    expect(state().ddays).toHaveLength(0);
    expect(state().pendingRemoval?.dday.id).toBe(id);

    const undone = await state().undoRemove();
    expect(undone).toBe(true);
    expect(state().ddays).toHaveLength(1);
    expect(state().ddays[0]?.id).toBe(id);
    expect(state().pendingRemoval).toBeNull();
  });

  it('되돌린 값은 저장소에도 살아 있는 값으로 다시 보인다(list() 에 나온다)', async () => {
    await state().add({ title: '생일', date: '2026-03-01' });
    const id = state().ddays[0]?.id as string;
    await state().remove(id);

    await state().undoRemove();

    const { getRepositories } = await import('@/repositories/container');
    const fromRepo = await getRepositories().dday.list();
    expect(fromRepo.map((row) => row.id)).toContain(id);
  });

  it('없는 id 를 지우면 false — 대상이 없는 것은 실패 문구를 남기지 않는다', async () => {
    expect(await state().remove('없는-id')).toBe(false);
    expect(state().error).toBeNull();
  });

  it('되돌릴 것이 없으면 undoRemove 는 false 다', async () => {
    expect(await state().undoRemove()).toBe(false);
  });

  it('두 번째 삭제가 먼저 것의 되돌리기 슬롯을 덮는다(슬롯 하나)', async () => {
    await state().add({ title: '생일', date: '2026-03-01' });
    await state().add({ title: '발표', date: '2026-04-01' });
    const [first, second] = state().ddays;

    await state().remove(first?.id as string);
    await state().remove(second?.id as string);

    expect(state().pendingRemoval?.dday.id).toBe(second?.id);
  });
});

describe('load', () => {
  it('저장소의 전량을 읽어 상태를 채운다', async () => {
    // 한 스토어 인스턴스로 먼저 심고, 새 인스턴스가 저장소에서 그대로 읽어오는지 본다(메모리 캐시가 아님을 보장).
    await state().add({ title: '생일', date: '2026-03-01' });
    store = createDdayStore(fixedDeps());
    expect(state().ddays).toHaveLength(0);

    await state().load();

    expect(state().status).toBe('ready');
    expect(state().ddays).toHaveLength(1);
  });

  it('저장소 조회가 실패하면 error 에 문구를 남긴다', async () => {
    setRepositories({
      ...createMemoryRepositories(),
      dday: {
        list: () => Promise.reject(new Error('boom')),
        upsert: () => Promise.resolve(),
      },
    });
    store = createDdayStore(fixedDeps());

    await state().load();

    expect(state().status).toBe('error');
    expect(state().error).toBe('저장하지 못했어요. 다시 시도해 주세요');
  });
});
