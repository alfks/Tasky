// 백업 스토어의 액션 — **언제 읽고 언제 쓰는가**만 담는다. 형식·병합 규칙은 전부 `@/domain/backup/*` 의
// 순수 함수가 하고(복제 금지), 저장은 `@/repositories/container` 로 주입된 인터페이스로만 한다.
//
// 이 파일이 지키는 한 문장: **쓰기는 `dataset.restore()` 한 번뿐이고 그 앞의 모든 실패는 쓰기 전에 난다.**
// 그래서 파일이 손상됐든 도중에 예상 밖의 값이 튀어나왔든 저장소는 변하지 않는다(backup R4·R7).
//
// **`dataset.readAll()` 의 호출처는 둘뿐이다** — `exportBackup`(R2)과 `runImport`(R6). ADR-0009 규칙 4 가
// 할당한 자리가 그 둘이고, 넷째를 만들면 ADR 을 다시 봐야 한다. 그래서 개수·경고 점은 엔티티 조회로
// 읽는다(`refresh`·`refreshWarning`) — 앱이 뜰 때마다 툼스톤 포함 전량(R13 규모 16MB)을 메모리로
// 끌어올리지 않기 위해서이기도 하다(리뷰 라운드 1 Major-4).
import { checkBackupSize } from '@/domain/backup/backup-document';
import {
  backupCounts,
  backupFileName,
  buildBackupDocument,
  serializeBackup,
} from '@/domain/backup/export-backup';
import type { ImportMode } from '@/domain/backup/plan-import';
import {
  BACKUP_WARN_MIN_TODOS,
  isBackupStale,
  shouldWarnStaleBackup,
} from '@/domain/backup/stale-backup';
import type { MetaDeps } from '@/domain/meta';
import { markBackedUp } from '@/domain/theme/settings.rules';

import { getRepositories } from '@/repositories/container';

import {
  readBackupConfirmation,
  rememberConfirmedExport,
} from '@/features/backup/store/backup-confirmation';
import {
  canExport,
  canImport,
  EXPORT_FAILED,
  EXPORT_UNCONFIRMED,
  importErrorMessage,
  IMPORT_FAILED,
  LOAD_FAILED,
  type BackupState,
} from '@/features/backup/store/backup-state';
import {
  openBackupTarget,
  readFileText,
  type BackupTarget,
} from '@/features/backup/store/browser-file';
import { useTodoStore } from '@/features/todo';

/** 시각·id + **로컬 날짜**(파일명 R1). 테스트는 고정값을 넣는다. */
export type BackupDeps = MetaDeps & { today: () => string };

/** 브라우저 파일 입출력. 테스트는 대역으로 바꾼다(jsdom 은 실제 다운로드를 하지 않는다). */
export type BackupIo = {
  /** 저장할 자리를 사용자 제스처 안에서 확보한다. 사용자가 취소하면 `null`. */
  openTarget: (fileName: string) => Promise<BackupTarget | null>;
  read: (file: File) => Promise<string>;
};

/** 런타임 기본 입출력. */
export const browserBackupIo: BackupIo = { openTarget: openBackupTarget, read: readFileText };

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
  /** 다이얼로그가 보여줄 개수·마지막 백업 시각·경고 점을 다시 읽는다. */
  refresh: () => Promise<void>;
  /** 경고 점 하나만 판정한다 — 마운트 경로. 최신 백업이면 투두를 한 건도 읽지 않는다. */
  refreshWarning: () => Promise<void>;
  /** `options.allowEmpty` — 리뷰 Major 1, `backup-state.ts#canExport` 주석. */
  exportBackup: (options?: { allowEmpty?: boolean }) => Promise<boolean>;
  selectFile: (file: File | null) => Promise<void>;
  setMode: (mode: ImportMode) => void;
  setAcknowledged: (acknowledged: boolean) => void;
  runImport: () => Promise<boolean>;
  dismissResult: () => void;
};

