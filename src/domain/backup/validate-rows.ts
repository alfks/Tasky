// 엔티티 한 건씩의 필드 검증 (backup.md R4). 문서 단위 검증·참조 검사는 `validate-backup.ts`.
//
// 길이·이모지·색 규칙은 **각 엔티티의 규칙 함수를 그대로 부른다**(복제 금지 — 복제하면 앱이 받는 값과
// 가져오기가 받는 값이 조용히 갈린다). 다만 정규화 결과는 버리고 **파일의 값을 그대로 저장한다**:
// 여기서 값을 바꾸면 내보내기 → 가져오기 왕복 동일성(R2)이 깨진다.
//
// 색만 예외적으로 팔레트 소속을 보지 않고 HEX 형식만 본다 — 프리셋 밖 색이 들어온 파일을 **표시**하는
// 것은 허용이고(theme R4) 사용자가 그 색을 **선택**할 수 없을 뿐이다(`setAccentColor` 가 막는다).
import {
  assertMeta,
  failAt,
  isBackupShapeError,
  META_KEYS,
  optionalInstant,
  optionalNumber,
  optionalString,
  pickFields,
  requireBoolean,
  requireDateKey,
  requireEnum,
  requireInstant,
  requireNumber,
  requireString,
} from '@/domain/backup/shape';
import type { Category } from '@/domain/category/category';
import { validateCategoryEmoji, validateCategoryName } from '@/domain/category/category.rules';
import type { FocusSession } from '@/domain/focus/focus-session';
import { normalizeHexColor } from '@/domain/theme/palette';
import { SETTINGS_ID, type Settings } from '@/domain/theme/settings';
import type { Todo } from '@/domain/todo/todo';
import { validateTodoMemo, validateTodoTitle } from '@/domain/todo/todo.rules';

const CATEGORY_KEYS = [
  ...META_KEYS,
  'name',
  'color',
  'emoji',
  'order',
  'status',
  'closedAt',
  'historyHidden',
] as const;
const TODO_KEYS = [
  ...META_KEYS,
  'categoryId',
  'date',
  'title',
  'memo',
  'done',
  'doneAt',
  'order',
  'focusSeconds',
  'routineId',
] as const;
const SESSION_KEYS = [
  ...META_KEYS,
  'todoId',
  'categoryId',
  'date',
  'plannedSeconds',
  'startedAt',
  'pausedAt',
  'pausedTotalSeconds',
  'endedAt',
  'elapsedSeconds',
  'status',
] as const;
const SETTINGS_KEYS = [...META_KEYS, 'theme', 'accentColor', 'seededAt', 'lastBackupAt'] as const;

/**
 * 도메인 규칙 함수를 검증기로 빌려 쓴다. 규칙 함수는 `DomainError` 를 던지므로 이 경로로 바꿔 준다.
 * 이미 경로가 붙은 실패(`BackupShapeError`)는 그대로 통과시켜 **첫** 오류 위치를 잃지 않는다.
 */
function guard(path: string, run: () => void): void {
  try {
    run();
  } catch (error) {
    if (isBackupShapeError(error)) {
      throw error;
    }
    failAt(path);
  }
}

/** 카테고리 한 건 (category R1·R3·R4·R7). `color` 는 HEX 형식만 본다(위 파일 주석). */
export function readCategory(value: unknown, path: string): Category {
  const row = pickFields(value, CATEGORY_KEYS, path);
  const entity = row as unknown as Category;
  assertMeta(entity, path);

  const name = requireString(row, 'name', path);
  guard(`${path}.name`, () => void validateCategoryName(name, []));
  const color = requireString(row, 'color', path);
  if (normalizeHexColor(color) === undefined) {
    failAt(`${path}.color`);
  }
  const emoji = optionalString(row, 'emoji', path);
  guard(`${path}.emoji`, () => void validateCategoryEmoji(emoji));
  requireNumber(row, 'order', path);
  requireEnum(row, 'status', path, ['active', 'completed', 'paused'] as const);
  optionalInstant(row, 'closedAt', path);
  return entity;
}

/**
 * 투두 한 건 (todo R1·R2·R5). `categoryId` 의 참조 검사는 문서 단위(`validate-backup.ts`)에서 한다.
 * `routineId`(routine.md §4)는 **형식만** 본다 — 그 루틴이 실제로 있는지는 검사하지 않는다(다른
 * 필드 없는 참조와 같은 결로, R10 삭제 뒤에도 인스턴스의 `routineId` 는 남는 것이 계약이다).
 */
export function readTodo(value: unknown, path: string): Todo {
  const row = pickFields(value, TODO_KEYS, path);
  const entity = row as unknown as Todo;
  assertMeta(entity, path);

  requireString(row, 'categoryId', path);
  requireDateKey(row, 'date', path);
  const title = requireString(row, 'title', path);
  guard(`${path}.title`, () => void validateTodoTitle(title));
  const memo = optionalString(row, 'memo', path);
  guard(`${path}.memo`, () => void validateTodoMemo(memo));
  requireBoolean(row, 'done', path);
  optionalInstant(row, 'doneAt', path);
  requireNumber(row, 'order', path);
  optionalNumber(row, 'focusSeconds', path, { min: 0 });
  optionalString(row, 'routineId', path);
  return entity;
}

/**
 * 집중 세션 한 건 (timer §4). `todoId` 는 **없어도 된다**(R4) — 있으면 형식만 보고 참조는 확인하지
 * 않는다. 참조를 강제하면 삭제된 투두를 가리키는 세션이 있는 파일을 통째로 거부하게 되고(R2 는 삭제된
 * 투두를 내보내지 않는다) 자기 자신이 만든 파일을 되돌려받지 못한다.
 */
export function readFocusSession(value: unknown, path: string): FocusSession {
  const row = pickFields(value, SESSION_KEYS, path);
  const entity = row as unknown as FocusSession;
  assertMeta(entity, path);

  optionalString(row, 'todoId', path);
  optionalString(row, 'categoryId', path);
  requireDateKey(row, 'date', path);
  requireNumber(row, 'plannedSeconds', path, { integer: true, min: 1 });
  requireInstant(row, 'startedAt', path);
  optionalInstant(row, 'pausedAt', path);
  requireNumber(row, 'pausedTotalSeconds', path, { min: 0 });
  optionalInstant(row, 'endedAt', path);
  requireNumber(row, 'elapsedSeconds', path, { min: 0 });
  requireEnum(row, 'status', path, ['running', 'paused', 'completed', 'canceled'] as const);
  return entity;
}

/** 설정 한 행 (theme R3·R6). `id` 는 항상 고정값이라 다른 값이면 거부한다 (ADR-0005 규칙 1). */
export function readSettings(value: unknown, path: string): Settings {
  const row = pickFields(value, SETTINGS_KEYS, path);
  const entity = row as unknown as Settings;
  assertMeta(entity, path);

  if (row['id'] !== SETTINGS_ID) {
    failAt(`${path}.id`);
  }
  requireEnum(row, 'theme', path, ['light', 'dark', 'system'] as const);
  const accentColor = requireString(row, 'accentColor', path);
  if (normalizeHexColor(accentColor) === undefined) {
    failAt(`${path}.accentColor`);
  }
  optionalInstant(row, 'seededAt', path);
  optionalInstant(row, 'lastBackupAt', path);
  return entity;
}
