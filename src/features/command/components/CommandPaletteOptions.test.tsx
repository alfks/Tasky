import { describe, expect, it, vi } from 'vitest';

import {
  buildSections,
  clampIndex,
  flattenOptions,
  formatMonthDay,
  parseDateQuery,
  resultCountText,
  stepIndex,
  type CommandOption,
} from '@/features/command/components/CommandPaletteOptions';
import type { Command } from '@/features/command/store/command-registry';
import { makeTodo } from '@/test/fixtures/todo';

const TODAY = '2026-09-17';

function command(id: string, label: string, extra: Partial<Command> = {}): Command {
  return { id, label, run: vi.fn(), ...extra };
}

const NAMES = new Map([['category-1', '공부']]);

function sectionsOf(input: Partial<Parameters<typeof buildSections>[0]> = {}) {
  return buildSections({
    commands: [],
    recentIds: [],
    query: '',
    dateJump: null,
    todos: [],
    categoryNames: NAMES,
    ...input,
  });
}

describe('parseDateQuery (§4)', () => {
  it.each([
    ['2026-01-05', '2026-01-05'],
    ['2026-1-5', '2026-01-05'],
    ['9/18', '2026-09-18'],
    ['12/31', '2026-12-31'],
    ['9월 18일', '2026-09-18'],
    ['9월18일', '2026-09-18'],
  ])('%s 를 %s 로 읽는다', (raw, expected) => {
    expect(parseDateQuery(raw, TODAY)).toBe(expected);
  });

  it.each([['장보기'], ['9/'], ['13/1'], ['2/30'], ['2026-02-30'], ['0/1'], ['9/32'], ['9-18']])(
    '%s 는 날짜가 아니다',
    (raw) => {
      expect(parseDateQuery(raw, TODAY)).toBeNull();
    },
  );

  it('연도가 없으면 오늘의 연도를 쓴다 — 윤년도 오늘을 기준으로 판정한다', () => {
    expect(parseDateQuery('2/29', '2024-01-01')).toBe('2024-02-29');
    expect(parseDateQuery('2/29', '2026-01-01')).toBeNull();
  });
});

describe('formatMonthDay', () => {
  it('0 을 채우지 않는다', () => {
    expect(formatMonthDay('2026-09-07')).toBe('9월 7일');
  });
});

describe('buildSections (§2 · R8·R9·R12)', () => {
  it('빈 질의는 명령만, 최근 실행 순으로 싣는다', () => {
    const sections = sectionsOf({
      commands: [command('a', '가나'), command('b', '나다'), command('c', '다라')],
      recentIds: ['c', 'b'],
      todos: [makeTodo({ title: '장보기' })],
    });
    expect(sections.map((s) => s.id)).toEqual(['commands']);
    expect(sections[0]?.options.map((o) => o.key)).toEqual(['command:c', 'command:b', 'command:a']);
  });

  it('질의가 있으면 명령과 투두 두 섹션을 만들고 투두 수를 제목에 적는다', () => {
    const sections = sectionsOf({
      commands: [command('a', '장보기 명령'), command('b', '관계없음')],
      query: '장보기',
      todos: [makeTodo({ seq: 1, title: '장보기' }), makeTodo({ seq: 2, title: '장보기 정리' })],
    });
    expect(sections.map((s) => s.label)).toEqual(['명령', '할 일 (2)']);
    expect(sections[0]?.options.map((o) => o.key)).toEqual(['command:a']);
  });

  it('when() 이 거짓인 명령은 목록에 없다', () => {
    const sections = sectionsOf({
      commands: [command('a', '보임'), command('b', '숨김', { when: () => false })],
    });
    expect(sections[0]?.options.map((o) => o.key)).toEqual(['command:a']);
  });

  it('날짜 질의는 명령 섹션 맨 앞에 선다', () => {
    const dateJump: CommandOption = {
      kind: 'command',
      key: 'date-jump:x',
      label: '9월 18일로 이동',
    };
    const sections = sectionsOf({
      commands: [command('a', '9/18 회고 쓰기')],
      query: '9/18',
      dateJump,
    });
    expect(sections[0]?.options.map((o) => o.key)).toEqual(['date-jump:x', 'command:a']);
  });

  it('투두 줄에 카테고리 이름과 날짜를 붙인다 — 모르는 카테고리는 "카테고리 없음"', () => {
    const [known, unknown] = flattenOptions(
      sectionsOf({
        query: '장',
        todos: [
          makeTodo({ seq: 1, title: '장보기', categoryId: 'category-1', date: '2026-09-17' }),
          makeTodo({ seq: 2, title: '장보기2', categoryId: 'gone', date: '2026-09-03' }),
        ],
      }),
    );
    expect(known?.kind === 'todo' && known.meta).toBe('공부 · 9월 17일');
    expect(unknown?.kind === 'todo' && unknown.meta).toBe('카테고리 없음 · 9월 3일');
  });

  it('결과가 하나도 없으면 섹션도 없다 — 빈 섹션 제목이 남지 않는다', () => {
    expect(sectionsOf({ commands: [command('a', '가')], query: '없는말' })).toEqual([]);
  });
});

describe('선택 자리 계산', () => {
  it('stepIndex 는 양끝에서 돌아온다', () => {
    expect(stepIndex(0, -1, 3)).toBe(2);
    expect(stepIndex(2, 1, 3)).toBe(0);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });

  it('clampIndex 는 목록이 짧아지면 마지막으로 당긴다', () => {
    expect(clampIndex(5, 3)).toBe(2);
    expect(clampIndex(1, 0)).toBe(0);
    expect(clampIndex(-3, 3)).toBe(0);
  });
});

describe('resultCountText (§5)', () => {
  it('0 개는 "결과가 없어요", 그 밖은 개수를 읽는다', () => {
    expect(resultCountText(0)).toBe('결과가 없어요');
    expect(resultCountText(5)).toBe('결과 5개');
  });
});