/**
 * 가져오기 뒤 화면을 다시 읽는다 (R11). 새로고침 없이 목록이 바뀐다.
 *
 * 투두 스토어는 직접 다시 읽고, **자기 데이터를 따로 캐시해 둔 화면**은 `dataRevision` 을 구독해
 * 스스로 다시 조회한다(백업이 남의 조회 함수를 알면 의존 방향이 뒤집힌다). 지금 그 구독자는 하나,
 * 날짜 스트립의 주 요약(`useWeekSummaries`)이다 — 배선은 T-56 이 깔았다. 다만 스트립은 feature
 * 그래프의 리프라 `@/features/backup` 을 스스로 import 할 수 없어서(`import/no-cycle`),
 * `dataRevision` 을 실제로 읽는 것은 셸(`ShellHeader` 의 `useSummaryRevision`)이고 스트립에는
 * `summaryRevision` prop 으로 들어간다. **이 함수는 그 경로를 몰라도 된다** — 여기서 할 일은
 * `dataRevision` 을 올리는 것뿐이고 그것은 `runImport` 가 이미 한다.
 */
async function reloadViews(): Promise<void> {
  const todo = useTodoStore.getState();
  if (todo.date !== null) {
    await todo.loadDate(todo.date);
  }
}

export function createBackupActions(ctx: BackupContext): BackupActions {
  /**
   * 다이얼로그가 쓰는 정확한 개수. 엔티티 조회라 툼스톤이 섞이지 않는다(= `backupCounts` 와 같은 수).
   * `hasOtherData`(리뷰 #108 Major 3, T-86)도 같은 방식으로 구한다 — 셋 다 엔티티 조회라 각자
   * 툼스톤을 감춘다.
   */
  const refresh = async (): Promise<void> => {
    try {
      const repositories = getRepositories();
      const [categoryList, todoList, settings, ddayList, diaryList, routineList] =
        await Promise.all([
          repositories.categories.list({ includeClosed: true }),
          repositories.todos.listAll(),
          repositories.settings.get(),
          repositories.dday.list(),
          repositories.diaryEntries.list(),
          repositories.routines.list({ includeInactive: true }),
        ]);
      const current = {
        categories: categoryList.length,
        todos: todoList.length,
        hasOtherData: ddayList.length > 0 || diaryList.length > 0 || routineList.length > 0,
      };
      const lastBackupAt = settings?.lastBackupAt;
      const confirmation = readBackupConfirmation(lastBackupAt);
      const now = ctx.deps.now();
      ctx.set({
        current,
        lastBackupAt,
        confirmation,
        refreshedAt: now,
        warnStale: shouldWarnStaleBackup({
          lastBackupAt,
          todoCount: current.todos,
          now,
          confirmation,
        }),
      });
    } catch {
      ctx.set({ error: LOAD_FAILED });
    }
  };

  /**
   * 경고 점만 판정한다 (R14). 설정 한 행을 먼저 읽고 **30일이 지나지 않았으면 거기서 끝난다** —
   * 마지막 백업이 최신인 사용자는 앱이 뜰 때 투두를 한 건도 읽지 않는다.
   *
   * 오래됐을 때만 개수를 보는데, 그때도 전량을 들고 오지 않는다: 계약이 정한 "빈 질의는 전량을
   * `limit` 까지"(`TodoRepository.search`)를 임계값 20 으로 써서 **최대 20행**만 받는다. 저장소 안의
   * 스캔까지 없애려면 계약에 `count` 가 있어야 하는데 그 파일은 이 티켓의 `owns` 밖이다 —
   * 여기서 줄인 것은 "앱 시작마다 전량을 메모리에 올리는 것" 이지 스캔 자체가 아니다.
   */
  const refreshWarning = async (): Promise<void> => {
    try {
      const repositories = getRepositories();
      const now = ctx.deps.now();
      const lastBackupAt = (await repositories.settings.get())?.lastBackupAt;
      const confirmation = readBackupConfirmation(lastBackupAt);
      ctx.set({ lastBackupAt, confirmation, refreshedAt: now });
      if (!isBackupStale(lastBackupAt, now, confirmation)) {
        ctx.set({ warnStale: false });
        return;
      }
      const probe = await repositories.todos.search('', BACKUP_WARN_MIN_TODOS);
      ctx.set({ warnStale: probe.length >= BACKUP_WARN_MIN_TODOS });
    } catch {
      ctx.set({ error: LOAD_FAILED });
    }
  };

  /**
   * 내보내기 (R1·R2·R10).
   *
   * 순서가 규칙이다: **저장할 자리를 먼저** 잡고(사용자 제스처가 살아 있어야 파일 피커가 열린다),
   * 그다음에 전량을 읽어 본문을 만든다. 사용자가 피커를 취소하면 16MB 를 만들 이유가 없다.
   *
   * 취소(`null`)면 아무것도 갱신하지 않는다. 저장까지 갔으면 `lastBackupAt` 은 찍되, **저장 완료를
   * 관측했을 때만** 확인 표식을 남긴다 (R14, 사용자 결정). 앵커 내려받기는 취소·차단을 알려주지 않으므로
   * 그 기록은 "백업 시도" 이고 임계 기간이 절반(15일)이라 곧 다시 알린다 — 영구히 켜 두면 사용자가
   * 표시를 무시하게 되어 경고의 목적이 무너지고, 전체 기간을 주면 저장되지 않은 파일을 믿게 된다.
   */
  const exportBackup = async (options?: { allowEmpty?: boolean }): Promise<boolean> => {
    if (!canExport(ctx.get(), options)) {
      return false;
    }
    ctx.set({ phase: 'exporting', error: null, exportNote: null });
    try {
      const repositories = getRepositories();
      const target = await ctx.io.openTarget(backupFileName(ctx.deps.today()));
      if (target === null) {
        // 사용자가 저장을 취소했다. 실패가 아니므로 오류 문구를 띄우지 않고, 아무것도 갱신하지 않는다.
        ctx.set({ phase: 'idle' });
        return false;
      }
      const snapshot = await repositories.dataset.readAll();
      const text = serializeBackup(buildBackupDocument(snapshot, ctx.deps.now()));
      await target.save(text);
      // 시각은 어느 경로에서든 찍는다 — 다른 것은 **그 기록을 얼마나 믿는가**다(R14).
      const backedUp = markBackedUp(snapshot.settings, ctx.deps);
      await repositories.settings.upsert(backedUp);
      if (target.confirmable) {
        rememberConfirmedExport(backedUp.lastBackupAt ?? '');
        ctx.set({ phase: 'idle' });
      } else {
        // 표식을 남기지 않는다 → 다음 판정이 'unconfirmed' 로 읽어 절반 기간을 쓴다.
        ctx.set({ phase: 'idle', exportNote: EXPORT_UNCONFIRMED });
      }
      await refresh();
      return true;
    } catch {
      ctx.set({ phase: 'idle', error: EXPORT_FAILED });
      return false;
    }
  };

  const selectFile = async (file: File | null): Promise<void> => {
    // 파일이 바뀌면 교체 확인 서명도 다시 받는다 — 파괴적 동작 앞의 체크는 남겨 두는 편이 싸지 않다.
    if (file === null) {
      ctx.set({ fileName: null, selection: null, issue: null, error: null, acknowledged: false });
      return;
    }
    ctx.set({
      fileName: file.name,
      selection: null,
      issue: null,
      error: null,
      result: null,
      acknowledged: false,
    });
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
        exportNote: null,
        result: { counts: plan.counts, source: selection.counts },
        dataRevision: ctx.get().dataRevision + 1,
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
    openDialog: () => {
      ctx.set({ open: true, error: null, result: null, exportNote: null });
      // 개수는 다이얼로그에만 필요하다 — 열 때 읽으면 앱 시작 비용이 0 이다.
      void refresh();
    },
    closeDialog: () => {
      if (ctx.get().phase !== 'importing') {
        ctx.set({ open: false });
      }
    },
    refresh,
    refreshWarning,
    exportBackup,
    selectFile,
    setMode: (mode) => ctx.set({ mode, acknowledged: false }),
    setAcknowledged: (acknowledged) => ctx.set({ acknowledged }),
    runImport,
    dismissResult: () => ctx.set({ result: null }),
  };
}
