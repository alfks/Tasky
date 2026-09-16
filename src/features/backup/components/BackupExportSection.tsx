// 다이얼로그의 "내보내기" 절 (backup.md §2·R1·R10).

import type { BackupCounts } from '@/domain/backup/export-backup';
import { daysSinceBackup, type BackupConfirmation } from '@/domain/backup/stale-backup';

import { Button } from '@/components/ui/Button';

import { toDateKey } from '@/lib/date';

type BackupExportSectionProps = {
  /** 지금 저장소에 있는 개수. 아직 못 읽었으면 `null`. */
  counts: BackupCounts | null;
  lastBackupAt: string | undefined;
  /** 그 기록의 저장 완료를 관측했는가 (R10·R14). 문구가 달라진다. */
  confirmation: BackupConfirmation;
  /** 경과 일수 계산 기준 시각(주입 — 렌더 중 시계를 읽지 않는다). */
  now: string;
  /** 저장을 확인하지 못했을 때의 안내 (R10·R14). 없으면 `null`. */
  note: string | null;
  busy: boolean;
  disabled: boolean;
  onExport: () => void;
};

/**
 * "마지막 백업: 2026-09-01 (14일 전)" — 날짜는 **로컬** 표기다.
 *
 * 저장 완료를 확인하지 못한 기록은 **다르게 말한다**(R14): 우리가 아는 사실은 "파일을 넘겼다" 까지이고
 * 그것을 "백업했다" 로 적으면 거짓으로 안심시키는 것이다.
 */
function lastBackupLabel(
  lastBackupAt: string | undefined,
  now: string,
  confirmation: BackupConfirmation,
): string {
  const days = daysSinceBackup(lastBackupAt, now);
  if (lastBackupAt === undefined || days === null) {
    return '마지막 백업: 없음';
  }
  const date = toDateKey(new Date(lastBackupAt));
  const when = `${date} (${days === 0 ? '오늘' : `${days}일 전`})`;
  return confirmation === 'confirmed'
    ? `마지막 백업: ${when}`
    : `백업을 시도했어요(저장 확인 안 됨): ${when}`;
}

export function BackupExportSection({
  counts,
  lastBackupAt,
  confirmation,
  now,
  note,
  busy,
  disabled,
  onExport,
}: BackupExportSectionProps) {
  const isEmpty = counts !== null && counts.categories === 0 && counts.todos === 0;

  return (
    <section aria-labelledby="backup-export-heading" className="flex flex-col gap-[var(--space-2)]">
      <h3 id="backup-export-heading" className="text-base font-semibold">
        내보내기
      </h3>
      {isEmpty ? (
        <p className="text-sm text-muted">아직 내보낼 데이터가 없어요</p>
      ) : (
        <p className="text-sm text-muted">
          {counts === null
            ? '불러오는 중이에요'
            : `카테고리 ${counts.categories}개 · 할 일 ${counts.todos}개`}
        </p>
      )}
      <div className="flex items-center justify-between gap-[var(--space-3)]">
        <p className="text-sm text-muted">{lastBackupLabel(lastBackupAt, now, confirmation)}</p>
        <Button type="button" onClick={onExport} loading={busy} disabled={disabled}>
          JSON 내보내기
        </Button>
      </div>
      {note === null ? null : (
        <p role="status" className="text-sm text-danger">
          {note}
        </p>
      )}
    </section>
  );
}
