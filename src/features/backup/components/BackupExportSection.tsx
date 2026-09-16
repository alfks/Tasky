// 다이얼로그의 "내보내기" 절 (backup.md §2·R1·R10).

import type { BackupCounts } from '@/domain/backup/export-backup';
import { daysSinceBackup } from '@/domain/backup/stale-backup';

import { Button } from '@/components/ui/Button';

import { toDateKey } from '@/lib/date';

type BackupExportSectionProps = {
  /** 지금 저장소에 있는 개수. 아직 못 읽었으면 `null`. */
  counts: BackupCounts | null;
  lastBackupAt: string | undefined;
  /** 경과 일수 계산 기준 시각(주입 — 렌더 중 시계를 읽지 않는다). */
  now: string;
  /** 저장을 확인하지 못했을 때의 안내 (R10·R14). 없으면 `null`. */
  note: string | null;
  busy: boolean;
  disabled: boolean;
  onExport: () => void;
};

/** "마지막 백업: 2026-09-01 (14일 전)" — 날짜는 **로컬** 표기다. */
function lastBackupLabel(lastBackupAt: string | undefined, now: string): string {
  const days = daysSinceBackup(lastBackupAt, now);
  if (lastBackupAt === undefined || days === null) {
    return '마지막 백업: 없음';
  }
  const date = toDateKey(new Date(lastBackupAt));
  return `마지막 백업: ${date} (${days === 0 ? '오늘' : `${days}일 전`})`;
}

export function BackupExportSection({
  counts,
  lastBackupAt,
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
        <p className="text-sm text-muted">{lastBackupLabel(lastBackupAt, now)}</p>
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
