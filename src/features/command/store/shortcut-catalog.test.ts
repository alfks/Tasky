import { describe, expect, it } from 'vitest';

import { matchesChord, parseChord } from '@/features/command/lib/key-chord';
import {
  ITEM_SHORTCUT_IDS,
  assertRegisterable,
  SHORTCUTS,
  SHORTCUT_CHORDS,
  SHORTCUT_GROUPS,
  SHORTCUT_IDS,
  shortcutDefinition,
} from '@/features/command/store/shortcut-catalog';

describe('단축키 카탈로그', () => {
  it('스펙 R1 의 전역 단축키가 전부 있다', () => {
    const globals = SHORTCUT_IDS.filter((id) => shortcutDefinition(id).scope === 'global');
    expect(globals).toEqual([
      'date.prev',
      'date.next',
      'date.prevWeek',
      'date.nextWeek',
      'date.today',
      'palette.open',
      'todo.new',
      'shell.sidebar',
      'help.open',
    ]);
  });

  it('스펙 R2 의 항목 포커스 키가 전부 있다', () => {
    expect(ITEM_SHORTCUT_IDS).toEqual([
      'todo.toggle',
      'todo.edit',
      'todo.remove',
      'todo.moveUp',
      'todo.moveDown',
    ]);
  });

  it('카탈로그 전체가 등록 가능하다 — 겹침도 예약 조합도 없다(R4)', () => {
    // 검사를 여기서 다시 구현하지 않는다(거울 픽스처 금지). 프로덕션 가드를 그대로 먹인다.
    const seen = new Map<string, string>();
    for (const id of SHORTCUT_IDS) {
      const { chords, scope } = shortcutDefinition(id);
      chords.forEach((spec, index) => {
        expect(() =>
          assertRegisterable(SHORTCUT_CHORDS[id][index], spec, id, scope, seen),
        ).not.toThrow();
      });
    }
    expect(seen.size).toBeGreaterThanOrEqual(SHORTCUT_IDS.length);
  });

  it('카탈로그가 묶음 순서대로 적혀 있다 — 도움말은 이 순서를 그대로 쓴다(R5)', () => {
    // helpRows 가 다시 정렬하지 않는 근거가 이 불변식이다. 새 단축키를 끼워 넣을 때 여기서 걸린다.
    const order = SHORTCUT_IDS.map((id) => SHORTCUT_GROUPS.indexOf(shortcutDefinition(id).group));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe('assertRegisterable (R4 가드)', () => {
  it('예약 조합은 던진다', () => {
    const seen = new Map<string, string>();
    expect(() =>
      assertRegisterable(parseChord('Mod+W'), 'Mod+W', 'test.close', 'global', seen),
    ).toThrow(/예약 조합/);
    expect(() =>
      assertRegisterable(parseChord('Mod+T'), 'Mod+T', 'test.newTab', 'global', seen),
    ).toThrow(/예약 조합/);
  });

  it('같은 scope 안의 같은 조합은 던지고, 두 주인을 모두 지목한다', () => {
    const seen = new Map<string, string>();
    assertRegisterable(parseChord('Mod+J'), 'Mod+J', 'first.one', 'global', seen);
    expect(() =>
      assertRegisterable(parseChord('Mod+J'), 'Mod+J', 'second.one', 'global', seen),
    ).toThrow(/'first.one'.*'second.one'/);
  });

  it('scope 가 다르면 같은 조합이 공존한다(R2 의 항목 키)', () => {
    const seen = new Map<string, string>();
    assertRegisterable(parseChord('Enter'), 'Enter', 'item.edit', 'item', seen);
    expect(() =>
      assertRegisterable(parseChord('Enter'), 'Enter', 'global.confirm', 'global', seen),
    ).not.toThrow();
  });
});

describe('단축키 카탈로그 — 조합의 모양', () => {
  it('전역 단일 키는 수식키가 없고, 수식키가 붙은 것은 Mod 또는 Shift/Alt 뿐이다(R4)', () => {
    // Alt+←/→ 는 뒤로/앞으로라 R4 가 이름으로 금지했다. 예약 목록이 이미 막지만 여기서 다시 본다.
    for (const id of SHORTCUT_IDS) {
      for (const chord of SHORTCUT_CHORDS[id]) {
        expect(chord.alt && (chord.key === 'ArrowLeft' || chord.key === 'ArrowRight')).toBe(false);
      }
    }
  });

  it('입력 중에도 도는 단축키는 Mod+K 하나뿐이다(R1)', () => {
    const allowed = SHORTCUT_IDS.filter((id) => shortcutDefinition(id).allowInEditable === true);
    expect(allowed).toEqual(['palette.open']);
  });

  it('모든 항목이 알려진 묶음에 속하고 설명이 비어 있지 않다(R5 의 도움말 재료)', () => {
    for (const id of SHORTCUT_IDS) {
      const definition = shortcutDefinition(id);
      expect(SHORTCUT_GROUPS).toContain(definition.group);
      expect(definition.description.length).toBeGreaterThan(1);
      expect(definition.chords.length).toBeGreaterThan(0);
    }
    expect(SHORTCUT_IDS.length).toBe(Object.keys(SHORTCUTS).length);
  });

  it('삭제는 Delete 와 Backspace 둘 다 받는다(R2)', () => {
    const chords = SHORTCUT_CHORDS['todo.remove'];
    expect(chords).toHaveLength(2);
    const fire = (key: string) =>
      chords.some((chord) =>
        matchesChord(
          chord,
          { key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false },
          false,
        ),
      );
    expect(fire('Delete')).toBe(true);
    expect(fire('Backspace')).toBe(true);
    expect(fire('Escape')).toBe(false);
  });
});
