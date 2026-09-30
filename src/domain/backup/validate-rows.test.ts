// `readTodo` 의 `TODO_KEYS` 화이트리스트 회귀 테스트 (backup.md R4·R5) — routine.md §4 로
// `Todo.routineId?` 가 생기며 드러난 버그: 화이트리스트에 없는 필드는 `pickFields` 가 조용히 버린다
// (`shape.ts` 머리주석 "목록에 없는 필드는 여기서 사라진다"). `routineId` 를 `TODO_KEYS` 에 더하지
// 않으면 백업 내보내기 → 가져오기 왕복에서 루틴 연결이 조용히 사라진다.
import { describe, expect, it } from 'vitest';

import { isBackupShapeError } from '@/domain/backup/shape';
import {
  readCategory,
  readDday,
  readDiaryEntry,
  readRoutine,
  readSettings,
  readTodo,
} from '@/domain/backup/validate-rows';

import { makeCategory } from '@/test/fixtures/category';
import { makeDday } from '@/test/fixtures/dday';
import { makeDiaryEntry } from '@/test/fixtures/diary';
import { makeRoutine } from '@/test/fixtures/routine';
import { makeSettings } from '@/test/fixtures/settings';
import { makeTodo } from '@/test/fixtures/todo';

describe('readTodo — routineId 왕복 (routine.md §4)', () => {
  it('routineId 가 있는 투두는 readTodo 를 거쳐도 그대로 남는다(백업 왕복)', () => {
    const exported = makeTodo({ routineId: '70000000-0000-4000-8000-000000000001' });

    const restored = readTodo(exported, 'todos[0]');

    expect(restored.routineId).toBe('70000000-0000-4000-8000-000000000001');
  });

  it('routineId 가 없는 투두는(R21 즉시 등록·직접 추가) 필드 자체가 안 생긴다', () => {
    const exported = makeTodo();
    expect('routineId' in exported).toBe(false);

    const restored = readTodo(exported, 'todos[0]');

    expect('routineId' in restored).toBe(false);
  });

  it('화이트리스트 밖 필드(TODO_KEYS 에 없는 것)는 여전히 사라진다 (backup R5, 회귀 없음)', () => {
    const restored = readTodo({ ...makeTodo(), unknownField: '유출되면 안 됨' }, 'todos[0]');
    expect('unknownField' in restored).toBe(false);
  });
});

/** 실패의 경로를 꺼낸다. 던지지 않으면 테스트가 깨진다(shape.test.ts 의 pathOf 와 같은 패턴). */
function pathOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (isBackupShapeError(error)) {
      return error.path;
    }
    throw error;
  }
  throw new Error('던져야 한다');
}

describe('readCategory — historyHidden 왕복 (category R22)', () => {
  it('historyHidden: true 인 카테고리 행이 왕복 후에도 유지된다', () => {
    const row = makeCategory({ historyHidden: true, deletedAt: '2026-01-16T00:00:00.000Z' });
    const result = readCategory(row, 'categories[0]');
    expect(result.historyHidden).toBe(true);
  });

  it('historyHidden 이 없는 행은 undefined 로 유지된다', () => {
    const row = makeCategory();
    const result = readCategory(row, 'categories[0]');
    expect(result.historyHidden).toBeUndefined();
  });
});

describe('readCategory — historyHidden 형식 검사 (backup R4)', () => {
  it('문자열이면 거부한다', () => {
    const row = { ...makeCategory(), historyHidden: 'yes-please' };
    expect(pathOf(() => readCategory(row, 'categories[0]'))).toBe('categories[0].historyHidden');
  });

  it('숫자면 거부한다', () => {
    const row = { ...makeCategory(), historyHidden: 0 };
    expect(pathOf(() => readCategory(row, 'categories[0]'))).toBe('categories[0].historyHidden');
  });
});

