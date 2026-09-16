// 백업 경고 점의 판정 (backup.md §2·R10·R14). 순수 함수 하나로 두는 이유는 이 조건이 **끌 수 없는**
// 상태 표시이기 때문이다 — 닫기 버튼도 "다시 보지 않기" 설정도 없고, 사라지는 유일한 경로는 내보내기로
// `lastBackupAt` 이 갱신되는 것이다(R10·R14). 그래서 이 함수의 입력에는 "사용자가 껐는가" 가 없다.
// 근거: 데이터가 이 브라우저 안에만 있으므로 경고를 끄는 것은 위험을 지우는 게 아니라 숨기는 것이다.
import { diffSeconds, isInstant } from '@/domain/date/instant';

/** 이만큼 지나면 오래된 백업으로 본다 (§2). */
export const BACKUP_STALE_DAYS = 30;

/** 이보다 적으면 잃을 것이 적다고 보고 경고하지 않는다 (§2). */
export const BACKUP_WARN_MIN_TODOS = 20;

const SECONDS_PER_DAY = 24 * 60 * 60;

/**
 * 마지막 백업 이후 지난 날수(내림). 백업한 적이 없거나 시각이 형식에 맞지 않으면 `null`.
 * 미래 시각(기기 시계가 뒤로 간 경우)은 0 으로 본다 — 음수 날수는 화면에 쓸 자리가 없다.
 */
export function daysSinceBackup(lastBackupAt: string | undefined, now: string): number | null {
  if (lastBackupAt === undefined || !isInstant(lastBackupAt) || !isInstant(now)) {
    return null;
  }
  return Math.max(0, Math.floor(diffSeconds(lastBackupAt, now) / SECONDS_PER_DAY));
}

/**
 * 마지막 백업이 30일을 **넘었거나 아예 없는가**. 정확히 30일째는 "초과" 가 아니므로 거짓이다.
 *
 * 투두 개수와 분리해 둔 이유는 값이 비싸기 때문이다 — 이 조건이 거짓이면 경고 점은 개수와 무관하게
 * 꺼지므로, 호출부가 투두를 한 건도 읽지 않고 끝낼 수 있다(리뷰 라운드 1 Major-4).
 */
export function isBackupStale(lastBackupAt: string | undefined, now: string): boolean {
  const days = daysSinceBackup(lastBackupAt, now);
  return days === null || days > BACKUP_STALE_DAYS;
}

/**
 * 경고 점을 보일지 (§2). 마지막 백업이 30일을 **넘었거나 아예 없으면서** 투두가 20개 이상일 때만 참이다.
 * 정확히 30일째는 "초과" 가 아니므로 거짓이다.
 */
export function shouldWarnStaleBackup(input: {
  lastBackupAt: string | undefined;
  todoCount: number;
  now: string;
}): boolean {
  if (input.todoCount < BACKUP_WARN_MIN_TODOS) {
    return false;
  }
  return isBackupStale(input.lastBackupAt, input.now);
}
