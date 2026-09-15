// ISO 8601 UTC 시각 문자열(`Date#toISOString()` 형식)을 다루는 순수 계산기 — 도메인의 시각 산술은 전부 여기로 모인다.
//
// `Date` 를 쓰지 않는 이유: 도메인은 `new Date()`·`Date.now()` 를 부를 수 없고(ADR-0005 규칙 2, 린트),
// `new Date(ms).toISOString()` 같은 "순수한" 용법도 같은 셀렉터에 걸린다. 타이머(timer.md R3·R4)는
// `startedAt + plannedSeconds` 같은 시각 산술이 필요하므로, 그 계산을 Date 없이 하는 변환을 여기서 제공한다.
// 알고리즘은 Howard Hinnant 의 days_from_civil / civil_from_days(그레고리력, 윤년·윤일 정확, 윤초 없음)다.
import { DomainError } from '@/domain/errors';

/** `Date#toISOString()` 이 내보내는 유일한 형식(ms 정밀도, UTC). ADR-0005 규칙 3. */
export const INSTANT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;

const MS_PER_DAY = 86_400_000;

/** `value` 가 ISO 8601 UTC 시각 문자열이고 실존하는 날짜·시각인지. */
export function isInstant(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const parts = INSTANT_PATTERN.exec(value);
  if (parts === null) {
    return false;
  }
  const [, y, mo, d, h, mi, s] = parts.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) {
    return false;
  }
  return d <= daysInMonth(y, mo);
}

/** 윤년 규칙(그레고리력). */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 그 해 그 달의 일수. */
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/** 그레고리력 (y, m, d) → 1970-01-01 부터의 일수 (Hinnant days_from_civil). */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
}

/** 1970-01-01 부터의 일수 → 그레고리력 (y, m, d) (Hinnant civil_from_days). */
function civilFromDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

/** ISO UTC 문자열 → epoch 밀리초. 형식이 아니면 `DomainError('INSTANT_FORMAT_INVALID')`. */
export function toEpochMs(instant: string): number {
  const parts = INSTANT_PATTERN.exec(instant);
  if (parts === null || !isInstant(instant)) {
    throw new DomainError('INSTANT_FORMAT_INVALID', instant);
  }
  const [, y, mo, d, h, mi, s, ms] = parts.map(Number);
  return daysFromCivil(y, mo, d) * MS_PER_DAY + h * 3_600_000 + mi * 60_000 + s * 1_000 + ms;
}

/** epoch 밀리초 → ISO UTC 문자열(`toISOString()` 과 같은 형식). */
export function fromEpochMs(epochMs: number): string {
  if (!Number.isFinite(epochMs)) {
    throw new DomainError('INSTANT_FORMAT_INVALID', String(epochMs));
  }
  const ms = Math.round(epochMs);
  const days = Math.floor(ms / MS_PER_DAY);
  const rest = ms - days * MS_PER_DAY;
  const { year, month, day } = civilFromDays(days);
  const h = Math.floor(rest / 3_600_000);
  const mi = Math.floor((rest % 3_600_000) / 60_000);
  const s = Math.floor((rest % 60_000) / 1_000);
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}T${pad(h, 2)}:${pad(mi, 2)}:${pad(s, 2)}.${pad(rest % 1_000, 3)}Z`;
}

/** `instant` 에서 `seconds` 초 뒤(음수면 그만큼 전)의 ISO UTC 문자열. */
export function addSeconds(instant: string, seconds: number): string {
  return fromEpochMs(toEpochMs(instant) + Math.round(seconds * 1_000));
}

/** `to - from` 을 초로(소수점 버림 없이 실수). 순서·경과 계산의 공통 진입점. */
export function diffSeconds(from: string, to: string): number {
  return (toEpochMs(to) - toEpochMs(from)) / 1_000;
}
