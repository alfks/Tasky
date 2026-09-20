import { describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';
import type { DiaryEntry } from '@/domain/diary/diary-entry';
import {
  compareDiaryEntries,
  createDiaryEntry,
  DIARY_CONTENT_MAX_LENGTH,
  deleteDiaryEntry,
  diaryContentLength,
  editDiaryEntry,
  normalizeDiaryContent,
  restoreDiaryEntry,
  validateDiaryContent,
  validateMoodEmoji,
} from '@/domain/diary/diary.rules';
import { MOOD_EMOJIS } from '@/domain/diary/mood-emoji';
import { markDeleted } from '@/domain/meta';

import { fixedDeps, FIXTURE_INSTANT } from '@/test/fixtures/deps';

const T1 = '2026-01-16T09:30:00.000Z';
const DATE = '2026-01-15' as DateKey;
const deps = fixedDeps();
const EMOJI = MOOD_EMOJIS[0].emoji;

function makeEntry(overrides: Partial<DiaryEntry> & { seq?: number } = {}): DiaryEntry {
  const { seq = 1, ...rest } = overrides;
  return {
    id: `50000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    createdAt: FIXTURE_INSTANT,
    updatedAt: FIXTURE_INSTANT,
    rev: 1,
    date: DATE,
    emoji: EMOJI,
    content: '개운했다',
    ...rest,
  };
}

describe('본문 검증 (R2)', () => {
  it('공백만이면 빈 문자열로 정규화한다', () => {
    expect(normalizeDiaryContent('   ')).toBe('');
    expect(normalizeDiaryContent('  좋은 하루  ')).toBe('좋은 하루');
  });

  it('500자는 허용하고 501자는 거부한다(경계)', () => {
    expect(validateDiaryContent('가'.repeat(DIARY_CONTENT_MAX_LENGTH))).toHaveLength(
      DIARY_CONTENT_MAX_LENGTH,
    );
    expect(() => validateDiaryContent('가'.repeat(DIARY_CONTENT_MAX_LENGTH + 1))).toThrow(
      expect.objectContaining({ code: 'DIARY_CONTENT_TOO_LONG' }),
    );
  });

  it(
    '상한은 코드 유닛(.length)이 아니라 그래핌이다(리뷰 Minor 1) — 서러게이트 쌍(이모지)처럼 ' +
      '그래핌 1개가 코드 유닛 2개인 글자에서 둘이 갈린다',
    () => {
      const twoUnitEmoji = '😄'; // U+1F604 — .length 는 2, 그래핌은 1
      const content250 = twoUnitEmoji.repeat(250); // .length 500(코드 유닛), 그래핌 250
      expect(content250).toHaveLength(500);
      expect(diaryContentLength(content250)).toBe(250);
      expect(() => validateDiaryContent(content250)).not.toThrow();

      const content501 = twoUnitEmoji.repeat(501); // 그래핌 501 — 여기서만 거부돼야 한다
      expect(diaryContentLength(content501)).toBe(501);
      expect(() => validateDiaryContent(content501)).toThrow(
        expect.objectContaining({ code: 'DIARY_CONTENT_TOO_LONG' }),
      );
    },
  );
});

describe('기분 이모지 검증 (R3)', () => {
  it('빈 값·undefined는 "없음"(undefined)이다', () => {
    expect(validateMoodEmoji(undefined)).toBeUndefined();
    expect(validateMoodEmoji('')).toBeUndefined();
  });

  it('제공 목록의 값은 그대로 돌려준다', () => {
    expect(validateMoodEmoji(EMOJI)).toBe(EMOJI);
  });

  it('제공 목록 밖 값은 거부한다', () => {
    expect(() => validateMoodEmoji('🦄')).toThrow(
      expect.objectContaining({ code: 'DIARY_EMOJI_INVALID' }),
    );
  });
});

describe('생성 (R1~R3)', () => {
  it('같은 날짜에 살아 있는 기록이 있으면 거부한다(유일성, R1)', () => {
    const existing = makeEntry();
    expect(() =>
      createDiaryEntry({ date: DATE, emoji: EMOJI, content: '오늘' }, existing, deps),
    ).toThrow(expect.objectContaining({ code: 'DIARY_DATE_TAKEN' }));
  });

  it('같은 날짜의 기록이 소프트 삭제(툼스톤)됐으면 새로 만들 수 있다(재작성)', () => {
    // getByDate 는 살아 있는 기록만 돌려주므로 existing 은 undefined 다 — 저장소가 조회한 값을
    // 그대로 넘기는 계약이라 여기서는 그 결과(undefined)만 재현한다.
    const created = createDiaryEntry(
      { date: DATE, emoji: EMOJI, content: '다시 씀' },
      undefined,
      deps,
    );
    expect(created.date).toBe(DATE);
    expect(created.content).toBe('다시 씀');
  });

  it('이모지와 본문이 둘 다 비면 저장할 수 없다(R3)', () => {
    expect(() => createDiaryEntry({ date: DATE, content: '' }, undefined, deps)).toThrow(
      expect.objectContaining({ code: 'DIARY_EMPTY' }),
    );
  });

  it('이모지만 있어도 저장할 수 있다(R2)', () => {
    const created = createDiaryEntry({ date: DATE, emoji: EMOJI, content: '' }, undefined, deps);
    expect(created.emoji).toBe(EMOJI);
    expect(created.content).toBe('');
  });

  it('본문만 있어도 저장할 수 있다', () => {
    const created = createDiaryEntry({ date: DATE, content: '산책했다' }, undefined, deps);
    expect(created.emoji).toBeUndefined();
    expect(created.content).toBe('산책했다');
  });

  it('"없음"(emoji 미지정)은 emoji 필드 자체가 없는 값을 만든다', () => {
    const created = createDiaryEntry({ date: DATE, content: '기록' }, undefined, deps);
    expect('emoji' in created).toBe(false);
  });
});

describe('수정 (R2~R3)', () => {
  it('본문·이모지를 바꾸고 rev 를 +1 한다', () => {
    const entry = makeEntry();
    const edited = editDiaryEntry(
      entry,
      { emoji: MOOD_EMOJIS[1].emoji, content: '바뀜' },
      fixedDeps({ now: T1 }),
    );
    expect(edited.content).toBe('바뀜');
    expect(edited.emoji).toBe(MOOD_EMOJIS[1].emoji);
    expect(edited.rev).toBe(entry.rev + 1);
    expect(edited.updatedAt).toBe(T1);
  });

  it('이모지를 지우면(undefined) 필드가 사라진다', () => {
    const entry = makeEntry();
    const edited = editDiaryEntry(entry, { content: entry.content }, deps);
    expect('emoji' in edited).toBe(false);
  });

  it('수정으로도 둘 다 비게 하면 거부한다(R3)', () => {
    const entry = makeEntry({ emoji: undefined, content: '유일한 값' });
    expect(() => editDiaryEntry(entry, { content: '' }, deps)).toThrow(
      expect.objectContaining({ code: 'DIARY_EMPTY' }),
    );
  });
});

describe('삭제·되돌리기 (R4)', () => {
  it('삭제는 markDeleted 와 같은 결과다', () => {
    const entry = makeEntry();
    expect(deleteDiaryEntry(entry, fixedDeps({ now: T1 }))).toEqual(markDeleted(entry, T1));
  });

  it('되돌리기는 rev 를 +2 하고 deletedAt 을 지운다', () => {
    const entry = makeEntry();
    const deleted = deleteDiaryEntry(entry, fixedDeps({ now: T1 }));
    const restored = restoreDiaryEntry(
      entry,
      deleted.deletedAt as string,
      fixedDeps({ now: '2026-01-17T00:00:00.000Z' }),
    );
    expect(restored.deletedAt).toBeUndefined();
    expect(restored.rev).toBe(entry.rev + 2);
    expect(restored.rev).not.toBe(deleted.rev);
  });
});

describe('정렬 (compareDiaryEntries)', () => {
  it('createdAt 오름차순, 같으면 id 오름차순', () => {
    const a = makeEntry({ seq: 2, createdAt: '2026-01-01T00:00:00.000Z' });
    const b = makeEntry({ seq: 1, createdAt: '2026-01-02T00:00:00.000Z' });
    expect(compareDiaryEntries(a, b)).toBeLessThan(0);
    expect(compareDiaryEntries(b, a)).toBeGreaterThan(0);

    const c = makeEntry({ seq: 1, createdAt: '2026-01-01T00:00:00.000Z' });
    const d = makeEntry({ seq: 2, createdAt: '2026-01-01T00:00:00.000Z' });
    expect(compareDiaryEntries(c, d)).toBeLessThan(0);
  });
});
