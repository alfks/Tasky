// 파일에서 온 값의 **형식 검사기** (backup.md R4·R8). 앱 밖에서 들어온 `unknown` 을 다루는 유일한 층이다.
//
// 두 가지 원칙이 이 파일의 모양을 정한다:
//
// 1. **값을 만들지 않고 복사만 한다.** `pickFields` 는 키 목록대로 한 번씩 읽어 담을 뿐이라
//    `createdAt`·`updatedAt`·`rev`·`deletedAt` 에 새 값이 들어갈 자리가 없다. 객체 리터럴의 Meta 키를
//    금지하는 규칙(ADR-0007 규칙 3)이 막으려는 것은 **시각·rev 의 위조**인데, 여기서는 파일의 값을 그대로
//    옮기는 것이 오히려 요구사항이다(ADR-0009 결정 3: `adopt` 는 시각·`rev` 를 찍지 않는다). 브랜드는
//    여전히 `adopt()` 만 붙인다 — 이 파일은 `assertMeta` 로 **검증에만** 쓰고 반환값을 버린다.
// 2. **키마다 정확히 한 번만 읽는다.** 던지는 getter·값이 바뀌는 Proxy 가 섞이면 "검증한 값" 과 "저장할 값"
//    이 갈릴 수 있다. `pickFields` 가 먼저 스냅샷을 뜨고, 이후 검증·조립은 전부 그 스냅샷만 본다.
//
// 에러에는 **구조 경로만** 싣는다(`todos[12].title`). 값을 실으면 제목·메모가 로그로 샌다.
import { fromEpochMs, isInstant, toEpochMs } from '@/domain/date/instant';
import { isDomainError } from '@/domain/errors';
import { adopt, type Meta } from '@/domain/meta';

/**
 * 형식 검증 실패. `path` 는 고정 필드명과 배열 인덱스로만 조립되므로 입력 문자열이 섞이지 않는다.
 * 클래스를 쓰는 것은 `@/domain/errors` 와 같은 판단이다(엔티티가 아니라 에러 타입).
 */
export class BackupShapeError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`백업 파일의 ${path} 형식이 올바르지 않습니다`);
    this.name = 'BackupShapeError';
    this.path = path;
  }
}

/** 던져진 값이 형식 검증 실패인지. */
export function isBackupShapeError(value: unknown): value is BackupShapeError {
  return value instanceof BackupShapeError;
}

/** 첫 오류 위치에서 즉시 중단한다 (R8: 첫 오류 경로만 보여준다). */
export function failAt(path: string): never {
  throw new BackupShapeError(path);
}

/** 객체(배열·null 제외)인지. */
export function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    failAt(path);
  }
  return value as Record<string, unknown>;
}

/** 배열인지. */
export function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    failAt(path);
  }
  return value;
}

/**
 * `keys` 를 **한 번씩만** 읽어 새 객체에 담는다. 목록에 없는 필드는 여기서 사라진다(R5: 알 수 없는
 * 필드는 무시하고 보존하지 않는다). `undefined` 인 키는 담지 않아 선택 필드의 부재가 유지된다.
 */
export function pickFields(
  value: unknown,
  keys: readonly string[],
  path: string,
): Record<string, unknown> {
  const source = asRecord(value, path);
  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    const field: unknown = source[key];
    if (field !== undefined) {
      picked[key] = field;
    }
  }
  return picked;
}

const at = (path: string, key: string): string => `${path}.${key}`;

/** 필수 문자열(빈 문자열 불가). */
export function requireString(row: Record<string, unknown>, key: string, path: string): string {
  const value: unknown = row[key];
  if (typeof value !== 'string' || value.length === 0) {
    failAt(at(path, key));
  }
  return value;
}

/** 있으면 문자열(빈 문자열 불가), 없으면 `undefined`. */
export function optionalString(
  row: Record<string, unknown>,
  key: string,
  path: string,
): string | undefined {
  if (row[key] === undefined) {
    return undefined;
  }
  return requireString(row, key, path);
}

