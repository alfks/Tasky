'use client';

type StreakCardProps = {
  streak: number;
};

/** 연속 달성 카드(stats.md §2·R4). `computeStreak` 결과를 그대로 보여준다 — 계산은 여기 없다. */
export function StreakCard({ streak }: StreakCardProps) {
  if (streak === 0) {
    return <p className="text-sm text-muted">이 기간에 기록이 없어요</p>;
  }

  return (
    <p className="text-lg text-text">
      <span aria-hidden="true">🔥 </span>
      {streak}일째 연속 달성
    </p>
  );
}
