'use client';

type StreakCardProps = {
  streak: number;
  /** 오늘 투두가 있는가(review M4) — "기록이 아예 없음"과 "오늘 아직 다 못 함"을 가른다. */
  todayTotal: number;
  todayIsAllDone: boolean;
};

/** 스트릭이 today 기준 고정 12주 창에서 계산된다는 것을 카드에 드러낸다(review M1). */
const STREAK_WINDOW_HINT = '최근 12주 기준(오늘부터)';

/**
 * 연속 달성 카드(stats.md §2·R4). `computeStreak` 결과를 그대로 보여준다 — 계산은 여기 없다.
 *
 * `streak === 0` 은 두 가지 다른 상황을 가릴 수 있다(review M4 실사용 재현: 오늘 투두 2개 중
 * 1개만 완료해도 스트릭은 0 인데, 그 옆 카테고리 비율 카드엔 "3/4"이 찍혀 있다 — "이 기간에
 * 기록이 없어요"는 거짓말이다). `todayTotal`(오늘 투두가 있었는가)로 갈라 말한다.
 */
export function StreakCard({ streak, todayTotal, todayIsAllDone }: StreakCardProps) {
  if (streak > 0) {
    return (
      <div className="flex flex-col gap-[var(--space-1)]">
        <p className="text-lg text-text">
          <span aria-hidden="true">🔥 </span>
          {streak}일째 연속 달성
        </p>
        <p className="text-xs text-muted">{STREAK_WINDOW_HINT}</p>
      </div>
    );
  }

  if (todayTotal > 0 && !todayIsAllDone) {
    return (
      <div className="flex flex-col gap-[var(--space-1)]">
        <p className="text-sm text-text">오늘 아직 다 못 했어요</p>
        <p className="text-xs text-muted">{STREAK_WINDOW_HINT}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--space-1)]">
      <p className="text-sm text-muted">아직 연속 기록이 없어요</p>
      <p className="text-xs text-muted">{STREAK_WINDOW_HINT}</p>
    </div>
  );
}
