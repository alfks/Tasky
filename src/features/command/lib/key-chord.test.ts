import { describe, expect, it } from 'vitest';

import {
  chordId,
  matchesChord,
  parseChord,
  type ChordEvent,
} from '@/features/command/lib/key-chord';

/** 실제 `KeyboardEvent` 의 매칭 관련 필드만. 기본값은 "수식키 없음". */
function keyEvent(key: string, mods: Partial<ChordEvent> = {}): ChordEvent {
  return { key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods };
}

describe('parseChord', () => {
  it('수식키 없는 키를 읽는다', () => {
    expect(parseChord('T')).toEqual({ key: 't', mod: false, shift: false, alt: false });
  });

  it('Mod·Shift·Alt 를 모두 읽고 별칭을 정규화한다', () => {
    expect(parseChord('Mod+Shift+Left')).toEqual({
      key: 'ArrowLeft',
      mod: true,
      shift: true,
      alt: false,
    });
    expect(parseChord('Option+Up')).toEqual({
      key: 'ArrowUp',
      mod: false,
      shift: false,
      alt: true,
    });
    expect(parseChord('Space').key).toBe(' ');
  });

  it('알 수 없는 수식키와 빈 키는 던진다 — 오타가 "절대 안 눌리는 키" 로 남지 않게', () => {
    expect(() => parseChord('Hyper+K')).toThrow(/알 수 없는 수식키/);
    expect(() => parseChord('Mod+')).toThrow(/빈 키 조합/);
  });

  it('Shift 를 비교하지 않는 키에 Shift 를 붙이면 던진다', () => {
    // '?' 는 자판에 따라 Shift 가 필요하거나 아니거나다 — 표기에만 남으면 도움말이 거짓말이 된다.
    expect(() => parseChord('Shift+?')).toThrow(/Shift/);
    expect(() => parseChord('Mod+Shift+T')).not.toThrow();
  });
});

describe('chordId', () => {
  it('표기가 달라도 같은 조합이면 같은 id 다', () => {
    expect(chordId(parseChord('Mod+K'))).toBe(chordId(parseChord('cmd+k')));
    expect(chordId(parseChord('Ctrl+K'))).toBe(chordId(parseChord('Mod+K')));
  });

  it('다른 조합은 다른 id 다', () => {
    const ids = ['T', 'N', 'Mod+K', 'Shift+ArrowLeft', 'ArrowLeft', 'Alt+ArrowUp'].map((spec) =>
      chordId(parseChord(spec)),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('matchesChord — 플랫폼', () => {
  const modK = parseChord('Mod+K');

  it('macOS 는 ⌘ 로, 그 외는 Ctrl 로 발동한다', () => {
    expect(matchesChord(modK, keyEvent('k', { metaKey: true }), true)).toBe(true);
    expect(matchesChord(modK, keyEvent('k', { ctrlKey: true }), false)).toBe(true);
  });

  it('반대쪽 수식키로는 발동하지 않는다', () => {
    // macOS 의 Ctrl+K 는 텍스트 필드에서 "줄 끝까지 삭제" 다 — 가로채면 입력이 망가진다.
    expect(matchesChord(modK, keyEvent('k', { ctrlKey: true }), true)).toBe(false);
    expect(matchesChord(modK, keyEvent('k', { metaKey: true }), false)).toBe(false);
  });

  it('수식키 없는 K 로는 발동하지 않는다', () => {
    expect(matchesChord(modK, keyEvent('k'), true)).toBe(false);
    expect(matchesChord(modK, keyEvent('k'), false)).toBe(false);
  });

  it('여분의 Alt 가 눌려 있으면 발동하지 않는다', () => {
    expect(matchesChord(modK, keyEvent('k', { metaKey: true, altKey: true }), true)).toBe(false);
  });

  it('수식키 없는 단축키는 반대쪽 수식키가 눌려 있으면 발동하지 않는다', () => {
    // macOS 의 Ctrl+T 는 텍스트 필드에서 "글자 자리 바꾸기" 다 — 그걸 "오늘로" 로 먹으면 안 된다.
    const today = parseChord('T');
    expect(matchesChord(today, keyEvent('t'), true)).toBe(true);
    expect(matchesChord(today, keyEvent('t', { ctrlKey: true }), true)).toBe(false);
    expect(matchesChord(today, keyEvent('t', { metaKey: true }), false)).toBe(false);
  });
});

describe('matchesChord — Shift 규칙', () => {
  it('이름 있는 키는 Shift 를 정확히 비교한다', () => {
    const shiftLeft = parseChord('Shift+ArrowLeft');
    const left = parseChord('ArrowLeft');
    expect(matchesChord(shiftLeft, keyEvent('ArrowLeft', { shiftKey: true }), false)).toBe(true);
    expect(matchesChord(shiftLeft, keyEvent('ArrowLeft'), false)).toBe(false);
    expect(matchesChord(left, keyEvent('ArrowLeft', { shiftKey: true }), false)).toBe(false);
    expect(matchesChord(left, keyEvent('ArrowLeft'), false)).toBe(true);
  });

  it('글자 키는 Shift 가 눌리면 발동하지 않는다', () => {
    const t = parseChord('T');
    expect(matchesChord(t, keyEvent('t'), false)).toBe(true);
    expect(matchesChord(t, keyEvent('T', { shiftKey: true }), false)).toBe(false);
  });

  it('CapsLock 으로 올라온 대문자는 발동한다(Shift 는 눌리지 않았다)', () => {
    expect(matchesChord(parseChord('N'), keyEvent('N'), false)).toBe(true);
  });

  it("'?' 는 Shift 여부와 무관하게 발동한다 — 자판마다 다르다", () => {
    const help = parseChord('?');
    expect(matchesChord(help, keyEvent('?', { shiftKey: true }), false)).toBe(true);
    expect(matchesChord(help, keyEvent('?'), false)).toBe(true);
    expect(matchesChord(help, keyEvent('/', { shiftKey: true }), false)).toBe(false);
  });

  it("'Mod+\\\\' 는 Mod 와 함께여야 한다", () => {
    const sidebar = parseChord('Mod+\\');
    expect(matchesChord(sidebar, keyEvent('\\', { ctrlKey: true }), false)).toBe(true);
    expect(matchesChord(sidebar, keyEvent('\\'), false)).toBe(false);
  });
});