// T-86: ddays·diaryEntries·routines 를 백업 payload 에 넣는다(ADR-0016 정정 2). 세 왕복 테스트는
// 카테고리 historyHidden 회귀(위)와 같은 이유로 존재한다 — 화이트리스트에서 필드 하나가 빠지면
// `pickFields` 가 조용히 지운다, 겉으로는 아무 에러도 안 난다.
describe('readDday — 왕복 (calendar.md §4)', () => {
  it('title·date 가 그대로 남는다', () => {
    const row = makeDday({ title: '생일', date: '2026-03-01' });
    const restored = readDday(row, 'ddays[0]');
    expect(restored.title).toBe('생일');
    expect(restored.date).toBe('2026-03-01');
  });

  it('툼스톤(deletedAt)도 그대로 남는다', () => {
    const row = makeDday({ deletedAt: '2026-01-16T00:00:00.000Z' });
    const restored = readDday(row, 'ddays[0]');
    expect(restored.deletedAt).toBe('2026-01-16T00:00:00.000Z');
  });

  it('화이트리스트 밖 필드는 사라진다 (backup R5)', () => {
    const restored = readDday({ ...makeDday(), unknownField: '유출 금지' }, 'ddays[0]');
    expect('unknownField' in restored).toBe(false);
  });

  it('제목이 31자를 넘으면 거부한다 (calendar R1)', () => {
    const row = { ...makeDday(), title: 'ㄱ'.repeat(31) };
    expect(pathOf(() => readDday(row, 'ddays[0]'))).toBe('ddays[0].title');
  });
});

describe('readDiaryEntry — 왕복 (diary.md §4)', () => {
  it('emoji·content 가 그대로 남는다', () => {
    const row = makeDiaryEntry({ emoji: '😄', content: '좋은 하루' });
    const restored = readDiaryEntry(row, 'diaryEntries[0]');
    expect(restored.emoji).toBe('😄');
    expect(restored.content).toBe('좋은 하루');
  });

  it('emoji 없이 content 만 있어도 통과한다', () => {
    const row = makeDiaryEntry({ content: '기록만' });
    expect('emoji' in row).toBe(false);
    const restored = readDiaryEntry(row, 'diaryEntries[0]');
    expect('emoji' in restored).toBe(false);
  });

  it('content 가 빈 문자열이어도 통과한다(diary R3: 이모지만 있는 기록)', () => {
    const row = makeDiaryEntry({ emoji: '😄', content: '' });
    const restored = readDiaryEntry(row, 'diaryEntries[0]');
    expect(restored.content).toBe('');
  });

  it('툼스톤(deletedAt)도 그대로 남는다', () => {
    const row = makeDiaryEntry({ deletedAt: '2026-01-16T00:00:00.000Z' });
    const restored = readDiaryEntry(row, 'diaryEntries[0]');
    expect(restored.deletedAt).toBe('2026-01-16T00:00:00.000Z');
  });

  it('목록 밖 이모지는 거부한다(diary R3)', () => {
    const row = { ...makeDiaryEntry(), emoji: '🚀' };
    expect(pathOf(() => readDiaryEntry(row, 'diaryEntries[0]'))).toBe('diaryEntries[0].emoji');
  });

  it('화이트리스트 밖 필드는 사라진다 (backup R5)', () => {
    const restored = readDiaryEntry({ ...makeDiaryEntry(), unknownField: 'x' }, 'diaryEntries[0]');
    expect('unknownField' in restored).toBe(false);
  });
});

