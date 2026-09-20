// 다이어리 검증·생성·수정·삭제·되돌리기·정렬 (diary.md R1~R4).
import type { DateKey } from '@/domain/date/date-key';
import type { DiaryEntry } from '@/domain/diary/diary-entry';
import { MOOD_EMOJIS } from '@/domain/diary/mood-emoji';
import { DomainError } from '@/domain/errors';
import { createMeta, markDeleted, touch, type MetaDeps, type Persistable } from '@/domain/meta';

/** 본문 최대 길이 (diary R2). */
export const DIARY_CONTENT_MAX_LENGTH = 500;

/** 앞뒤 공백을 제거한다. 공백만 있던 값은 빈 문자열이 되어 "기록 없음"으로 취급된다 (diary R2). */
export function normalizeDiaryContent(raw: string): string {
  return raw.trim();
}

/** 정규화한 본문을 돌려주고 500자를 넘으면 던진다 (diary R2). */
export function validateDiaryContent(raw: string): string {
  const content = normalizeDiaryContent(raw);
  if (content.length > DIARY_CONTENT_MAX_LENGTH) {
    throw new DomainError('DIARY_CONTENT_TOO_LONG', String(content.length));
  }
  return content;
}

/**
 * 기분 이모지 검증 (diary R3). `''`·`undefined`는 "없음"이라 `undefined`를 돌려준다(필드 자체를
 * 없앤다 — `Category.emoji?`와 같은 관례, `category.rules.ts#editCategory` 참고). 제공 목록
 * (`mood-emoji.ts`) 밖 값은 던진다 — 카테고리 이모지(R4-a)와 달리 다이어리는 자유 입력이 저장된
 * 이력이 없으므로 "목록 밖 값은 지우지 않는다" 예외가 없다.
 */
export function validateMoodEmoji(raw: string | undefined): string | undefined {
  const value = raw ?? '';
  if (value === '') {
    return undefined;
  }
  if (!MOOD_EMOJIS.some((option) => option.emoji === value)) {
    throw new DomainError('DIARY_EMOJI_INVALID', value);
  }
  return value;
}

/** 이모지도 본문도 없으면 빈 기록이다 — 저장할 수 없다 (diary R3). */
function assertNotEmpty(emoji: string | undefined, content: string): void {
  if (emoji === undefined && content === '') {
    throw new DomainError('DIARY_EMPTY');
  }
}

/**
 * 새 다이어리 기록 (diary R1~R3). `existing`은 같은 날짜의 살아 있는 기록 — 있으면 유일성 위반이다.
 * 유일성을 DB 유일 인덱스가 아니라 여기서 지키는 이유는 `diaryEntries` 인덱스가 `date`(비유일)라서다
 * (소프트 삭제 툼스톤이 같은 `date`로 남는다, `db.ts` 주석). 검증 순서: 유일성 → 본문 → 이모지 → 빈 값.
 */
export function createDiaryEntry(
  input: { date: DateKey; emoji?: string; content: string },
  existing: DiaryEntry | undefined,
  deps: MetaDeps,
): Persistable<DiaryEntry> {
  if (existing !== undefined) {
    throw new DomainError('DIARY_DATE_TAKEN');
  }
  const content = validateDiaryContent(input.content);
  const emoji = validateMoodEmoji(input.emoji);
  assertNotEmpty(emoji, content);
  return createMeta<DiaryEntry>(deps, {
    date: input.date,
    content,
    ...(emoji === undefined ? {} : { emoji }),
  });
}

/** 기존 기록 수정 (diary R2~R3). 날짜·유일성은 바뀌지 않으므로 다시 검사하지 않는다. */
export function editDiaryEntry(
  entry: DiaryEntry,
  patch: { emoji?: string; content: string },
  deps: MetaDeps,
): Persistable<DiaryEntry> {
  const content = validateDiaryContent(patch.content);
  const emoji = validateMoodEmoji(patch.emoji);
  assertNotEmpty(emoji, content);
  const { emoji: _current, ...rest } = entry;
  const next = { ...rest, content };
  return touch(emoji === undefined ? next : { ...next, emoji }, deps.now());
}

/** 소프트 삭제 (diary R4). 물리 삭제는 없다(todo.md R13과 같은 메커니즘). */
export function deleteDiaryEntry(entry: DiaryEntry, deps: MetaDeps): Persistable<DiaryEntry> {
  return markDeleted(entry, deps.now());
}

/**
 * 삭제 되돌리기 (diary R4). `before`는 **삭제 직전 값**(deletedAt 없음)이고 `deletedAt`은
 * `deleteDiaryEntry`가 그 삭제에 찍은 시각이다. 두 번 touch 하는 이유는 `dday.rules.ts#restoreDday`
 * 와 같다 — 한 번만 touch 하면 되돌린 값의 rev 가 방금 쓴 툼스톤의 rev 와 같아져(`before.rev + 1`)
 * 되돌리기 쓰기가 툼스톤을 확실히 덮어쓰지 못한다.
 */
export function restoreDiaryEntry(
  before: DiaryEntry,
  deletedAt: string,
  deps: MetaDeps,
): Persistable<DiaryEntry> {
  return touch(touch(before, deletedAt), deps.now());
}

/**
 * `getByDate` 가 같은 날짜에 여러 건이 남아 있을 때(데이터가 어긋난 경우) 첫 번째를 고르는 기준.
 * 만든 순서, 그마저 같으면 id — 두 저장소 구현이 갈리지 않는다.
 */
export function compareDiaryEntries(a: DiaryEntry, b: DiaryEntry): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** `list()` 의 정렬: date asc → (같은 날짜면) `compareDiaryEntries` (diary R6, 날짜 스트립 점용). */
export function sortDiaryEntriesByDate(entries: readonly DiaryEntry[]): DiaryEntry[] {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return compareDiaryEntries(a, b);
  });
}
