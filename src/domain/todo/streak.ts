// 연속 달성(스트릭) 계산 (stats.md R4). 통계 기간을 넓히며 새로 필요해진 신규 domain 함수 둘 중
// 하나다 — 추이·카테고리 비율은 새로 만들지 않고 `day-summary.ts`·`completion-rate.ts` 를 그대로 쓴다.
//
// **스펙 원문의 시그니처(`isAllDoneByDay: readonly boolean[]`)로는 R4 를 구현할 수 없어 여기서
// 정정한다.** `boolean` 하나로는 "그날 투두가 0개였다"와 "투두가 있었는데 다 못 했다"를 구분할 수
// 없고, 그 구분이 R4("투두 0개인 날은 스트릭을 끊지 않고 건너뛴다") 자체다 — 구분 못 하면 건너뛸지
// 끊을지 판정할 수 없다. 그래서 `total`까지 함께 받는다(design review, T-85 코디네이터 정정 1).
import type { DaySummary } from '@/domain/todo/day-summary';

/**
 * `days` 는 오래된 날 → 기준일(오늘 또는 선택 날짜) 순, 기준일이 **마지막 원소**다. 뒤에서 앞으로
 * 훑어 끊기지 않고 이어진 완료 일수를 센다.
 *
 * - `total === 0`(그날 투두 없음): 건너뛴다 — 스트릭을 끊지 않는다(R4).
 * - `isAllDone`: 스트릭 +1.
 * - 그 외(투두는 있었는데 다 못 함): 그 자리에서 멈춘다.
 *
 * 경계: 어제 100% + 오늘 미완료(`total>0`) → 0. 오늘 `total===0` + 어제 100% → 1(오늘은 건너뛰고
 * 어제로 이어진다).
 */
export function computeStreak(days: readonly Pick<DaySummary, 'total' | 'isAllDone'>[]): number {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const day = days[i];
    if (day === undefined) break;
    if (day.total === 0) continue;
    if (!day.isAllDone) break;
    streak += 1;
  }
  return streak;
}
