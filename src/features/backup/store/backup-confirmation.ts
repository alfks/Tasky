// "이 기기가 마지막 백업의 저장 완료를 관측했는가" 한 비트 (backup.md R10·R14, 사용자 결정).
//
// **왜 `Settings` 가 아니라 이 기기의 저장소인가.**
// `Settings.lastBackupAt` 은 백업 파일에 그대로 실려 다른 기기로 건너간다(R2). 그런데 "저장 대화상자가
// 끝나는 것을 봤다" 는 사실은 **그 브라우저에서만 참**이다 — 파일을 들고 온 기기가 남의 확인 기록을
// 물려받으면 보지도 않은 저장을 확인했다고 말하게 된다. 그래서 기기별로 둔다. (`Settings` 와
// `markBackedUp` 이 T-14 의 `owns` 밖이라는 사정도 같은 방향이다 — 필드를 늘리려면 별도 티켓이다.)
//
// **기본값이 `'unconfirmed'` 인 것이 핵심이다.** 표식이 없으면(처음 · 사생활 보호 모드 · 저장소 차단 ·
// 가져오기로 남의 `lastBackupAt` 이 들어온 경우) 전부 "확인 못 함" 으로 읽혀 **절반 기간**이 적용된다.
// 읽기·쓰기가 실패하는 쪽이 안전한 쪽으로 기운다.
import type { BackupConfirmation } from '@/domain/backup/stale-backup';

/** 확인된 내보내기의 시각을 담는 키. 값은 그때의 `lastBackupAt` 과 같은 ISO 문자열이다. */
const CONFIRMED_AT_KEY = 'tasky.backup.confirmed-at';

/** 저장소가 없거나(SSR) 막혀 있어도 던지지 않는다. */
function readKey(): string | null {
  try {
    return globalThis.localStorage?.getItem(CONFIRMED_AT_KEY) ?? null;
  } catch {
    return null;
  }
}

/** 저장 완료를 관측한 내보내기를 기록한다. 실패해도 조용히 넘어간다 — 그 결과는 "확인 못 함" 이다. */
export function rememberConfirmedExport(at: string): void {
  try {
    globalThis.localStorage?.setItem(CONFIRMED_AT_KEY, at);
  } catch {
    // 저장하지 못하면 다음 판정에서 'unconfirmed' 가 되어 절반 기간이 적용된다(안전한 실패).
  }
}

/**
 * 지금의 `lastBackupAt` 이 **이 기기가 저장 완료를 확인한 그 내보내기**인가.
 * 시각이 정확히 같을 때만 `'confirmed'` 다 — 그 뒤에 다른 경로로 갱신되면 표식이 어긋나 자동으로 풀린다.
 */
export function readBackupConfirmation(lastBackupAt: string | undefined): BackupConfirmation {
  if (lastBackupAt === undefined) {
    return 'unconfirmed';
  }
  return readKey() === lastBackupAt ? 'confirmed' : 'unconfirmed';
}
