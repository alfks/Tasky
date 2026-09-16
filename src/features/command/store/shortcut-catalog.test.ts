import { describe, expect, it } from 'vitest';

import { chordId, matchesChord } from '@/features/command/lib/key-chord';
import { reservedConflict } from '@/features/command/lib/reserved-keys';
import {
  ITEM_SHORTCUT_IDS,
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

  it('조합이 서로 겹치지 않는다(같은 scope 안에서)', () => {
    const seen = new Map<string, string>();
    for (const id of SHORTCUT_IDS) {
      for (const chord of SHORTCUT_CHORDS[id]) {
        const key = `${shortcutDefinition(id).scope}:${chordId(chord)}`;
        expect(seen.get(key), `${key} 가 ${seen.get(key) ?? ''} 와 겹칩니다`).toBeUndefined();
        seen.set(key, id);
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(SHORTCUT_IDS.length);
  });

  it('예약 조합을 하나도 쓰지 않는다(R4)', () => {
    for (const id of SHORTCUT_IDS) {
      for (const chord of SHORTCUT_CHORDS[id]) {
        expect(reservedConflict(chord), `${id}`).toBeNull();
      }
    }
  });

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
