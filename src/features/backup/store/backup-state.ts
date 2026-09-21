// 백업 스토어의 **상태 모양과 순수 변환** — React·zustand·레포지토리를 모르는 부분만 모았다.
// 언제 읽고 쓰는가는 `backup-actions.ts`, 파일 입출력은 `browser-file.ts`.
import type { BackupDocument, BackupIssue } from '@/domain/backup/backup-document';
import { backupIssueMessage } from '@/domain/backup/backup-document';
import type { BackupCounts } from '@/domain/backup/export-backup';
import type { ImportCounts, ImportMode } from '@/domain/backup/plan-import';
import {
  BACKUP_UNCONFIRMED_STALE_DAYS,
  type BackupConfirmation,
} from '@/domain/backup/stale-backup';
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
   * 그 내보내기의 저장 완료를 이 기기가 관측했는가 (R10·R14). 확인 못 한 기록은 임계 기간이 절반이고
   * 화면 문구도 다르다 — "백업함" 과 "백업을 시도했어요" 는 다른 사실이다.
   */
  confirmation: BackupConfirmation;
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
  /**
   * 내보내기는 끝났지만 **저장을 확인하지 못했다**는 안내 (R10·R14). 이 경우 `lastBackupAt` 을 찍지
   * 않으므로 경고 점도 그대로 남는다 — 왜 남는지를 말해 주지 않으면 고장으로 보인다.
   */
  exportNote: string | null;
  /**
   * 가져오기가 성공할 때마다 +1 (R11). 저장소 전체가 통째로 바뀌었다는 신호이고, 자기 데이터를
   * 캐시해 둔 다른 feature 가 이 값을 구독해 다시 조회한다(백업 스토어는 그들의 조회 함수를 모른다).
   */
  dataRevision: number;
};

/** 가져오기 실패 공통 문구 (§2 에러). 원인이 아니라 **데이터가 그대로라는 사실**을 알린다. */
export const IMPORT_FAILED = '가져오지 못했어요. 파일은 바뀌지 않았어요';

/** 내보내기 실패 공통 문구. */
export const EXPORT_FAILED = '내보내지 못했어요. 다시 시도해 주세요';

/** 지금 데이터를 읽지 못했을 때 (내보내기·가져오기 어느 쪽도 아직 누르지 않은 상태의 실패). */
export const LOAD_FAILED = '지금 데이터를 읽지 못했어요. 다시 시도해 주세요';

/**
 * 저장 완료를 관측할 수 없는 브라우저에서 내보낸 뒤의 안내 (R10·R14).
 * File System Access API 가 없으면 `anchor.click()` 뿐이고 그것은 취소·차단을 알려주지 않는다.
 * 무슨 일이 일어났는지(시도만 기록) 와 언제 다시 알릴지(절반 기간)를 둘 다 말한다.
 */
export const EXPORT_UNCONFIRMED =
  '파일이 저장됐는지 확인해 주세요. 이 브라우저는 저장 완료를 알려주지 않아 "백업 시도" 로만 기록했고, ' +
  `${BACKUP_UNCONFIRMED_STALE_DAYS}일 뒤에 다시 알려 드려요`;

/** 교체 확인 체크박스가 꺼져 있을 때 `[가져오기]` 가 다는 이유 (§5). */
export const NEEDS_ACKNOWLEDGE = '확인 체크가 필요해요';

export const initialBackupState: BackupState = {
  open: false,
  phase: 'idle',
  current: null,
  lastBackupAt: undefined,
  confirmation: 'unconfirmed',
  refreshedAt: null,
  warnStale: false,
  mode: 'merge',
  acknowledged: false,
  fileName: null,
  selection: null,
  issue: null,
  error: null,
  result: null,
  exportNote: null,
  dataRevision: 0,
};

/**
 * 도메인 규칙 위반은 그 문구를 그대로, 그 밖의 실패는 공통 문구를 쓴다.
 *
 * `LocalSnapshotError`(지금 저장소의 행이 형식을 어김)는 `DomainError` 가 아니므로 여기서 공통 문구로
 * 떨어진다 — 파일은 멀쩡한데 "파일 형식이 올바르지 않아요" 라고 하지 않기 위한 분기다(§2 저장 실패).
 */
export function importErrorMessage(error: unknown): string {
  return error instanceof DomainError ? error.message : IMPORT_FAILED;
}

/** 화면에 띄울 파일 오류 문구 (R8). 오류가 없으면 `null`. */
export function issueMessage(issue: BackupIssue | null): string | null {
  return issue === null ? null : backupIssueMessage(issue);
}

/**
 * 내보낼 것이 하나도 없는 상태 (§2 빈 상태). 아직 못 읽었으면 "없다" 로 보지 않는다.
 * 카테고리·할 일이 0개라도 `hasOtherData`(D-day·다이어리·루틴, T-86)가 있으면 빈 상태가 아니다
 * (리뷰 #108 Major 3 — 이 조건이 없으면 그 데이터만 있는 사용자가 내보내기를 못 누른다).
 */
export function isEmptyDataset(state: BackupState): boolean {
  return (
    state.current !== null &&
    state.current.categories === 0 &&
    state.current.todos === 0 &&
    !state.current.hasOtherData
  );
}

/**
 * 내보내기 버튼을 누를 수 있는가.
 *
 * `allowEmpty` 는 **인증 경로 전용**(sync.md — 리뷰 Major 1)이다: 로그아웃·계정 삭제·계정 전환·
 * 계정 삭제 안내 확인은 로그인이 필수라 내보내기가 막히면 사용자가 빠져나갈 문이 없다 — 로컬이
 * 비어 있어도(할 일 0건) 거의 빈 JSON 하나를 내보내고 정상적으로 진행돼야 한다. 수동 "내보내기"
 * 버튼(`BackupDialog`)은 이 옵션 없이 그대로 부른다 — 빈 상태에서 누를 이유가 없는 그 버튼까지
 * 풀어 줄 필요는 없다(§2 빈 상태 문구가 여전히 그 자리를 설명한다).
 */
export function canExport(state: BackupState, options?: { allowEmpty?: boolean }): boolean {
  if (state.phase !== 'idle' || state.current === null) return false;
  if (options?.allowEmpty === true) return true;
  return !isEmptyDataset(state);
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
  // 괄호 안의 셋을 더하면 앞머리의 카테고리 + 할 일 개수와 **같다** — 파일 내용을 분해한 값이기
  // 때문이다(§2 예시 `20+3+289 = 312`, `planMerge` 주석).
  const { counts, source } = result;
  return (
    `카테고리 ${source.categories}개, 할 일 ${source.todos}개를 가져왔어요 ` +
    `(추가 ${counts.added} · 갱신 ${counts.updated} · 유지 ${counts.kept})`
  );
}
