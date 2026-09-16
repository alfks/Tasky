// 백업 파일의 **형식**과 실패 코드 (backup.md R1·R2·R3·R8·R9). 값을 만들지 않고 모양만 정의한다 —
// 만드는 쪽은 `export-backup.ts`, 읽는 쪽은 `validate-backup.ts` 다.
import type { Category } from '@/domain/category/category';
import type { FocusSession } from '@/domain/focus/focus-session';
import type { Settings } from '@/domain/theme/settings';
import type { Todo } from '@/domain/todo/todo';

/** 파일이 이 앱의 것임을 나타내는 고정값 (R2). 다르면 `NOT_TASKY_FILE`. */
export const BACKUP_APP = 'tasky';

/**
 * 파일이 쓰는 스키마 버전 (R3). **`src/infra/indexeddb/db.ts` 의 `DB_VERSION` 과 같은 값이어야 한다.**
 *
 * 그 상수를 직접 import 하지 않는 이유는 레이어 경계다 — `domain` 은 `infra` 를 import 할 수 없다
 * (ARCHITECTURE §1). 대신 `backup-document.test.ts` 가 두 값을 대조한다(테스트 계층은 경계가 없다).
 * 한쪽만 올리면 그 테스트가 실패하므로, 두 값이 갈라진 채로 머지되지 않는다.
 */
export const BACKUP_SCHEMA_VERSION = 2;

/** 가져오기가 읽는 최대 파일 크기 (R9). 초과하면 **읽지 않고** 거부한다. */
export const BACKUP_MAX_BYTES = 20 * 1024 * 1024;

/** 내보내기 JSON 의 들여쓰기 칸 수 (R1). */
export const BACKUP_JSON_INDENT = 2;

/**
 * 백업 파일 한 건. 엔티티 배열은 **전체 필드**이고(R2), `categories` 는 삭제되지 않은 것 + 다른
 * 배열이 가리키는 tombstone 을 포함한다. `settings` 는 `Meta` 를 포함한 엔티티 전체다 —
 * R2 예시는 `theme`·`accentColor`·`updatedAt` 만 적었지만 그 셋만으로는 `adopt()` 의 `Meta` 검증
 * (ADR-0009 결정 3)을 통과할 수 없고 왕복 동일성(R2)도 성립하지 않는다. 예시가 생략형이다.
 */
export type BackupDocument = {
  app: typeof BACKUP_APP;
  schemaVersion: number;
  exportedAt: string;
  settings: Settings;
  categories: Category[];
  todos: Todo[];
  focusSessions: FocusSession[];
};

/** 가져오기 실패의 종류 (R8·R9·R3). UI 는 문구가 아니라 이 코드로 분기한다. */
export type BackupIssueCode =
  /** JSON 으로 읽히지 않는다. */
  | 'NOT_JSON'
  /** JSON 이지만 이 앱의 백업 파일이 아니다(`app` 불일치, 객체가 아님). */
  | 'NOT_TASKY_FILE'
  /** 파일의 스키마 버전이 이 앱보다 높다 — 낮출 방법이 없다. */
  | 'FUTURE_VERSION'
  /** 20MB 초과. 내용을 읽기 전에 판정한다. */
  | 'TOO_LARGE'
  /** 형식·타입·참조 검증 실패. `path` 가 **첫** 오류 위치다. */
  | 'SHAPE_INVALID';

/**
 * 검증 실패 한 건. **`path` 는 구조 경로(`todos[12].title`)뿐이고 값은 절대 싣지 않는다** —
 * 제목·메모는 사용자 데이터라 `Error.message` 를 타고 로그·리포팅으로 새면 회수할 수 없다
 * (데이터셋 쓰기의 `writeDetail`(`@/repositories/write-plan`) 과 같은 판단). 경로 문자열은 고정 필드명과 배열 인덱스
 * 로만 조립되므로 입력에서 온 문자열이 섞일 자리가 없다.
 */
export type BackupIssue = {
  code: BackupIssueCode;
  /** `SHAPE_INVALID` 에만 있다. 예: `todos[12].title`. */
  path?: string;
};

/** 검증 결과. 성공하면 **현재 버전으로 변환·정규화된** 문서가 나온다. */
export type BackupValidation =
  { ok: true; document: BackupDocument } | { ok: false; issue: BackupIssue };

const MESSAGES: Record<BackupIssueCode, string> = {
  NOT_JSON: 'JSON 파일이 아니에요',
  NOT_TASKY_FILE: 'Tasky 백업 파일이 아니에요',
  FUTURE_VERSION: '더 새로운 버전의 Tasky에서 만든 파일이에요',
  TOO_LARGE: '20MB 이하 파일만 가져올 수 있어요',
  SHAPE_INVALID: '파일 내용이 올바르지 않아요',
};

/**
 * 크기 제한 (R9). **파일 본문을 읽기 전에** 부른다 — 20MB 를 넘는 파일은 메모리에 올리지 않고,
 * 검증 모듈(무거운 쪽)도 내려받지 않는다. 통과하면 `null`.
 */
export function checkBackupSize(bytes: number): BackupIssue | null {
  return bytes > BACKUP_MAX_BYTES ? { code: 'TOO_LARGE' } : null;
}

/** 화면에 그대로 쓰는 한국어 문구 (R8). `SHAPE_INVALID` 만 괄호로 경로를 덧붙인다. */
export function backupIssueMessage(issue: BackupIssue): string {
  const base = MESSAGES[issue.code];
  if (issue.code !== 'SHAPE_INVALID' || issue.path === undefined) {
    return base;
  }
  return `${base} (${issue.path})`;
}
