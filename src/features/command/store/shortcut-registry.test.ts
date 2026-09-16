import { describe, expect, it, vi } from 'vitest';

import {
  DuplicateShortcutError,
  addShortcut,
  chordsOf,
  findShortcutFor,
  helpRows,
  registeredChordIds,
  removeShortcut,
  type ShortcutEntry,
} from '@/features/command/store/shortcut-registry';

function keyDown(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, ...init });
}

describe('addShortcut', () => {
  it('전역 단축키를 핸들러와 함께 등록한다', () => {
    const list = addShortcut([], { id: 'date.next', run: vi.fn() });
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('date.next');
  });

  it('같은 id 를 두 번 등록하면 던진다 — 조용히 하나가 이기지 않는다', () => {
    const list = addShortcut([], { id: 'date.next', run: vi.fn() });
    expect(() => addShortcut(list, { id: 'date.next', run: vi.fn() })).toThrow(
      DuplicateShortcutError,
    );
  });

  it('중복 오류 문구가 조합을 알려 준다(어느 화면을 봐야 하는지)', () => {
    const list = addShortcut([], { id: 'palette.open', run: vi.fn() });
    expect(() => addShortcut(list, { id: 'palette.open', run: vi.fn() })).toThrow(/Mod\+K/);
  });

  it('다른 id 는 나란히 등록된다', () => {
    let list: ShortcutEntry[] = [];
    list = addShortcut(list, { id: 'date.next', run: vi.fn() });
    list = addShortcut(list, { id: 'date.prev', run: vi.fn() });
    expect(list).toHaveLength(2);
  });

  it('전역인데 핸들러가 없으면 던진다', () => {
    expect(() => addShortcut([], { id: 'date.next' })).toThrow(/핸들러/);
  });

  it('항목 포커스 키에 전역 핸들러를 걸면 던진다(R2)', () => {
    expect(() => addShortcut([], { id: 'todo.toggle', run: vi.fn() })).toThrow(/항목 포커스/);
    expect(() => addShortcut([], { id: 'todo.toggle' })).not.toThrow();
  });
});

describe('removeShortcut', () => {
  it('그 등록만 지운다', () => {
    const first: ShortcutEntry = { id: 'date.next', run: vi.fn() };
    const second: ShortcutEntry = { id: 'date.prev', run: vi.fn() };
    const list = addShortcut(addShortcut([], first), second);
    expect(removeShortcut(list, first)).toEqual([second]);
  });

  it('이미 지워진 등록을 다시 지워도 목록이 변하지 않는다', () => {
    const entry: ShortcutEntry = { id: 'date.next', run: vi.fn() };
    const list = addShortcut([], entry);
    const once = removeShortcut(list, entry);
    expect(removeShortcut(once, entry)).toEqual([]);
    // 같은 id 로 다시 등록한 뒤 옛 해제가 늦게 와도 새 등록을 지우지 않는다.
    const fresh: ShortcutEntry = { id: 'date.next', run: vi.fn() };
    expect(removeShortcut(addShortcut(once, fresh), entry)).toEqual([fresh]);
  });
});

describe('findShortcutFor', () => {
  const next = { id: 'date.next', run: vi.fn() } as const;
  const week = { id: 'date.nextWeek', run: vi.fn() } as const;
  const palette = { id: 'palette.open', run: vi.fn() } as const;
  const list = [next, week, palette] as ShortcutEntry[];

  it('조합이 맞는 등록을 찾는다', () => {
    expect(findShortcutFor(list, keyDown('ArrowRight'), false)?.id).toBe('date.next');
    expect(findShortcutFor(list, keyDown('ArrowRight', { shiftKey: true }), false)?.id).toBe(
      'date.nextWeek',
    );
  });

  it('플랫폼에 맞는 Mod 만 받는다(R3)', () => {
    expect(findShortcutFor(list, keyDown('k', { metaKey: true }), true)?.id).toBe('palette.open');
    expect(findShortcutFor(list, keyDown('k', { ctrlKey: true }), false)?.id).toBe('palette.open');
    expect(findShortcutFor(list, keyDown('k', { ctrlKey: true }), true)).toBeUndefined();
  });

  it('등록되지 않은 조합은 찾지 못한다', () => {
    expect(findShortcutFor(list, keyDown('ArrowLeft'), false)).toBeUndefined();
    expect(findShortcutFor(list, keyDown('t'), false)).toBeUndefined();
  });

  it('항목 포커스 키는 등록돼 있어도 전역으로 찾지 않는다(R2)', () => {
    const withItem = addShortcut(list, { id: 'todo.toggle' });
    expect(findShortcutFor(withItem, keyDown(' '), false)).toBeUndefined();
    // 같은 목록에서 전역 키는 여전히 찾힌다.
    expect(findShortcutFor(withItem, keyDown('ArrowRight'), false)?.id).toBe('date.next');
  });
});

describe('helpRows (R5)', () => {
  it('등록된 것만, 묶음 순서대로 싣는다', () => {
    let list: ShortcutEntry[] = [];
    list = addShortcut(list, { id: 'help.open', run: vi.fn() }); // 화면
    list = addShortcut(list, { id: 'todo.toggle' }); // 할 일
    list = addShortcut(list, { id: 'date.today', run: vi.fn() }); // 이동
    const rows = helpRows(list);
    expect(rows.map((row) => row.group)).toEqual(['이동', '할 일', '화면']);
    expect(rows.map((row) => row.id)).toEqual(['date.today', 'todo.toggle', 'help.open']);
  });

  it('등록되지 않은 단축키는 도움말에 나오지 않는다', () => {
    const rows = helpRows(addShortcut([], { id: 'date.today', run: vi.fn() }));
    expect(rows).toHaveLength(1);
    expect(rows.map((row) => row.id)).not.toContain('date.prev');
  });

  it('행이 설명과 조합을 함께 들고 있다', () => {
    const [row] = helpRows(addShortcut([], { id: 'date.today', run: vi.fn() }));
    expect(row.description).toBe('오늘로');
    expect(row.chords).toEqual(chordsOf('date.today'));
  });

  it('빈 등록은 빈 표다', () => {
    expect(helpRows([])).toEqual([]);
  });
});

describe('registeredChordIds', () => {
  it('등록된 조합의 정규형을 돌려준다', () => {
    const list = addShortcut(addShortcut([], { id: 'palette.open', run: vi.fn() }), {
      id: 'todo.remove',
    });
    expect(registeredChordIds(list)).toEqual(['mod+k', 'Delete', 'Backspace']);
  });
});
