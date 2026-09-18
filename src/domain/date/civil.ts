// `DateKey`('YYYY-MM-DD') 전용 그레고리력 산술 — 루틴 반복(매주 n요일·매달 n일, todo R21) 계산의 기반.
// `instant.ts` 와 달리 시:분:초가 없는 "그 날짜"만 다룬다. 알고리즘은 같은 Howard Hinnant 의
// days_from_civil/civil_from_days(그레고리력, 윤년 정확, 타임존 없음)이며, 여기서는 **날짜만** 다루므로
// (instant.ts 는 시:분:초까지의 ms 계산기라 공개 API 가 다르다) 작게 다시 둔다 — 둘 다 전부 사기 좁고
// 스스로 검증하는 파일이라 공유로 인한 결합보다 중복의 대가가 더 싸다.
import type { DateKey } from '@/domain/date/date-key';

const DATE_KEY_FORMAT = /^(\d{4})-(\d{2})-(\d{2})$/;

type Civil = { year: number; month: number; day: number };

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/** 그레고리력 (y, m, d) → 1970-01-01 부터의 일수. */
function daysFromCivil({ year, month, day }: Civil): number {
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
}

/** 1970-01-01 부터의 일수 → 그레고리력 (y, m, d). */
function civilFromDays(days: number): Civil {
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

const pad2 = (n: number): string => String(n).padStart(2, '0');

function format({ year, month, day }: Civil): DateKey {
  return `${year}-${pad2(month)}-${pad2(day)}` as DateKey;
}

/** 형식(0 채움 4-2-2)에 맞고 실존하는 날짜인지(2/30, 13월 등은 거부). */
export function isValidDateKey(value: unknown): value is DateKey {
  if (typeof value !== 'string') {
    return false;
  }
  const parts = DATE_KEY_FORMAT.exec(value);
  if (parts === null) {
    return false;
  }
  const [, y, mo, d] = parts.map(Number);
  if (mo < 1 || mo > 12 || d < 1) {
    return false;
  }
  return d <= daysInMonth(y, mo);
}

/** `key` 에서 1970-01-01 기준 그레고리력 컴포넌트를 뽑는다. 유효성은 호출부가 `isValidDateKey` 로 미리 본다. */
function parse(key: DateKey): Civil {
  const parts = DATE_KEY_FORMAT.exec(key);
  if (parts === null) {
    throw new RangeError(`유효하지 않은 DateKey 입니다: ${JSON.stringify(key)}`);
  }
  const [, year, month, day] = parts.map(Number);
  return { year, month, day };
}

/** 요일. 0(일)~6(토) — 1970-01-01(일수 0)은 목요일이라 오프셋은 +4. */
export function dayOfWeekOf(key: DateKey): number {
  const days = daysFromCivil(parse(key));
  return ((days % 7) + 11) % 7;
}

/** 그 달의 일(1~31). 형식 파싱만으로 충분해 civil 산술이 필요 없다. */
export function dayOfMonthOf(key: DateKey): number {
  return parse(key).day;
}

/** `key` 에서 `days` 일 뒤(음수면 그만큼 전)의 `DateKey`. 월·연 경계·윤년을 전부 올바르게 넘는다. */
export function addCivilDays(key: DateKey, days: number): DateKey {
  if (!Number.isInteger(days)) {
    throw new RangeError(`addCivilDays 의 days 는 정수여야 합니다: ${days}`);
  }
  return format(civilFromDays(daysFromCivil(parse(key)) + days));
}