describe('readRoutine — fillFloor 왕복 (ADR-0018, ROUTINE_KEYS 주석)', () => {
  it('fillFloor 가 그대로 남는다', () => {
    const row = makeRoutine({ fillFloor: '2026-04-30' });
    const restored = readRoutine(row, 'routines[0]');
    expect(restored.fillFloor).toBe('2026-04-30');
  });

  it('recurrence(weekly) 가 그대로 남는다', () => {
    const row = makeRoutine({ recurrence: { type: 'weekly', daysOfWeek: [1, 3, 5] } });
    const restored = readRoutine(row, 'routines[0]');
    expect(restored.recurrence).toEqual({ type: 'weekly', daysOfWeek: [1, 3, 5] });
  });

  it('recurrence(monthly) 가 그대로 남는다', () => {
    const row = makeRoutine({ recurrence: { type: 'monthly', daysOfMonth: [1, 15] } });
    const restored = readRoutine(row, 'routines[0]');
    expect(restored.recurrence).toEqual({ type: 'monthly', daysOfMonth: [1, 15] });
  });

  it('endDate 없는(무기한) 루틴도 통과한다', () => {
    const row = makeRoutine();
    expect('endDate' in row).toBe(false);
    const restored = readRoutine(row, 'routines[0]');
    expect('endDate' in restored).toBe(false);
  });

  it('삭제된(비활성 아님) 루틴의 툼스톤도 그대로 남는다 — routine.md R10 "기록 보존"', () => {
    const row = makeRoutine({ deletedAt: '2026-01-16T00:00:00.000Z' });
    const restored = readRoutine(row, 'routines[0]');
    expect(restored.deletedAt).toBe('2026-01-16T00:00:00.000Z');
  });

  it('categoryId 는 형식만 본다 — 그 카테고리가 파일에 있는지는 확인하지 않는다', () => {
    const row = makeRoutine({ categoryId: '90000000-0000-4000-8000-000000000009' });
    const restored = readRoutine(row, 'routines[0]');
    expect(restored.categoryId).toBe('90000000-0000-4000-8000-000000000009');
  });

  it('recurrence.type 이 알 수 없는 값이면 거부한다', () => {
    const row = { ...makeRoutine(), recurrence: { type: 'yearly', dates: [1] } };
    expect(pathOf(() => readRoutine(row, 'routines[0]'))).toBe('routines[0].recurrence.type');
  });

  it('recurrence.daysOfWeek 범위 밖 값은 거부한다', () => {
    const row = { ...makeRoutine(), recurrence: { type: 'weekly', daysOfWeek: [7] } };
    expect(pathOf(() => readRoutine(row, 'routines[0]'))).toBe('routines[0].recurrence');
  });

  it('화이트리스트 밖 필드는 사라진다 (backup R5)', () => {
    const restored = readRoutine({ ...makeRoutine(), unknownField: 'x' }, 'routines[0]');
    expect('unknownField' in restored).toBe(false);
  });

  it('order(routine.md R13) 는 왕복하고, 없는 옛 백업도 필드 없이 통과한다', () => {
    expect(readRoutine(makeRoutine({ order: 2 }), 'routines[0]').order).toBe(2);
    const legacy = readRoutine(makeRoutine(), 'routines[0]');
    expect('order' in legacy).toBe(false);
  });

  it('order 가 음수·소수·숫자 아님이면 거부한다', () => {
    expect(pathOf(() => readRoutine(makeRoutine({ order: -1 }), 'routines[0]'))).toBe(
      'routines[0].order',
    );
    expect(pathOf(() => readRoutine(makeRoutine({ order: 1.5 }), 'routines[0]'))).toBe(
      'routines[0].order',
    );
    expect(pathOf(() => readRoutine({ ...makeRoutine(), order: '0' }, 'routines[0]'))).toBe(
      'routines[0].order',
    );
  });
});

/** R5 형식을 만족하는 데이터 URL 하나. 길이 검사는 `profile.rules.test.ts` 가 본다. */
const AVATAR = 'data:image/webp;base64,AAAA';

