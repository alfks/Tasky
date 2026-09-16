/**
 * 키 조합(chord) 모델과 매칭. 단축키가 "언제 발동하는가" 의 단일 소스다.
 *
 * 왜 문자열이 아니라 값인가: 등록이 늘어나면 같은 조합이 두 번 등록되는 사고가 반드시 생기는데,
 * 문자열 비교로는 `Mod+K` 와 `mod+k` 를 다른 것으로 보고 조용히 둘 다 등록된다. 정규형 id 를
 * 한 곳에서 만들어 레지스트리가 충돌을 **거절**할 수 있게 한다(shortcuts R1·R4).
 */

/** 파싱된 키 조합. `mod` 는 플랫폼에 따라 ⌘ 또는 Ctrl 이다(R3). */
export type Chord = {
  /** `KeyboardEvent.key` 와 같은 표기. 글자는 소문자로 정규화한다. */
  key: string;
  /** macOS `metaKey`, 그 외 `ctrlKey`. */
  mod: boolean;
  shift: boolean;
  alt: boolean;
};

/** 글자 키인가. 글자는 Shift 를 **정확히** 비교하고, 그 밖의 인쇄 문자는 비교하지 않는다(아래 참조). */
function isLetterKey(key: string): boolean {
  return key.length === 1 && /\p{Letter}/u.test(key);
}

/** 인쇄 문자 1글자인가(`?` `\` `/` 등 포함). */
function isPrintableKey(key: string): boolean {
  return key.length === 1;
}

/**
 * Shift 를 매칭에서 **무시**해야 하는 키인가.
 *
 * `?` 는 미국·한국 자판에서 `Shift+/` 지만 다른 배열에서는 수식키 없이 나온다. 그 차이를 조합에
 * 박아 두면 배열을 바꾼 사용자에게만 도움말이 거짓말이 된다 — 문자 자체가 이미 Shift 를 품고
 * 있으므로 비교하지 않는 편이 정확하다. 반대로 글자 키(`T`)는 Shift 를 정확히 비교한다:
 * 그래야 `Shift+T` 가 "오늘" 을 실행하지 않고, `Mod+Shift+T`(닫은 탭 복원) 같은 예약 조합을
 * 표현할 수 있다.
 */
function ignoresShift(key: string): boolean {
  return isPrintableKey(key) && !isLetterKey(key);
}

const MOD_TOKENS = new Set(['mod', 'cmd', 'command', 'ctrl', 'control', 'meta']);

/** `KeyboardEvent.key` 표기가 여러 개인 키를 하나로 모은다. */
const KEY_ALIASES: Record<string, string> = {
  space: ' ',
  esc: 'Escape',
  escape: 'Escape',
  enter: 'Enter',
  del: 'Delete',
  delete: 'Delete',
  backspace: 'Backspace',
  tab: 'Tab',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
};

function normalizeKey(raw: string): string {
  const alias = KEY_ALIASES[raw.toLowerCase()];
  if (alias !== undefined) return alias;
  if (isLetterKey(raw)) return raw.toLowerCase();
  return raw;
}

/**
 * `'Mod+Shift+ArrowLeft'` 같은 표기를 값으로 바꾼다. 마지막 토큰이 키, 앞은 전부 수식키다.
 * 알 수 없는 수식키나 빈 키는 **throw** 한다 — 오타 난 조합이 조용히 "절대 눌리지 않는 키" 로
 * 남으면 도움말에는 보이는데 동작하지 않는다.
 */
export function parseChord(spec: string): Chord {
  const tokens = spec.split('+').map((t) => t.trim());
  const rawKey = tokens.pop() ?? '';
  if (rawKey === '') throw new Error(`빈 키 조합입니다: '${spec}'`);
  const chord: Chord = { key: normalizeKey(rawKey), mod: false, shift: false, alt: false };
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (MOD_TOKENS.has(lower)) chord.mod = true;
    else if (lower === 'shift') chord.shift = true;
    else if (lower === 'alt' || lower === 'option' || lower === 'opt') chord.alt = true;
    else throw new Error(`알 수 없는 수식키 '${token}' 입니다: '${spec}'`);
  }
  if (chord.shift && ignoresShift(chord.key)) {
    // 매칭이 무시할 Shift 를 표기에만 남기면 도움말과 동작이 어긋난다.
    throw new Error(`'${chord.key}' 는 Shift 를 비교하지 않으므로 'Shift+' 를 붙일 수 없습니다.`);
  }
  return chord;
}

/** 중복 등록 판정에 쓰는 정규형 id. 매칭이 무시하는 Shift 는 id 에서도 뺀다. */
export function chordId(chord: Chord): string {
  const shift = ignoresShift(chord.key) ? false : chord.shift;
  return [chord.mod ? 'mod' : '', shift ? 'shift' : '', chord.alt ? 'alt' : '', chord.key]
    .filter((part) => part !== '')
    .join('+');
}

/** 매칭에 필요한 만큼의 키 이벤트. 실제 `KeyboardEvent` 와 테스트용 리터럴이 함께 들어온다. */
export type ChordEvent = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

/**
 * 이 이벤트가 그 조합인가. `isMac` 이면 `mod` = ⌘, 아니면 Ctrl 이며 **반대쪽 수식키가 눌려 있으면
 * 언제나 불일치**다(R3) — macOS 의 `Ctrl+K` 는 텍스트 필드에서 "줄 끝까지 삭제" 라, 그것을 우리
 * 단축키로 먹으면 입력이 망가진다.
 */
export function matchesChord(chord: Chord, e: ChordEvent, isMac: boolean): boolean {
  const modPressed = isMac ? e.metaKey : e.ctrlKey;
  const otherPressed = isMac ? e.ctrlKey : e.metaKey;
  if (modPressed !== chord.mod || otherPressed) return false;
  if (e.altKey !== chord.alt) return false;
  if (!ignoresShift(chord.key) && e.shiftKey !== chord.shift) return false;
  if (e.key === chord.key) return true;
  // CapsLock 은 Shift 없이도 대문자를 만든다 — 글자 키는 대소문자를 접어서 비교한다.
  return isLetterKey(chord.key) && e.key.toLowerCase() === chord.key;
}
