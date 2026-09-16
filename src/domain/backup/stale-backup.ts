// 백업 경고 점의 판정 (backup.md §2·R10·R14). 순수 함수 하나로 두는 이유는 이 조건이 **끌 수 없는**
// 상태 표시이기 때문이다 — 닫기 버튼도 "다시 보지 않기" 설정도 없고, 사라지는 유일한 경로는 내보내기다
// (R10·R14). 그래서 이 함수의 입력에는 "사용자가 껐는가" 가 없다.
// 근거: 데이터가 이 브라우저 안에만 있으므로 경고를 끄는 것은 위험을 지우는 게 아니라 숨기는 것이다.
//
// **확인된 백업과 확인 못 한 백업은 기간이 다르다** (R14, 사용자 결정). 브라우저가 저장 성공을 알려주지
// 않는 경로(앵커 내려받기)에서는 파일이 실제로 저장됐는지 알 수 없다. 그렇다고 점을 영구히 켜 두면
// 사용자가 표시 자체를 무시하게 되어 경고의 목적이 무너지므로, **일단 끄되 절반 기간만 지나면 다시 켠다.**
import { diffSeconds, isInstant } from '@/domain/date/instant';

/** 이만큼 지나면 오래된 백업으로 본다 (§2). */
export const BACKUP_STALE_DAYS = 30;

/**
 * 저장 완료를 **확인하지 못한** 백업의 임계값 (R14). 보통의 절반이다 — 파일이 정말 저장됐는지 모르는
 * 기록이므로 확인된 백업과 같은 신뢰를 줄 수 없다. 30일의 절반이라 15일이고, 나누어떨어진다.
 */
export const BACKUP_UNCONFIRMED_STALE_DAYS = BACKUP_STALE_DAYS / 2;

/**
 * 마지막 백업의 저장 완료를 이 기기가 **관측했는가** (R10·R14).
 * `'confirmed'` 는 파일 피커가 쓰기를 마친 것을 본 경우뿐이고, 그 밖은 전부 `'unconfirmed'` 다.
 */
export type BackupConfirmation = 'confirmed' | 'unconfirmed';

/** 그 기록에 적용할 임계 일수 (R14). */
export function staleDaysFor(confirmation: BackupConfirmation): number {
  return confirmation === 'confirmed' ? BACKUP_STALE_DAYS : BACKUP_UNCONFIRMED_STALE_DAYS;
}

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
 * 마지막 백업이 임계 일수를 **넘었거나 아예 없는가**. 정확히 임계일째는 "초과" 가 아니므로 거짓이다.
 *
 * 투두 개수와 분리해 둔 이유는 값이 비싸기 때문이다 — 이 조건이 거짓이면 경고 점은 개수와 무관하게
 * 꺼지므로, 호출부가 투두를 한 건도 읽지 않고 끝낼 수 있다(리뷰 라운드 1 Major-4).
 */
export function isBackupStale(
  lastBackupAt: string | undefined,
  now: string,
  confirmation: BackupConfirmation = 'confirmed',
): boolean {
  const days = daysSinceBackup(lastBackupAt, now);
  return days === null || days > staleDaysFor(confirmation);
}

/**
 * 경고 점을 보일지 (§2). 마지막 백업이 임계 일수를 **넘었거나 아예 없으면서** 투두가 20개 이상일 때만
 * 참이다. 임계는 확인된 백업이면 30일, 확인 못 한 백업이면 그 절반인 15일이다(R14).
 * 정확히 임계일째는 "초과" 가 아니므로 거짓이다.
 */
export function shouldWarnStaleBackup(input: {
  lastBackupAt: string | undefined;
  todoCount: number;
  now: string;
  /** 생략하면 확인된 백업으로 본다 — 확인 못 한 기록은 호출부가 명시한다. */
  confirmation?: BackupConfirmation;
}): boolean {
  if (input.todoCount < BACKUP_WARN_MIN_TODOS) {
    return false;
  }
  return isBackupStale(input.lastBackupAt, input.now, input.confirmation ?? 'confirmed');
}
