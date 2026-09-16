import { describe, expect, it } from 'vitest';

import { parseChord } from '@/features/command/lib/key-chord';
import { reservedChordSpecs, reservedConflict } from '@/features/command/lib/reserved-keys';

describe('reservedConflict', () => {
  it('브라우저·OS 가 먼저 가져가는 조합을 지목한다', () => {
    expect(reservedConflict(parseChord('Mod+W'))).toBe('Mod+W');
    expect(reservedConflict(parseChord('Mod+T'))).toBe('Mod+T');
    expect(reservedConflict(parseChord('Mod+N'))).toBe('Mod+N');
    // R4 가 이름으로 금지한 뒤로/앞으로.
    expect(reservedConflict(parseChord('Alt+ArrowLeft'))).toBe('Alt+ArrowLeft');
    expect(reservedConflict(parseChord('Alt+ArrowRight'))).toBe('Alt+ArrowRight');
  });

  it('우리가 쓰는 조합은 예약이 아니다', () => {
    for (const spec of ['Mod+K', 'Mod+\\', '?', 'T', 'N', 'ArrowLeft', 'Alt+ArrowUp']) {
      expect(reservedConflict(parseChord(spec))).toBeNull();
    }
  });

  it('표기를 다르게 써도 같은 조합이면 잡힌다', () => {
    expect(reservedConflict(parseChord('ctrl+w'))).toBe('Mod+W');
  });

  it('Shift 가 붙은 예약 조합과 안 붙은 것을 구분한다', () => {
    expect(reservedConflict(parseChord('Mod+Shift+T'))).toBe('Mod+Shift+T');
    expect(reservedConflict(parseChord('Mod+T'))).toBe('Mod+T');
  });

  it('목록이 전부 파싱된다(오타가 있으면 조용히 빠진다)', () => {
    for (const spec of reservedChordSpecs()) {
      expect(reservedConflict(parseChord(spec))).toBe(spec);
    }
    expect(reservedChordSpecs().length).toBeGreaterThan(10);
  });
});
