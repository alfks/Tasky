// 엔티티 한 건씩의 필드 검증 (backup.md R4). 문서 단위 검증·참조 검사는 `validate-backup.ts`.
//
// 길이·이모지·색 규칙은 **각 엔티티의 규칙 함수를 그대로 부른다**(복제 금지 — 복제하면 앱이 받는 값과
// 가져오기가 받는 값이 조용히 갈린다). 다만 정규화 결과는 버리고 **파일의 값을 그대로 저장한다**:
// 여기서 값을 바꾸면 내보내기 → 가져오기 왕복 동일성(R2)이 깨진다.
//
// 색만 예외적으로 팔레트 소속을 보지 않고 HEX 형식만 본다 — 프리셋 밖 색이 들어온 파일을 **표시**하는
// 것은 허용이고(theme R4) 사용자가 그 색을 **선택**할 수 없을 뿐이다(`setAccentColor` 가 막는다).
import {
  asArray,
  assertMeta,
  failAt,
  isBackupShapeError,
  META_KEYS,
  optionalBoolean,
  optionalDateKey,
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
import type { Dday } from '@/domain/dday/dday';
import { validateDdayTitle } from '@/domain/dday/dday.rules';
import type { DiaryEntry } from '@/domain/diary/diary-entry';
import { validateDiaryContent, validateMoodEmoji } from '@/domain/diary/diary.rules';
import type { FocusSession } from '@/domain/focus/focus-session';
import type { Routine } from '@/domain/routine/routine';
import { normalizeHexColor } from '@/domain/theme/palette';
import { SETTINGS_ID, type Settings } from '@/domain/theme/settings';
import { validateRecurrence, type RoutineRecurrence } from '@/domain/todo/routine.rules';
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
const DDAY_KEYS = whitelist<Dday>()([...META_KEYS, 'title', 'date']);
const DIARY_KEYS = whitelist<DiaryEntry>()([...META_KEYS, 'date', 'emoji', 'content']);
/**
 * **`materializedThrough`(루틴 워터마크, ADR-0017)를 넣는다 — 뺀 게 아니라 고른 것이다.**
 * (리뷰 #108 Major 1 로 아래 근거를 고쳤다 — 원래 문장 중 "구간 전체를 다시 훑어 중복", "유일하게
 * 안전한 선택" 둘 다 실측과 달라 내렸다.)
 *
 * 뺐을 때 복원 뒤 이 필드가 무엇이 될지부터 본다: `Routine` 타입이 이 필드를 필수로 요구하므로
 * (routine.ts) 어떤 값이든 채워야 `restore()` 가 쓸 `Persistable<Routine>` 이 만들어진다. 후보는
 * 둘뿐이다 — ① `startDate` 전날(생성 시 기본값, `createRoutine`)로 되돌리기, ② 파일의 `todos` 에서
 * 그 `routineId` 를 가진 가장 늦은 날짜로 역산하기. **둘 다 위험을 만든다**:
 * - ①은 그 구간을 지연 생성(`planRoutineFill`)이 다시 훑지만, **구간 전체가 중복되는 것은 아니다**
 *   — 그 함수는 (날짜·카테고리·정규화 제목)으로 **살아 있는 기존 투두와 대조해 건너뛴다**
 *   (`routine-fill.ts:53-59`, 실측: 손대지 않은 인스턴스는 재방문해도 생성 0건). 실제로 새로
 *   생기는 것은 그 사이 **제목을 고쳤거나 다른 날짜로 옮긴** 인스턴스(대조 키가 안 맞아 "없다"로
 *   보인다)와, **지운** 인스턴스의 부활(대조 대상 자체가 없다)뿐이다.
 * - ②는 `export-backup.ts` 가 **툼스톤 투두를 내보내지 않으므로**(R2, `todos` 는 항상 살아있는
 *   것만) 삭제된 인스턴스가 있는 날짜만큼 워터마크가 실제보다 뒤로 밀리고, 그 구간은 지연 생성이
 *   다시 방문해 **사용자가 지운 인스턴스를 부활**시킨다(routine.md R9 "그 뒤는 완전히 독립" 을
 *   깬다).
 *
 * 둘 다 "복원했더니 지운 인스턴스가 되살아난다" 는 사용자 관점의 데이터 손상이라 제외하는 쪽이
 * 더 위험하다고 판단했다.
 *
 * **넣었을 때도 위험이 없는 것은 아니다.** ADR-0017 "감수하는 점"이 경고하는 "루틴 레코드와 투두가
 * **따로** 병합되면 워터마크가 앞선 채 투두가 유실될 수 있다"는 위험은, 교체(R7)에서는 성립하지
 * 않지만(파일 하나가 전량을 갈아치우므로 항상 같이 간다) **병합(R6)에서는 여전히 성립한다** —
 * `plan-import.ts#planMergeRoutines` 가 병합에서만 워터마크를 "두 값 중 더 늦은 값" 으로 고정해
 * 두지만, 이것은 위험을 **없앤 것이 아니라 중복·부활(눈에 보이고 국지적) 쪽을 골라 영구 공백(안
 * 보이고 전역적) 쪽을 피한 것**이다 — 중지→재개(`resumeRoutine`)처럼 인스턴스 없이 워터마크만
 * 점프하는 경로가 있어서 "합집합에 그 구간 몫이 이미 있다"는 가정이 항상 성립하지는 않는다
 * (`plan-import.ts#planMergeRoutines` 문서, `plan-import.test.ts` "반례(S5)" 가 실제로 재현한다).
 * 그래도 넣는 쪽을 고른 이유: 뺐을 때의 두 대안(위 ①·②)은 병합이 아니라 **모든 복원**에서
 * 매번 지운 인스턴스를 부활시키는 확정된 손상인 반면, 워터마크를 실었을 때의 영구 공백은 "병합 +
 * 두 기기가 실제로 갈라져 있었다" 는 조건이 겹쳐야만 나는 조건부 위험이다.
 */
const ROUTINE_KEYS = whitelist<Routine>()([
  ...META_KEYS,
  'title',
  'memo',
  'categoryId',
  'recurrence',
  'startDate',
  'endDate',
  'active',
  'materializedThrough',
]);

/** `recurrence.daysOfWeek`/`daysOfMonth` — 숫자 배열인지만 본다(범위는 `validateRecurrence` 가 본다). */
function asNumberArray(value: unknown, path: string): number[] {
  const raw = asArray(value, path);
  if (!raw.every((item): item is number => typeof item === 'number' && Number.isFinite(item))) {
    failAt(path);
  }
  return raw;
}

/** `Routine.recurrence` (routine.md §4). `type` 이 무엇이냐에 따라 필요한 배열이 갈린다. */
function readRecurrence(value: unknown, path: string): RoutineRecurrence {
  const row = pickFields(value, ['type', 'daysOfWeek', 'daysOfMonth'], path);
  let recurrence: RoutineRecurrence;
  if (row['type'] === 'weekly') {
    recurrence = {
      type: 'weekly',
      daysOfWeek: asNumberArray(row['daysOfWeek'], `${path}.daysOfWeek`),
    };
  } else if (row['type'] === 'monthly') {
    recurrence = {
      type: 'monthly',
      daysOfMonth: asNumberArray(row['daysOfMonth'], `${path}.daysOfMonth`),
    };
  } else {
    return failAt(`${path}.type`);
  }
  guard(path, () => void validateRecurrence(recurrence));
  return recurrence;
}

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

/** D-day 한 건 (calendar R1). */
export function readDday(value: unknown, path: string): Dday {
  const row = pickFields(value, DDAY_KEYS, path);
  const entity = row as unknown as Dday;
  assertMeta(entity, path);

  const title = requireString(row, 'title', path);
  guard(`${path}.title`, () => void validateDdayTitle(title));
  requireDateKey(row, 'date', path);
  return entity;
}

/**
 * 다이어리 한 건 (diary R1~R3). `content` 는 **빈 문자열이 정상**이다(이모지만 있는 기록) —
 * `requireString` 에 `allowEmpty: true` 를 준다(diary R3).
 */
export function readDiaryEntry(value: unknown, path: string): DiaryEntry {
  const row = pickFields(value, DIARY_KEYS, path);
  const entity = row as unknown as DiaryEntry;
  assertMeta(entity, path);

  requireDateKey(row, 'date', path);
  const emoji = optionalString(row, 'emoji', path);
  guard(`${path}.emoji`, () => void validateMoodEmoji(emoji));
  const content = requireString(row, 'content', path, { allowEmpty: true });
  guard(`${path}.content`, () => void validateDiaryContent(content));
  return entity;
}

/**
 * 무기한 루틴 한 건 (routine.md §4, ADR-0017). `categoryId` 는 **형식만** 본다 — 삭제된 카테고리를
 * 계속 가리키는 것이 정상 상태다(routine.md, `routine.ts` 필드 주석). `materializedThrough` 를
 * 싣는 이유는 `ROUTINE_KEYS` 주석을 본다.
 */
export function readRoutine(value: unknown, path: string): Routine {
  const row = pickFields(value, ROUTINE_KEYS, path);
  const entity = row as unknown as Routine;
  assertMeta(entity, path);

  const title = requireString(row, 'title', path);
  guard(`${path}.title`, () => void validateTodoTitle(title));
  const memo = optionalString(row, 'memo', path);
  guard(`${path}.memo`, () => void validateTodoMemo(memo));
  requireString(row, 'categoryId', path);
  readRecurrence(row['recurrence'], `${path}.recurrence`);
  requireDateKey(row, 'startDate', path);
  optionalDateKey(row, 'endDate', path);
  requireBoolean(row, 'active', path);
  requireDateKey(row, 'materializedThrough', path);
  return entity;
}
