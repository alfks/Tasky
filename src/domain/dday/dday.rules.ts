// D-day 검증·생성·삭제·되돌리기·표기·정렬 (calendar.md R1~R3).
import { isValidDateKey } from '@/domain/date/civil';
import type { DateKey } from '@/domain/date/date-key';
import type { Dday } from '@/domain/dday/dday';
import { DomainError } from '@/domain/errors';
import {
  createMeta,
  isTombstone,
  markDeleted,
  touch,
  type MetaDeps,
  type Persistable,
} from '@/domain/meta';

/** 제목 최대 길이 (calendar R1). */
export const DDAY_TITLE_MAX_LENGTH = 30;
/** 삭제되지 않은 D-day 의 최대 개수 (calendar R1). */
export const DDAY_MAX_COUNT = 50;

let segmenter: Intl.Segmenter | undefined;

/** 사람이 세는 "한 글자"(grapheme) 수 — category.rules.ts 의 같은 이름 함수와 같은 계산(이모지 ZWJ 를 1로 센다). */
function graphemeCount(value: string): number {
  if (typeof Intl === 'undefined' || !('Segmenter' in Intl)) {
    return [...value].length;
  }
  segmenter ??= new Intl.Segmenter('ko', { granularity: 'grapheme' });
  return [...segmenter.segment(value)].length;
}

/** 줄바꿈을 공백으로 바꾸고 앞뒤 공백을 제거한다 (calendar R1, category.rules.ts#normalizeCategoryName 과 같은 규칙). */
export function normalizeDdayTitle(raw: string): string {
  return raw.replace(/[\r\n\u2028\u2029]+/gu, ' ').trim();
}

/** 삭제되지 않은 D-day만 — 개수 제한(R1)의 모집단이다. */
function livingDdays(ddays: readonly Dday[]): Dday[] {
  return ddays.filter((dday) => !isTombstone(dday));
}

/** 정규화한 제목을 돌려주고 규칙 위반이면 던진다 (calendar R1). */
export function validateDdayTitle(raw: string): string {
  const title = normalizeDdayTitle(raw);
  if (title.length === 0) {
    throw new DomainError('DDAY_TITLE_REQUIRED');
  }
  if (graphemeCount(title) > DDAY_TITLE_MAX_LENGTH) {
    throw new DomainError('DDAY_TITLE_TOO_LONG', String(graphemeCount(title)));
  }
  return title;
}

/** 날짜 형식·실존 여부를 검사한다. 과거·미래 모두 허용한다 (calendar R1). */
export function validateDdayDate(raw: string): DateKey {
  if (!isValidDateKey(raw)) {
    throw new DomainError('DDAY_DATE_INVALID', raw);
  }
  return raw;
}

/** 개수 제한 확인 (calendar R1). 생성 직전에 부른다. */
export function assertDdayCapacity(existing: readonly Dday[]): void {
  if (livingDdays(existing).length >= DDAY_MAX_COUNT) {
    throw new DomainError('DDAY_LIMIT_EXCEEDED');
  }
}

/** 새 D-day (calendar R1). 검증 순서: 제목 → 날짜 → 개수 제한. */
export function createDday(
  input: { title: string; date: string },
  existing: readonly Dday[],
  deps: MetaDeps,
): Persistable<Dday> {
  const title = validateDdayTitle(input.title);
  const date = validateDdayDate(input.date);
  assertDdayCapacity(existing);
  return createMeta<Dday>(deps, { title, date });
}

/** 소프트 삭제 (calendar R5). 물리 삭제는 없다(todo.md R13 과 같은 메커니즘). */
export function deleteDday(dday: Dday, deps: MetaDeps): Persistable<Dday> {
  return markDeleted(dday, deps.now());
}

/**
 * 삭제 되돌리기 (calendar R5). `before` 는 **삭제 직전 값**(deletedAt 없음)이고 `deletedAt` 은
 * `deleteDday` 가 그 삭제에 찍은 시각이다 — 두 번 touch 하는 것은 category/removal.ts#rewind 와
 * 같은 이유다: 한 번만 touch 하면 되돌린 값의 rev 가 방금 쓴 툼스톤의 rev 와 같아져 버린다
 * (둘 다 `before.rev + 1`). 두 번 touch 해 `before.rev + 2` 로 만들어야 되돌리기 쓰기가 툼스톤을
 * 확실히 덮어쓴다.
 */
export function restoreDday(before: Dday, deletedAt: string, deps: MetaDeps): Persistable<Dday> {
  return touch(touch(before, deletedAt), deps.now());
}

/** 로컬 자정 기준 epoch 일수. DST 가 없는 UTC 산술로 계산해 달·연 경계에서도 안전하다. */
function epochDayOf(date: DateKey): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** `date` 가 `today` 로부터 며칠 뒤인지. 양수는 미래, 0은 오늘, 음수는 과거 (calendar R3). */
export function ddayOffset(date: DateKey, today: DateKey): number {
  return epochDayOf(date) - epochDayOf(today);
}

/** D-n 표기 (calendar R3): 오늘 `D-day`, 미래 `D-n`, 과거 `D+n`. */
export function formatDday(offset: number): string {
  if (offset === 0) return 'D-day';
  return offset > 0 ? `D-${offset}` : `D+${-offset}`;
}

/** 동률 타이브레이크: 날짜가 같으면 만든 순서, 그마저 같으면 id — 두 저장소 구현이 갈리지 않는다. */
function tieBreak(a: Dday, b: Dday): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * 임박순으로 가른다 (calendar R2). `list()` 는 전량을 주고(spec §4) 정렬은 여기서 메모리로 한다.
 * `upcoming`: 오늘 포함 미래, D-day 오름차순(가까운 순). `past`: 지난 항목, 최근순(날짜 내림차순).
 */
export function sortDdays(
  ddays: readonly Dday[],
  today: DateKey,
): { upcoming: Dday[]; past: Dday[] } {
  const alive = livingDdays(ddays);
  const upcoming = alive
    .filter((dday) => dday.date >= today)
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : tieBreak(a, b)));
  const past = alive
    .filter((dday) => dday.date < today)
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : tieBreak(a, b)));
  return { upcoming, past };
}
