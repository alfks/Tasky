// 다이어리 스토어 테스트 (diary.md R1~R4). 저장소는 memory 구현이고 매 테스트 새로 주입한다.
import { beforeEach, describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';
import { MOOD_EMOJIS } from '@/domain/diary/mood-emoji';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { createDiaryStore, type DiaryStore } from '@/features/diary/store/diary-store';
import { fixedDeps } from '@/test/fixtures/deps';

const DATE = '2026-01-15' as DateKey;
const EMOJI = MOOD_EMOJIS[0].emoji;

let store: ReturnType<typeof createDiaryStore>;

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  store = createDiaryStore(fixedDeps());
});

const state = (): DiaryStore => store.getState();

describe('load', () => {
  it('그 날짜에 기록이 없으면 entry 가 undefined 다(빈 상태)', async () => {
    await state().load(DATE);

    expect(state().status).toBe('ready');
    expect(state().entry).toBeUndefined();
  });

  it('저장소 조회가 실패하면 error 에 문구를 남긴다(빈 상태와 구분된다)', async () => {
    setRepositories({
      ...createMemoryRepositories(),
      diaryEntries: {
        getByDate: () => Promise.reject(new Error('boom')),
        list: () => Promise.resolve([]),
        upsert: () => Promise.resolve(),
      },
    });
    store = createDiaryStore(fixedDeps());

    await state().load(DATE);

    expect(state().status).toBe('error');
    expect(state().error).toBe('저장하지 못했어요. 다시 시도해 주세요');
    expect(state().entry).toBeUndefined();
  });
});

describe('save (R1~R3)', () => {
  it('처음 저장하면 새 기록을 만든다', async () => {
    await state().load(DATE);

    const ok = await state().save({ emoji: EMOJI, content: '개운했다' });

    expect(ok).toBe(true);
    expect(state().entry?.emoji).toBe(EMOJI);
    expect(state().entry?.content).toBe('개운했다');
  });

  it('이미 기록이 있으면 두 번째 저장은 수정이다(하루 1개 유일성, R1)', async () => {
    await state().load(DATE);
    await state().save({ emoji: EMOJI, content: '첫 기록' });
    const firstId = state().entry?.id;

    const ok = await state().save({ emoji: MOOD_EMOJIS[1].emoji, content: '고쳐 씀' });

    expect(ok).toBe(true);
    expect(state().entry?.id).toBe(firstId);
    expect(state().entry?.content).toBe('고쳐 씀');
    const { getRepositories } = await import('@/repositories/container');
    const all = await getRepositories().diaryEntries.list();
    expect(all).toHaveLength(1);
  });

  it('이모지와 본문이 둘 다 비면 거부하고 error 에 문구를 남긴다(R3)', async () => {
    await state().load(DATE);

    const ok = await state().save({ content: '' });

    expect(ok).toBe(false);
    expect(state().error).toBe('기분이나 한 줄을 남겨 주세요');
    expect(state().entry).toBeUndefined();
  });

  it('500자를 넘으면 거부한다(경계)', async () => {
    await state().load(DATE);

    const ok = await state().save({ content: '가'.repeat(501) });

    expect(ok).toBe(false);
    expect(state().error).toBe('기록은 500자까지 적을 수 있어요');
  });
});

describe('remove·undoRemove (R4)', () => {
  it('삭제하면 entry 가 사라지고 되돌리면 다시 나타난다', async () => {
    await state().load(DATE);
    await state().save({ emoji: EMOJI, content: '기록' });
    const id = state().entry?.id;

    const removed = await state().remove();
    expect(removed).toBe(true);
    expect(state().entry).toBeUndefined();
    expect(state().pendingRemoval?.entry.id).toBe(id);

    const undone = await state().undoRemove();
    expect(undone).toBe(true);
    expect(state().entry?.id).toBe(id);
    expect(state().pendingRemoval).toBeNull();
  });

  it('되돌린 뒤 같은 날짜에 새로 저장해도 하나만 남는다(툼스톤 날짜 재작성)', async () => {
    await state().load(DATE);
    await state().save({ emoji: EMOJI, content: '기록' });
    await state().remove();

    await state().save({ content: '툼스톤 이후 새 기록' });

    const { getRepositories } = await import('@/repositories/container');
    const all = await getRepositories().diaryEntries.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.content).toBe('툼스톤 이후 새 기록');
  });

  it('기록이 없으면 remove 는 false 다', async () => {
    await state().load(DATE);

    expect(await state().remove()).toBe(false);
    expect(state().error).toBeNull();
  });

  it('되돌릴 것이 없으면 undoRemove 는 false 다', async () => {
    expect(await state().undoRemove()).toBe(false);
  });
});
