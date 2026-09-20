// 연속 달성(스트릭) 계산 (stats.md R4). 통계 기간을 넓히며 새로 필요해진 신규 domain 함수 둘 중
// 하나다 — 추이·카테고리 비율은 새로 만들지 않고 `day-summary.ts`·`completion-rate.ts` 를 그대로 쓴다.
//
// **투두 0개인 날은 이 배열에 없다고 전제한다.** `total === 0` 인 날을 건너뛰는 일(stats.md R4)은
// 호출부(`features/reports`)가 `summarizeDays` 결과에서 그 날짜를 걸러내고 `isAllDoneByDay` 를
// 만드는 시점에 끝난다 — `isAllDone` 은 이미 `total > 0` 을 전제하는 값이라(day-summary.ts) 여기서
// 다시 `total` 을 묻지 않아도 "기록 없는 날은 스트릭을 끊지 않는다"가 자연히 성립한다.

/**
 * `from` 인덱스에서 과거(인덱스가 작아지는 방향)로 훑어, 끊기지 않고 이어진 `true` 의 개수를 센다.
 *
 * `from` 이 배열 밖이면 0. `isAllDoneByDay[from]` 자체가 `false` 면(예: 오늘 미완료) 곧바로 0이다 —
 * "어제 100% + 오늘 미완료 → 스트릭 0"(완료 조건)이 이 한 줄로 성립한다.
 */
export function computeStreak(isAllDoneByDay: readonly boolean[], from: number): number {
  if (!Number.isInteger(from) || from < 0 || from >= isAllDoneByDay.length) {
    return 0;
  }
  let streak = 0;
  for (let i = from; i >= 0; i -= 1) {
    if (!isAllDoneByDay[i]) break;
    streak += 1;
  }
  return streak;
}
