// 백업 파일 문서 단위 검증 (backup.md R3·R4·R8·R9). **하나라도 나쁘면 아무것도 쓰지 않는다** 는 규칙이
// 여기서 성립하는 방식: 이 함수는 저장소를 전혀 모르고, 통과한 문서만 `plan-import.ts` 로 넘어가며,
// 실제 쓰기는 그보다 더 뒤의 `DatasetRepository.restore()` 한 번뿐이다 — 부분 적용이 생길 자리가 없다.
//
// 반환은 예외가 아니라 값(`BackupValidation`)이다. 화면이 "첫 오류 경로"를 그대로 보여줘야 하고(R8),
// 예외로 만들면 호출부마다 try/catch 를 기억해야 한다.
import {
  BACKUP_APP,
  BACKUP_SCHEMA_VERSION,
  type BackupDocument,
  type BackupIssue,
  type BackupValidation,
} from '@/domain/backup/backup-document';
import { migrateBackup } from '@/domain/backup/migrate-backup';
import { asArray, asRecord, failAt, isBackupShapeError } from '@/domain/backup/shape';
import {
  readCategory,
  readDday,
  readDiaryEntry,
  readFocusSession,
  readRoutine,
  readSettings,
  readTodo,
} from '@/domain/backup/validate-rows';
import type { Category } from '@/domain/category/category';
import { isInstant } from '@/domain/date/instant';
import type { Meta } from '@/domain/meta';

const invalid = (issue: BackupIssue): BackupValidation => ({ ok: false, issue });

/** 같은 `id` 가 두 번 나오면 뒤엣것이 앞엣것을 조용히 덮어써 로우가 사라진다. 형식 오류로 본다. */
function assertUniqueIds(rows: readonly Meta[], path: string): void {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    if (seen.has(row.id)) {
      failAt(`${path}[${index}].id`);
    }
    seen.add(row.id);
  });
}

/** 배열 하나를 원소마다 읽는다. 경로는 `todos[3]` 처럼 인덱스까지 붙는다. */
function readRows<T>(value: unknown, path: string, read: (row: unknown, at: string) => T): T[] {
  return asArray(value, path).map((row, index) => read(row, `${path}[${index}]`));
}

/**
 * 검증된 문서 조립. 여기까지 왔으면 버전 변환은 끝났고 `categories`·`todos`·`focusSessions`·
 * `settings` 는 모두 존재한다. 투두의 `categoryId` 는 **tombstone 을 포함한** 파일 안 카테고리에서
 * 찾는다 (R4) — 삭제된 카테고리를 가리키는 완료 투두가 정상 상태이기 때문이다(category R14·R17).
 *
 * `ddays`·`diaryEntries`·`routines` 는 **없어도 된다** — 필드가 **아예 없을 때만**(`=== undefined`)
 * 빈 배열로 읽는다(있다고 가정하고 `readRows(body['ddays'], …)` 로 바로 넘기지 않는다). `??` 가 아니라
 * `=== undefined` 로 판정하는 이유는 `null` 처럼 명시적으로 잘못된 값까지 "없음" 으로 묻으면 안
 * 되기 때문이다(형식 오류는 형식 오류로 거부해야 한다, R4). 이미 배포된 v3 파일(스키마 v3만 올리고
 * 이 세 배열은 아직 담지 않던 시절, ADR-0016 정정 2)에는 이 배열이 아예 없고, 그 계약은
 * `migrate-backup.ts` 의 3→3 변환 단계로는 표현할 수 없다(같은 버전 번호 안에서 모양이 갈리는
 * 문제라서) — 그래서 마이그레이션이 아니라 여기, 읽는 시점에 기본값을 준다.
 * `migrate-backup.test.ts` 의 회귀 테스트가 이 계약을 고정한다.
 */
function readDocument(body: Record<string, unknown>): BackupDocument {
  if (!isInstant(body['exportedAt'])) {
    failAt('exportedAt');
  }
  const categories = readRows(body['categories'], 'categories', readCategory);
  const todos = readRows(body['todos'], 'todos', readTodo);
  const focusSessions = readRows(body['focusSessions'], 'focusSessions', readFocusSession);
  // `=== undefined` 로만 기본값을 준다 — `??` 를 쓰면 명시적으로 들어온 `null`(형식 오류여야 할 값)
  // 까지 "없음" 으로 묻어 버린다(옛 파일 호환은 **필드가 아예 없을 때만**의 이야기다).
  const ddays = readRows(body['ddays'] === undefined ? [] : body['ddays'], 'ddays', readDday);
  const diaryEntries = readRows(
    body['diaryEntries'] === undefined ? [] : body['diaryEntries'],
    'diaryEntries',
    readDiaryEntry,
  );
  const routines = readRows(
    body['routines'] === undefined ? [] : body['routines'],
    'routines',
    readRoutine,
  );
  assertUniqueIds(categories, 'categories');
  assertUniqueIds(todos, 'todos');
  assertUniqueIds(focusSessions, 'focusSessions');
  assertUniqueIds(ddays, 'ddays');
  assertUniqueIds(diaryEntries, 'diaryEntries');
  assertUniqueIds(routines, 'routines');

  const categoryIds = new Set<string>(categories.map((category: Category) => category.id));
  todos.forEach((todo, index) => {
    if (!categoryIds.has(todo.categoryId)) {
      failAt(`todos[${index}].categoryId`);
    }
  });

  return {
    app: BACKUP_APP,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: body['exportedAt'],
    settings: readSettings(body['settings'], 'settings'),
    categories,
    todos,
    focusSessions,
    ddays,
    diaryEntries,
    routines,
  };
}

/**
 * 파싱된 값 하나를 백업 문서로 읽는다. 성공하면 **현재 버전으로 변환되고 알 수 없는 필드가 제거된**
 * 문서가 나온다(R5). 실패는 첫 오류 하나만 보고한다(R8).
 *
 * 마지막 `catch` 가 잡는 것은 던지는 getter·Proxy 처럼 **예견하지 못한** 실패다. 그런 값도 여기서
 * 값으로 바뀌어 나가므로 호출부(스토어)의 "실패하면 아무것도 쓰지 않는다" 경로가 하나로 유지된다.
 */
export function validateBackup(input: unknown): BackupValidation {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return invalid({ code: 'NOT_TASKY_FILE' });
    }
    const root = asRecord(input, 'root');
    if (root['app'] !== BACKUP_APP) {
      return invalid({ code: 'NOT_TASKY_FILE' });
    }
    const version: unknown = root['schemaVersion'];
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      return invalid({ code: 'SHAPE_INVALID', path: 'schemaVersion' });
    }
    if (version > BACKUP_SCHEMA_VERSION) {
      return invalid({ code: 'FUTURE_VERSION' });
    }
    return { ok: true, document: readDocument(migrateBackup(root, version)) };
  } catch (error) {
    if (isBackupShapeError(error)) {
      return invalid({ code: 'SHAPE_INVALID', path: error.path });
    }
    return invalid({ code: 'SHAPE_INVALID', path: 'root' });
  }
}

/**
 * 파일 본문 문자열을 백업 문서로 (R8: 파싱 실패는 "JSON 파일이 아니에요").
 * 빈 파일·잘린 JSON 이 여기서 걸린다 — `JSON.parse('')` 도 `JSON.parse('{"a":')` 도 던진다.
 */
export function parseBackup(text: string): BackupValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return invalid({ code: 'NOT_JSON' });
  }
  return validateBackup(parsed);
}