describe('readSettings — 프로필 세 필드 (profile.md R8 · ADR-0023 규칙 3, backup R4 의 의도된 예외)', () => {
  it('유효한 세 필드는 왕복에서 그대로 살아남는다', () => {
    const restored = readSettings(
      makeSettings({ profileName: '밀리', profileBio: '오늘도 한 칸씩', profileAvatar: AVATAR }),
      'settings',
    );
    expect(restored).toMatchObject({
      profileName: '밀리',
      profileBio: '오늘도 한 칸씩',
      profileAvatar: AVATAR,
    });
  });

  it('잘못된 profileAvatar(png 접두)는 그 필드만 버리고 행은 채택한다 — 테마·강조색·이름은 살아남는다', () => {
    const restored = readSettings(
      makeSettings({
        theme: 'dark',
        accentColor: '#FF8FA3',
        profileName: '밀리',
        profileAvatar: 'data:image/png;base64,AAAA',
      }),
      'settings',
    );
    expect(restored).toMatchObject({ theme: 'dark', accentColor: '#FF8FA3', profileName: '밀리' });
    expect('profileAvatar' in restored).toBe(false);
  });

  it('상한을 넘는 이름·소개, 문자열이 아닌 값도 각각 그 필드만 버린다', () => {
    const restored = readSettings(
      {
        ...makeSettings(),
        profileName: '가'.repeat(21),
        profileBio: 42,
        profileAvatar: AVATAR,
      },
      'settings',
    );
    expect('profileName' in restored).toBe(false);
    expect('profileBio' in restored).toBe(false);
    expect(restored.profileAvatar).toBe(AVATAR);
  });

  it('앞뒤 공백이 있는 profileName 은 파일 값 그대로 복원된다(검증은 다듬은 값, 저장은 받은 값)', () => {
    const restored = readSettings(makeSettings({ profileName: '  밀리 ' }), 'settings');
    expect(restored.profileName).toBe('  밀리 ');
  });

  it('공백만 있는 profileBio(" ")는 다듬으면 0자라 유효 — 그대로 남는다', () => {
    const restored = readSettings(makeSettings({ profileBio: ' ' }), 'settings');
    expect(restored.profileBio).toBe(' ');
  });

  it('프로필 필드가 없는 옛 설정 행은 그대로 통과하고 필드가 생기지 않는다', () => {
    const restored = readSettings(makeSettings(), 'settings');
    expect('profileName' in restored).toBe(false);
    expect('profileBio' in restored).toBe(false);
    expect('profileAvatar' in restored).toBe(false);
  });
  it('프로필 삭제 표식은 숫자 1만 보존하며 구버전 행에는 추가하지 않는다 (ADR-0026)', () => {
    expect(readSettings(makeSettings({ profileVersion: 1 }), 'settings').profileVersion).toBe(1);
    for (const profileVersion of [undefined, null, 0, 2, '1']) {
      expect(
        readSettings({ ...makeSettings(), profileVersion }, 'settings').profileVersion,
      ).toBeUndefined();
    }
  });
});

describe('readCategory — 공개 projection 연결은 캐시만 왕복한다', () => {
  it.each(['private', 'friends', 'public'] as const)(
    '범위 %s와 버전은 유지하고 원본 공개 payload는 버린다',
    (visibility) => {
      const row = makeCategory({
        visibility,
        socialCategoryId: 'a'.repeat(32),
        socialCategoryVersion: 3,
      });
      const restored = readCategory({ ...row, approvedPosts: ['원본 메모'] }, 'categories[0]');
      expect(restored).toMatchObject({
        visibility,
        socialCategoryId: 'a'.repeat(32),
        socialCategoryVersion: 3,
      });
      expect('approvedPosts' in restored).toBe(false);
    },
  );
  it('기존 백업에는 원격 projection을 만들지 않는다', () => {
    const restored = readCategory(makeCategory(), 'categories[0]');
    expect(restored.visibility).toBeUndefined();
    expect(restored.socialCategoryId).toBeUndefined();
  });
  it.each([
    { visibility: 'everyone' },
    { socialCategoryId: 'source-id' },
    { socialCategoryId: 'a'.repeat(32) },
    { socialCategoryVersion: 1 },
    { socialCategoryId: 'a'.repeat(32), socialCategoryVersion: -1 },
  ])('손상된 공개 캐시는 거절한다: %j', (fields) => {
    expect(() => readCategory({ ...makeCategory(), ...fields }, 'categories[0]')).toThrow();
  });
});
