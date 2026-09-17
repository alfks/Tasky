import { describe, expect, it, vi } from 'vitest';

import {
  QUICK_ADD_SECTION_ID,
  QUICK_ADD_SECTION_LABEL,
  buildSections,
  clampIndex,
  countResults,
  flattenOptions,
  formatMonthDay,
  parseDateQuery,
  resultCountText,
  quickAddOption,
  stepIndex,
  type CommandOption,
} from '@/features/command/components/CommandPaletteOptions';
import type { Command, QuickAdd } from '@/features/command/store/command-registry';
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

describe('빈 결과 줄 (§2 "결과가 없어요 — Enter로 \'장보기\'를 오늘 할 일로 추가")', () => {
  function quickAdd(run = vi.fn()): QuickAdd {
    return { id: 'todo.quickAdd', label: (title) => `'${title}'를 오늘 할 일로 추가`, run };
  }

  it('아무 것도 안 걸렸을 때 그 줄 하나만 놓는다', () => {
    const sections = sectionsOf({ query: '장보기', quickAdd: quickAdd() });

    expect(sections).toHaveLength(1);
    expect(sections[0]?.id).toBe(QUICK_ADD_SECTION_ID);
    expect(sections[0]?.label).toBe(QUICK_ADD_SECTION_LABEL);
    expect(sections[0]?.options[0]?.kind === 'command' && sections[0]?.options[0]?.label).toBe(
      "'장보기'를 오늘 할 일로 추가",
    );
  });

  it('하나라도 걸리면 그 줄은 나오지 않는다 — 막다른 길일 때만이다', () => {
    const withCommand = sectionsOf({
      commands: [command('a', '장보기 명령')],
      query: '장보기',
      quickAdd: quickAdd(),
    });
    const withTodo = sectionsOf({
      query: '장보기',
      todos: [makeTodo({ seq: 1, title: '장보기', categoryId: 'category-1' })],
      quickAdd: quickAdd(),
    });

    expect(withCommand.map((section) => section.id)).toEqual(['commands']);
    expect(withTodo.map((section) => section.id)).toEqual(['todos']);
  });

  it('등록된 줄이 없으면(카테고리 0개) 섹션도 없다 — 옛 문구가 그대로 남는다', () => {
    expect(sectionsOf({ query: '장보기', quickAdd: null })).toEqual([]);
  });

  it('빈 질의에는 나오지 않는다 — 제목 없는 할 일을 만들 수는 없다', () => {
    expect(sectionsOf({ query: '   ', quickAdd: quickAdd() })).toEqual([]);
  });

  it('`run` 은 **다듬은 질의**를 받는다 — 앞뒤 공백이 제목에 섞이지 않는다', () => {
    const run = vi.fn();
    const option = quickAddOption(quickAdd(run), '  장보기  ');

    expect(option?.label).toBe("'장보기'를 오늘 할 일로 추가");
    void option?.run?.();
    expect(run).toHaveBeenCalledWith('장보기');
  });

  it('등록된 명령이 아니라 즉석 명령이다 — 최근 실행(R12)에 질의가 쌓이지 않는다', () => {
    const option = quickAddOption(quickAdd(), '장보기');

    expect(option?.commandId).toBeUndefined();
    expect(option?.run).toBeTypeOf('function');
  });
});

describe('countResults (§5 — 빈 결과 줄은 결과가 아니다)', () => {
  it('그 줄만 있으면 0 이다 — 낭독기가 "결과 1개" 라고 하면 화면과 갈린다', () => {
    const sections = sectionsOf({
      query: '장보기',
      quickAdd: { id: 'q', label: () => '추가', run: vi.fn() },
    });

    expect(flattenOptions(sections)).toHaveLength(1);
    expect(countResults(sections)).toBe(0);
    expect(resultCountText(countResults(sections))).toBe('결과가 없어요');
  });

  it('진짜 결과는 그대로 센다', () => {
    const sections = sectionsOf({ commands: [command('a', '가'), command('b', '나')] });

    expect(countResults(sections)).toBe(2);
  });
});
