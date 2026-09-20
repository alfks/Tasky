// D-day 픽스처 팩토리 (calendar.md §4). `makeRoutine` 과 같은 모양 — 결정적 기본값 + `seq` 로 id 를 돌린다.
import type { Dday } from '@/domain/dday/dday';

import { FIXTURE_DATE, FIXTURE_INSTANT, fixtureId } from '@/test/fixtures/deps';

/** 한 건. */
export function makeDday(overrides: Partial<Dday> & { seq?: number } = {}): Dday {
  const { seq = 1, ...rest } = overrides;
  return {
    id: fixtureId('generated', seq),
    createdAt: FIXTURE_INSTANT,
    updatedAt: FIXTURE_INSTANT,
    rev: 1,
    title: `D-day ${seq}`,
    date: FIXTURE_DATE,
    ...rest,
  };
}
