// 집중 세션 픽스처 팩토리. 기본은 25분짜리 실행 중 세션이다.
import type { FocusSession } from '@/domain/focus/focus-session';

import { FIXTURE_DATE, FIXTURE_INSTANT, fixtureId } from '@/test/fixtures/deps';

/** 한 건. 기본 상태는 `running`, 계획 25분, 일시정지 0초. */
export function makeFocusSession(
  overrides: Partial<FocusSession> & { seq?: number } = {},
): FocusSession {
  const { seq = 1, ...rest } = overrides;
  return {
    id: fixtureId('focus', seq),
    createdAt: FIXTURE_INSTANT,
    updatedAt: FIXTURE_INSTANT,
    rev: 1,
    date: FIXTURE_DATE,
    plannedSeconds: 25 * 60,
    startedAt: FIXTURE_INSTANT,
    pausedTotalSeconds: 0,
    elapsedSeconds: 0,
    status: 'running',
    ...rest,
  };
}
