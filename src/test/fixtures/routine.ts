// 루틴 픽스처 팩토리 (routine.md §4). `makeTodo`·`makeCategory` 와 같은 모양 — 결정적 기본값 +
// `seq` 로 id 를 돌린다. T-83(관리 화면) 테스트가 저장소에 직접 심는 용도로 쓴다.
import type { DateKey } from '@/domain/date/date-key';
import type { Routine } from '@/domain/routine/routine';
import type { RoutineRecurrence } from '@/domain/todo/routine.rules';

import { FIXTURE_DATE, FIXTURE_INSTANT, fixtureId } from '@/test/fixtures/deps';
import { FIXTURE_CATEGORY_ID } from '@/test/fixtures/todo';

const DEFAULT_RECURRENCE: RoutineRecurrence = { type: 'weekly', daysOfWeek: [4] };

/**
 * 한 건. 기본은 **무기한(`endDate` 없음) · 활성 · `order` 없음(옛 레코드 모양)** 루틴이다 —
 * `overrides.endDate` 를 주면 기록용(routine.md R7-a, ⋯ 메뉴에 삭제만 남는 쪽)이 되고, 순서를 재는
 * 테스트는 `order` 를 직접 준다(R13 — 없으면 `compareRoutines` 가 `createdAt`·`id` 로 가른다).
 */
export function makeRoutine(overrides: Partial<Routine> & { seq?: number } = {}): Routine {
  const { seq = 1, ...rest } = overrides;
  const startDate: DateKey = rest.startDate ?? FIXTURE_DATE;
  return {
    id: fixtureId('generated', seq),
    createdAt: FIXTURE_INSTANT,
    updatedAt: FIXTURE_INSTANT,
    rev: 1,
    title: `루틴 ${seq}`,
    categoryId: FIXTURE_CATEGORY_ID,
    recurrence: DEFAULT_RECURRENCE,
    startDate,
    active: true,
    fillFloor: startDate,
    ...rest,
  };
}
