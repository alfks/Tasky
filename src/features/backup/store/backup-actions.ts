// 백업 스토어의 액션 — **언제 읽고 언제 쓰는가**만 담는다. 형식·병합 규칙은 전부 `@/domain/backup/*` 의
// 순수 함수가 하고(복제 금지), 저장은 `@/repositories/container` 로 주입된 인터페이스로만 한다.
//
// 이 파일이 지키는 한 문장: **쓰기는 `dataset.restore()` 한 번뿐이고 그 앞의 모든 실패는 쓰기 전에 난다.**
// 그래서 파일이 손상됐든 도중에 예상 밖의 값이 튀어나왔든 저장소는 변하지 않는다(backup R4·R7).
import { checkBackupSize } from '@/domain/backup/backup-document';
import {
  backupCounts,
  backupFileName,
  buildBackupDocument,
  serializeBackup,
} from '@/domain/backup/export-backup';
import type { ImportMode } from '@/domain/backup/plan-import';
import { shouldWarnStaleBackup } from '@/domain/backup/stale-backup';
import type { MetaDeps } from '@/domain/meta';
import { markBackedUp } from '@/domain/theme/settings.rules';

import { getRepositories } from '@/repositories/container';

import {
  canExport,
  canImport,
  EXPORT_FAILED,
  importErrorMessage,
  IMPORT_FAILED,
  type BackupState,
} from '@/features/backup/store/backup-state';
import { downloadJson, readFileText } from '@/features/backup/store/browser-file';
import { useTodoStore } from '@/features/todo';

/** 시각·id + **로컬 날짜**(파일명 R1). 테스트는 고정값을 넣는다. */
export type BackupDeps = MetaDeps & { today: () => string };

/** 브라우저 파일 입출력. 테스트는 대역으로 바꾼다(jsdom 은 실제 다운로드를 하지 않는다). */
export type BackupIo = {
  download: (fileName: string, text: string) => void;
  read: (file: File) => Promise<string>;
};

/** 런타임 기본 입출력. */
export const browserBackupIo: BackupIo = { download: downloadJson, read: readFileText };

export type BackupContext = {
  readonly set: (partial: Partial<BackupState>) => void;
  readonly get: () => BackupState;
  readonly deps: BackupDeps;
  readonly io: BackupIo;
};

export type BackupActions = {
  openDialog: () => void;
  /** 가져오기 진행 중에는 닫히지 않는다 (§2 로딩). */
  closeDialog: () => void;
  /** 현재 개수·마지막 백업 시각·경고 점을 다시 읽는다. */
  refresh: () => Promise<void>;
  exportBackup: () => Promise<boolean>;
  selectFile: (file: File | null) => Promise<void>;
  setMode: (mode: ImportMode) => void;
  setAcknowledged: (acknowledged: boolean) => void;
  runImport: () => Promise<boolean>;
  dismissResult: () => void;
};

/** 가져오기 뒤 화면을 다시 읽는다 (R11). 새로고침 없이 목록이 바뀐다. */
async function reloadViews(): Promise<void> {
  const todo = useTodoStore.getState();
  if (todo.date !== null) {
    await todo.loadDate(todo.date);
  }
}

export function createBackupActions(ctx: BackupContext): BackupActions {
  const refresh = async (): Promise<void> => {
    try {
      const snapshot = await getRepositories().dataset.readAll();
      const current = backupCounts(snapshot);
      const lastBackupAt = snapshot.settings.lastBackupAt;
      const now = ctx.deps.now();
      ctx.set({
        current,
        lastBackupAt,
        refreshedAt: now,
        warnStale: shouldWarnStaleBackup({ lastBackupAt, todoCount: current.todos, now }),
      });
    } catch {
      ctx.set({ error: EXPORT_FAILED });
    }
  };

  const exportBackup = async (): Promise<boolean> => {
    if (!canExport(ctx.get())) {
      return false;
    }
    ctx.set({ phase: 'exporting', error: null });
    try {
      const repositories = getRepositories();
      const snapshot = await repositories.dataset.readAll();
      const text = serializeBackup(buildBackupDocument(snapshot, ctx.deps.now()));
      // 내려받기가 실패하면 여기서 던진다 — `lastBackupAt` 은 그때 갱신되지 않는다(R10).
      ctx.io.download(backupFileName(ctx.deps.today()), text);
      await repositories.settings.upsert(markBackedUp(snapshot.settings, ctx.deps));
      ctx.set({ phase: 'idle' });
      await refresh();
      return true;
    } catch {
      ctx.set({ phase: 'idle', error: EXPORT_FAILED });
      return false;
    }
  };

  const selectFile = async (file: File | null): Promise<void> => {
    if (file === null) {
      ctx.set({ fileName: null, selection: null, issue: null, error: null });
      return;
    }
    ctx.set({ fileName: file.name, selection: null, issue: null, error: null, result: null });
    const tooLarge = checkBackupSize(file.size);
    if (tooLarge !== null) {
      ctx.set({ issue: tooLarge });
      return;
    }
    let text: string;
    try {
      text = await ctx.io.read(file);
    } catch {
      ctx.set({ error: IMPORT_FAILED });
      return;
    }
    // 검증기는 여기서 처음 필요해진다 — 첫 로드 JS 에 싣지 않는다(TECH_PLAN §8).
    const { parseBackup } = await import('@/domain/backup/validate-backup');
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      ctx.set({ issue: parsed.issue });
      return;
    }
    ctx.set({
      selection: {
        name: file.name,
        document: parsed.document,
        counts: backupCounts(parsed.document),
      },
    });
  };

  const runImport = async (): Promise<boolean> => {
    const state = ctx.get();
    if (!canImport(state) || state.selection === null) {
      return false;
    }
    const { mode, selection } = state;
    ctx.set({ phase: 'importing', error: null });
    try {
      const repositories = getRepositories();
      const { planImport } = await import('@/domain/backup/plan-import');
      // 병합의 "현재 데이터" 는 **툼스톤을 포함한 전량**이어야 한다 (R6·ADR-0009 규칙 3).
      const local = await repositories.dataset.readAll();
      const plan = planImport({ mode, local, document: selection.document });
      await repositories.dataset.restore(plan.snapshot);
      ctx.set({
        phase: 'idle',
        open: false,
        selection: null,
        fileName: null,
        issue: null,
        acknowledged: false,
        result: { counts: plan.counts, source: selection.counts },
      });
      await refresh();
      await reloadViews();
      return true;
    } catch (error) {
      ctx.set({ phase: 'idle', error: importErrorMessage(error) });
      return false;
    }
  };

  return {
    openDialog: () => ctx.set({ open: true, error: null, result: null }),
    closeDialog: () => {
      if (ctx.get().phase !== 'importing') {
        ctx.set({ open: false });
      }
    },
    refresh,
    exportBackup,
    selectFile,
    setMode: (mode) => ctx.set({ mode, acknowledged: false }),
    setAcknowledged: (acknowledged) => ctx.set({ acknowledged }),
    runImport,
    dismissResult: () => ctx.set({ result: null }),
  };
}