/** 필수 ISO UTC 시각. */
export function requireInstant(row: Record<string, unknown>, key: string, path: string): string {
  const value: unknown = row[key];
  if (!isInstant(value)) {
    failAt(at(path, key));
  }
  return value;
}

/** 있으면 ISO UTC 시각. */
export function optionalInstant(row: Record<string, unknown>, key: string, path: string): void {
  if (row[key] !== undefined) {
    requireInstant(row, key, path);
  }
}

/** 필수 불리언. */
export function requireBoolean(row: Record<string, unknown>, key: string, path: string): boolean {
  const value: unknown = row[key];
  if (typeof value !== 'boolean') {
    failAt(at(path, key));
  }
  return value;
}

/** 필수 유한 수. `integer`·`min` 으로 범위를 좁힌다. */
export function requireNumber(
  row: Record<string, unknown>,
  key: string,
  path: string,
  options: { integer?: boolean; min?: number } = {},
): number {
  const value: unknown = row[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    failAt(at(path, key));
  }
  if (options.integer === true && !Number.isInteger(value)) {
    failAt(at(path, key));
  }
  if (options.min !== undefined && value < options.min) {
    failAt(at(path, key));
  }
  return value;
}

/** 있으면 유한 수. */
export function optionalNumber(
  row: Record<string, unknown>,
  key: string,
  path: string,
  options: { integer?: boolean; min?: number } = {},
): void {
  if (row[key] !== undefined) {
    requireNumber(row, key, path, options);
  }
}

/** 열거값 중 하나. */
export function requireEnum<T extends string>(
  row: Record<string, unknown>,
  key: string,
  path: string,
  allowed: readonly T[],
): T {
  const value: unknown = row[key];
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    failAt(at(path, key));
  }
  return value as T;
}

const DATE_KEY_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 실존하는 날짜를 가리키는 `YYYY-MM-DD` 인지. `lib/date.ts#isDateKey` 와 같은 판정을 하지만
 * 도메인은 `@/lib/date` 를 import 할 수 없으므로(ARCHITECTURE §1 파일 단위 예외) 달력 계산은
 * `date/instant.ts` 의 순수 변환에 위임한다 — 윤년·월별 일수 규칙을 여기서 다시 쓰지 않는다.
 */
export function requireDateKey(row: Record<string, unknown>, key: string, path: string): string {
  const value: unknown = row[key];
  if (typeof value !== 'string' || !DATE_KEY_FORMAT.test(value)) {
    failAt(at(path, key));
  }
  try {
    if (!fromEpochMs(toEpochMs(`${value}T00:00:00.000Z`)).startsWith(value)) {
      failAt(at(path, key));
    }
  } catch (error) {
    if (isBackupShapeError(error)) {
      throw error;
    }
    failAt(at(path, key));
  }
  return value;
}

/** `Meta` 공통 필드 이름. `pickFields` 의 키 목록이 이 배열로 시작한다. */
export const META_KEYS = ['id', 'createdAt', 'updatedAt', 'rev', 'deletedAt'] as const;

/**
 * `Meta` 형식을 `adopt()` 로 검증한다 — 규칙의 단일 소스는 `meta.ts` 이고 여기서 다시 쓰지 않는다
 * (UUID 형식·시각 형식·`rev` 양의 정수). **반환값(브랜드)은 버린다**: 이 파일은 검증만 하고,
 * 실제로 브랜드를 붙이는 것은 저장 직전의 `plan-import.ts` 다.
 *
 * `DomainError.detail` 은 `id=…` 처럼 **필드명=값** 이라 값 부분을 버리고 앞의 필드명만 경로에 붙인다.
 */
export function assertMeta(entity: Meta, path: string): void {
  try {
    adopt(entity);
  } catch (error) {
    if (!isDomainError(error)) {
      throw error;
    }
    const field = error.detail?.split('=')[0] ?? '';
    failAt((META_KEYS as readonly string[]).includes(field) ? at(path, field) : path);
  }
}
