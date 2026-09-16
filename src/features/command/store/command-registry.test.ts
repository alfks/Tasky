import { describe, expect, it, vi } from 'vitest';

import {
  DuplicateCommandError,
  addCommands,
  availableCommands,
  matchCommands,
  normalizeQuery,
  orderByRecent,
  pushRecent,
  removeCommands,
  type Command,
} from '@/features/command/store/command-registry';

function command(id: string, label: string, extra: Partial<Command> = {}): Command {
  return { id, label, run: vi.fn(), ...extra };
}

describe('addCommands', () => {
  it('여러 개를 한 번에 등록한다', () => {
    const list = addCommands([], [command('a', '가'), command('b', '나')]);
    expect(list.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('이미 있는 id 는 던진다', () => {
    const list = addCommands([], [command('a', '가')]);
    expect(() => addCommands(list, [command('a', '다른 이름')])).toThrow(DuplicateCommandError);
  });

  it('한 묶음 안의 중복도 잡는다', () => {
    expect(() => addCommands([], [command('a', '가'), command('a', '가2')])).toThrow(
      DuplicateCommandError,
    );
  });

  it('중복이 있으면 아무것도 등록하지 않는다(부분 등록 금지)', () => {
    const list = addCommands([], [command('a', '가')]);
    let next = list;
    try {
      next = addCommands(list, [command('c', '다'), command('a', '가2')]);
    } catch {
      // 기대한 예외.
    }
    expect(next.map((c) => c.id)).toEqual(['a']);
  });
});

describe('removeCommands', () => {
  it('id 로 지우고 없는 id 는 무시한다', () => {
    const list = addCommands([], [command('a', '가'), command('b', '나')]);
    expect(removeCommands(list, ['a', 'zzz']).map((c) => c.id)).toEqual(['b']);
  });
});

describe('availableCommands', () => {
  it('when() 이 거짓인 명령을 뺀다', () => {
    const list = [
      command('a', '가'),
      command('b', '나', { when: () => false }),
      command('c', '다', { when: () => true }),
    ];
    expect(availableCommands(list).map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('when() 이 던지면 그 명령만 숨긴다 — 팔레트 전체가 죽지 않는다', () => {
    const list = [
      command('boom', '폭탄', {
        when: () => {
          throw new Error('조회 실패');
        },
      }),
      command('ok', '정상'),
    ];
    expect(availableCommands(list).map((c) => c.id)).toEqual(['ok']);
  });
});

describe('matchCommands (R8)', () => {
  const list = [
    command('todo.new', '새 할 일', { keywords: ['add', '추가'] }),
    command('date.today', '오늘로 이동', { keywords: ['today'] }),
    command('theme.dark', '다크 모드로 전환', { keywords: ['테마', 'theme'] }),
    command('backup.export', '백업 내보내기', { keywords: ['export'] }),
  ];

  it('공백을 지우고 소문자로 맞춘다', () => {
    expect(normalizeQuery('  Da RK ')).toBe('dark');
    expect(matchCommands(list, '오 늘').map((c) => c.id)).toEqual(['date.today']);
  });

  it('라벨 부분 일치로 찾는다', () => {
    expect(matchCommands(list, '내보내기').map((c) => c.id)).toEqual(['backup.export']);
  });

  it('키워드로도 찾는다', () => {
    expect(matchCommands(list, 'theme').map((c) => c.id)).toEqual(['theme.dark']);
    expect(matchCommands(list, 'add').map((c) => c.id)).toEqual(['todo.new']);
  });

  it('라벨 접두 일치가 키워드 일치보다 앞선다', () => {
    const ranked = [
      command('x', '테마 바꾸기'),
      command('y', '무관', { keywords: ['테마'] }),
      command('z', '지금 테마'),
    ];
    expect(matchCommands(ranked, '테마').map((c) => c.id)).toEqual(['x', 'z', 'y']);
  });

  it('맞는 게 없으면 빈 목록이다', () => {
    expect(matchCommands(list, 'zzzz')).toEqual([]);
  });

  it('빈 질의는 전체를 원래 순서로 돌려준다', () => {
    expect(matchCommands(list, '   ').map((c) => c.id)).toEqual(list.map((c) => c.id));
  });

  it('한글 초성 검색은 하지 않는다(범위 밖)', () => {
    expect(matchCommands(list, 'ㅅㅎ')).toEqual([]);
  });
});

describe('orderByRecent · pushRecent (R12)', () => {
  const list = [command('a', '가'), command('b', '나'), command('c', '다')];

  it('최근 실행을 앞세우고 나머지 순서는 지킨다', () => {
    expect(orderByRecent(list, ['c']).map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(orderByRecent(list, ['c', 'a']).map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });

  it('최근 목록이 비면 순서가 그대로다', () => {
    expect(orderByRecent(list, []).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('같은 명령을 다시 실행하면 맨 앞으로 오고 중복되지 않는다', () => {
    expect(pushRecent(['a', 'b'], 'b')).toEqual(['b', 'a']);
  });

  it('5개까지만 기억한다', () => {
    expect(pushRecent(['a', 'b', 'c', 'd', 'e'], 'f')).toEqual(['f', 'a', 'b', 'c', 'd']);
  });
});
