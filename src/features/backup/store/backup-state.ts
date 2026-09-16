// 백업 스토어의 **상태 모양과 순수 변환** — React·zustand·레포지토리를 모르는 부분만 모았다.
// 언제 읽고 쓰는가는 `backup-actions.ts`, 파일 입출력은 `browser-file.ts`.
import type { BackupDocument, BackupIssue } from '@/domain/backup/backup-document';
import { backupIssueMessage } from '@/domain/backup/backup-document';
import type { BackupCounts } from '@/domain/backup/export-backup';
import type { ImportCounts, ImportMode } from '@/domain/backup/plan-import';
import { DomainError } from '@/domain/errors';

/** 진행 중 상태 (§2 로딩). `importing` 동안은 다이얼로그를 닫을 수 없다. */
export type BackupPhase = 'idle' | 'loading' | 'exporting' | 'importing';

/** 검증을 통과한 파일 하나. 실패한 파일은 여기 들어오지 않는다. */
export type BackupSelection = {
  /** 화면에 그대로 보여주는 파일명. */
  name: string;
  document: BackupDocument;
  /** 이 파일이 담고 있는 개수(결과 문구에 쓴다). */
  counts: BackupCounts;
};

export type BackupState = {
  open: boolean;
  phase: BackupPhase;
  /** 지금 저장소에 있는 개수. 아직 못 읽었으면 `null`. */
  current: BackupCounts | null;
  /** 마지막 내보내기 시각 (R10). 경고 점과 다이얼로그가 같은 값을 쓴다. */
  lastBackupAt: string | undefined;
  /**
   * `lastBackupAt`·`warnStale` 을 계산한 시각. "14일 전" 표기가 이 값을 쓴다 —
   * 렌더 중에 시계를 읽으면 같은 상태가 렌더마다 다른 화면이 되고 테스트가 시각에 흔들린다.
   */
  refreshedAt: string | null;
  /** 경고 점 표시 여부 (R14). **사용자가 끌 수 없으므로 이 값을 바꾸는 액션이 없다.** */
  warnStale: boolean;
  mode: ImportMode;
  /** 교체 모드의 확인 체크박스 (R7). 모드를 바꾸면 항상 꺼진다. */
  acknowledged: boolean;
  /** 마지막으로 고른 파일 이름 — 검증에 실패해도 무엇을 골랐는지는 보여준다. */
  fileName: string | null;
  selection: BackupSelection | null;
  /** 파일 형식 오류 (R8). 고른 파일이 바뀌면 지워진다. */
  issue: BackupIssue | null;
  /** 저장 실패 등 형식 오류가 아닌 실패. */
  error: string | null;
  /** 가져오기 결과 토스트 (R12). */
  result: { counts: ImportCounts; source: BackupCounts } | null;
};

/** 가져오기 실패 공통 문구 (§2 에러). 원인이 아니라 **데이터가 그대로라는 사실**을 알린다. */
export const IMPORT_FAILED = '가져오지 못했어요. 파일은 바뀌지 않았어요';

/** 내보내기 실패 공통 문구. */
export const EXPORT_FAILED = '내보내지 못했어요. 다시 시도해 주세요';

/** 교체 확인 체크박스가 꺼져 있을 때 `[가져오기]` 가 다는 이유 (§5). */
export const NEEDS_ACKNOWLEDGE = '확인 체크가 필요해요';

export const initialBackupState: BackupState = {
  open: false,
  phase: 'idle',
  current: null,
  lastBackupAt: undefined,
  refreshedAt: null,
  warnStale: false,
  mode: 'merge',
  acknowledged: false,
  fileName: null,
  selection: null,
  issue: null,
  error: null,
  result: null,
};

/** 도메인 규칙 위반은 그 문구를 그대로, 그 밖의 실패는 공통 문구를 쓴다. */
export function importErrorMessage(error: unknown): string {
  return error instanceof DomainError ? error.message : IMPORT_FAILED;
}

/** 화면에 띄울 파일 오류 문구 (R8). 오류가 없으면 `null`. */
export function issueMessage(issue: BackupIssue | null): string | null {
  return issue === null ? null : backupIssueMessage(issue);
}

/** 내보낼 것이 하나도 없는 상태 (§2 빈 상태). 아직 못 읽었으면 "없다" 로 보지 않는다. */
export function isEmptyDataset(state: BackupState): boolean {
  return state.current !== null && state.current.categories === 0 && state.current.todos === 0;
}

/** 내보내기 버튼을 누를 수 있는가. */
export function canExport(state: BackupState): boolean {
  return state.phase === 'idle' && state.current !== null && !isEmptyDataset(state);
}

/** 가져오기 버튼을 누를 수 있는가 (R7: 교체는 확인 체크 필수). */
export function canImport(state: BackupState): boolean {
  if (state.selection === null || state.phase !== 'idle') {
    return false;
  }
  return state.mode !== 'replace' || state.acknowledged;
}

/** 누를 수 없는 이유 — 확인 체크가 빠진 경우만 문구가 있다 (§5 툴팁). */
export function importBlockedReason(state: BackupState): string | null {
  return state.mode === 'replace' && !state.acknowledged && state.selection !== null
    ? NEEDS_ACKNOWLEDGE
    : null;
}

/** 결과 토스트 문구 (R12). 개수는 파일이 담고 있던 것 + 적용 결과다. */
export function importResultMessage(result: NonNullable<BackupState['result']>): string {
  const { counts, source } = result;
  return (
    `카테고리 ${source.categories}개, 할 일 ${source.todos}개를 가져왔어요 ` +
    `(추가 ${counts.added} · 갱신 ${counts.updated} · 유지 ${counts.kept})`
  );
}
