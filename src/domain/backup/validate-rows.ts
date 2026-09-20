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
  optionalBoolean,
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

/**
 * 화이트리스트 전수 대조 헬퍼. `focus-session-repository.contract.ts` 의
 * `satisfies Record<ReadName, ReadCall>` 과 같은 목적이다 — 배열이 `T` 의 키를 전부 담았는지 컴파일
 * 타임에 확인해서, 엔티티 타입에 필드를 더하고 여기 안 더하면(반대로 화이트리스트에서 지워도) 호출부가
 * **컴파일 에러**로 빨개진다. `Exclude<keyof T, K[number]>` 가 비어 있지 않으면(뭔가 빠졌으면)
 * 파라미터 타입이 `never` 가 되어 실제 배열과 맞지 않는다. category R22 회귀(`historyHidden` 누락)의
 * 근인이 배열이 이 검사 없이 그냥 "값" 이었던 것이다.
 *
 * **`Record<keyof T, true>` 객체로 만들지 않는다.** `Meta` 의 `id`·`createdAt`·`updatedAt`·`rev`·
 * `deletedAt` 을 객체 리터럴의 *프로퍼티 키*로 쓰는 순간 ADR-0007 `NO_META_WRITE` 린트에 걸린다 —
 * 여기서는 실제 갱신이 아니라 필드 *이름* 나열인데도 그 규칙은 구문만 본다(리뷰 라운드 2 실측: 객체
 * 버전은 `pnpm lint` 4건 실패). 배열 *원소*는 그 규칙 밖이다 — `shape.ts` 의 `META_KEYS` 자체도 같은
 * 이유로 배열이고, 여기서도 그 배열을 그대로 spread 해 쓴다(단일 소스).
 *
 * **제외는 명시적으로만.** 백업에 실으면 안 되는 파생·내부 상태(캐시 값, Phase 2 의 동기화 워터마크
 * 등)가 생기면 `T` 대신 `Omit<T, '그필드'>` 를 타입 인자로 써서 **의도적으로** 뺀다. 아무 표시도 없이
 * 필드가 빠지면, 다음 사람이 "빠뜨린 줄" 알고 반사적으로 채워 넣어 그 필드가 백업에 실려서는 안 되는
 * 이유(왜 값으로 판정하는 상태를 복원 시점에 되살리면 위험한지)가 함께 사라진다.
 */
function whitelist<T>() {
  return function <const K extends readonly (keyof T)[]>(
    keys: Exclude<keyof T, K[number]> extends never ? K : never,
  ): K {
    return keys as K;
  };
}

const CATEGORY_KEYS = whitelist<Category>()([
  ...META_KEYS,
  'name',
  'color',
  'emoji',
  'order',
  'status',
  'closedAt',
  'historyHidden',
]);
const TODO_KEYS = whitelist<Todo>()([
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
]);
const SESSION_KEYS = whitelist<FocusSession>()([
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
]);
const SETTINGS_KEYS = whitelist<Settings>()([
  ...META_KEYS,
  'theme',
  'accentColor',
  'seededAt',
  'lastBackupAt',
]);

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
  optionalBoolean(row, 'historyHidden', path);
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
