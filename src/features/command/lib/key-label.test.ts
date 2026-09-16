import { describe, expect, it } from 'vitest';

import { parseChord } from '@/features/command/lib/key-chord';
import { chordKeyLabels, chordSpokenLabel, isMacPlatform } from '@/features/command/lib/key-label';

describe('isMacPlatform', () => {
  it('macOS·iOS 계열을 알아본다', () => {
    expect(isMacPlatform({ platform: 'MacIntel' })).toBe(true);
    expect(
      isMacPlatform({ platform: '', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)' }),
    ).toBe(true);
    expect(isMacPlatform({ platform: 'iPhone' })).toBe(true);
  });

  it('그 외는 거짓이다', () => {
    expect(isMacPlatform({ platform: 'Win32' })).toBe(false);
    expect(isMacPlatform({ platform: 'Linux x86_64', userAgent: 'X11; Linux' })).toBe(false);
    expect(isMacPlatform({})).toBe(false);
  });
});

describe('chordKeyLabels', () => {
  it('Mod 표기가 플랫폼마다 다르다(R3)', () => {
    expect(chordKeyLabels(parseChord('Mod+K'), true)).toEqual(['⌘', 'K']);
    expect(chordKeyLabels(parseChord('Mod+K'), false)).toEqual(['Ctrl', 'K']);
  });

  it('Shift·Alt 도 플랫폼 표기를 따른다', () => {
    expect(chordKeyLabels(parseChord('Shift+ArrowLeft'), true)).toEqual(['⇧', '←']);
    expect(chordKeyLabels(parseChord('Shift+ArrowLeft'), false)).toEqual(['Shift', '←']);
    expect(chordKeyLabels(parseChord('Alt+ArrowUp'), true)).toEqual(['⌥', '↑']);
    expect(chordKeyLabels(parseChord('Alt+ArrowUp'), false)).toEqual(['Alt', '↑']);
  });

  it('스페이스·Esc 는 기호가 아니라 이름으로 보인다', () => {
    expect(chordKeyLabels(parseChord('Space'), false)).toEqual(['Space']);
    expect(chordKeyLabels(parseChord('Escape'), false)).toEqual(['Esc']);
  });
});

describe('chordSpokenLabel', () => {
  it('기호가 아니라 한국어 문장으로 읽힌다', () => {
    expect(chordSpokenLabel(parseChord('Mod+K'), true)).toBe('커맨드 + K');
    expect(chordSpokenLabel(parseChord('Mod+K'), false)).toBe('컨트롤 + K');
    expect(chordSpokenLabel(parseChord('Shift+ArrowLeft'), false)).toBe('시프트 + 왼쪽 화살표');
    expect(chordSpokenLabel(parseChord('?'), false)).toBe('물음표');
    expect(chordSpokenLabel(parseChord('Mod+\\'), false)).toBe('컨트롤 + 백슬래시');
    expect(chordSpokenLabel(parseChord('Alt+ArrowDown'), true)).toBe('옵션 + 아래쪽 화살표');
  });

  it('읽는 문장에는 기호가 남지 않는다', () => {
    const specs = ['Mod+K', 'Shift+ArrowRight', 'Alt+ArrowUp', '?', 'Mod+\\', 'Space', 'T'];
    for (const isMac of [true, false]) {
      for (const spec of specs) {
        expect(chordSpokenLabel(parseChord(spec), isMac)).not.toMatch(/[⌘⇧⌥←→↑↓?\\]/);
      }
    }
  });
});
