// 다이어리 픽스처 팩토리 (diary.md §4). `makeRoutine` 과 같은 모양 — 결정적 기본값 + `seq` 로 id 를 돌린다.
import type { DiaryEntry } from '@/domain/diary/diary-entry';

import { FIXTURE_DATE, FIXTURE_INSTANT, fixtureId } from '@/test/fixtures/deps';

/** 한 건. 기본은 이모지 없이 본문만 있는 기록이다. */
export function makeDiaryEntry(overrides: Partial<DiaryEntry> & { seq?: number } = {}): DiaryEntry {
  const { seq = 1, ...rest } = overrides;
  return {
    id: fixtureId('generated', seq),
    createdAt: FIXTURE_INSTANT,
    updatedAt: FIXTURE_INSTANT,
    rev: 1,
    date: FIXTURE_DATE,
    content: `기록 ${seq}`,
    ...rest,
  };
}
