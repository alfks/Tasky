'use client';

// 백업/복원 다이얼로그 (backup.md §2·§5). 조립만 한다 — 절 두 개와 하단 버튼, 그리고 진행 중 상태다.
import { useId } from 'react';

import { useShallow } from 'zustand/react/shallow';

import { BackupExportSection } from '@/features/backup/components/BackupExportSection';
import { BackupImportSection } from '@/features/backup/components/BackupImportSection';
import {
  canExport,
  canImport,
  importBlockedReason,
  issueMessage,
} from '@/features/backup/store/backup-state';
import { useBackupStore, type BackupStore } from '@/features/backup/store/backup-store';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

/** 렌더에 필요한 조각만 한 번에 구독한다(필드가 전부 같은 참조면 리렌더가 없다). */
const selectView = (state: BackupStore) => ({
  open: state.open,
  phase: state.phase,
  current: state.current,
  lastBackupAt: state.lastBackupAt,
  confirmation: state.confirmation,
  refreshedAt: state.refreshedAt,
  exportNote: state.exportNote,
  mode: state.mode,
  acknowledged: state.acknowledged,
  fileName: state.fileName,
  selection: state.selection,
  issue: state.issue,
  error: state.error,
  exportable: canExport(state),
  importable: canImport(state),
  blockedReason: importBlockedReason(state),
});

export function BackupDialog() {
  const view = useBackupStore(useShallow(selectView));
  // 누를 수 없는 이유는 툴팁만으로는 키보드·스크린리더 사용자에게 닿지 않는다(§5, 리뷰 Minor-6).
  const blockedReasonId = useId();
  const closeDialog = useBackupStore((state) => state.closeDialog);
  const exportBackup = useBackupStore((state) => state.exportBackup);
  const selectFile = useBackupStore((state) => state.selectFile);
  const setMode = useBackupStore((state) => state.setMode);
  const setAcknowledged = useBackupStore((state) => state.setAcknowledged);
  const runImport = useBackupStore((state) => state.runImport);

  const importing = view.phase === 'importing';
  const busy = view.phase !== 'idle';

  return (
    <Dialog
      open={view.open}
      onClose={closeDialog}
      title="백업/복원"
      className="max-w-[480px]"
      footer={
        <>
          <Button variant="outline" onClick={closeDialog} disabled={importing}>
            취소
          </Button>
          <Button
            onClick={() => void runImport()}
            loading={importing}
            aria-disabled={!view.importable}
            title={view.blockedReason ?? undefined}
            aria-describedby={view.blockedReason === null ? undefined : blockedReasonId}
          >
            가져오기
          </Button>
        </>
      }
    >
      <div aria-busy={busy} className="flex flex-col gap-[var(--space-5)]">
        <BackupExportSection
          counts={view.current}
          lastBackupAt={view.lastBackupAt}
          confirmation={view.confirmation}
          now={view.refreshedAt ?? ''}
          note={view.exportNote}
          busy={view.phase === 'exporting'}
          disabled={!view.exportable}
          onExport={() => void exportBackup()}
        />
        <hr className="border-border" />
        <BackupImportSection
          fileName={view.fileName}
          selection={view.selection}
          current={view.current}
          errorMessage={issueMessage(view.issue)}
          mode={view.mode}
          acknowledged={view.acknowledged}
          busy={busy}
          onSelect={(file) => void selectFile(file)}
          onModeChange={setMode}
          onAcknowledgedChange={setAcknowledged}
        />
        {view.blockedReason === null ? null : (
          <p id={blockedReasonId} className="text-sm text-muted">
            {view.blockedReason}
          </p>
        )}
        {view.error === null ? null : (
          <p role="alert" className="text-sm text-danger">
            {view.error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
