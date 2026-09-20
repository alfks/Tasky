// 통계 화면 전용 표시 문구. 계산은 하지 않고 초→문구, 비율→퍼센트만 바꾼다.

/** 초를 "N시간 M분" 문구로. 1분 미만은 "1분 미만"(0초 포함), 정확히 시간 단위면 분을 생략한다. */
export function formatFocusDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 1) return '1분 미만';
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours === 0) return `${restMinutes}분`;
  if (restMinutes === 0) return `${hours}시간`;
  return `${hours}시간 ${restMinutes}분`;
}

/** 히트맵 칸의 `aria-label`용 날짜 문구. */
export function formatHeatmapDate(dateKey: string): string {
  const [, month, day] = dateKey.split('-');
  return `${Number(month)}월 ${Number(day)}일`;
}
