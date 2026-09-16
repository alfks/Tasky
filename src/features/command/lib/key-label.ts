/**
 * 조합을 사람이 읽는 표기와 **스크린리더가 읽는 문장**으로 바꾼다(R3, shortcuts §5).
 *
 * 두 가지가 왜 따로 있는가: `⌘` `←` `?` 같은 기호를 `<kbd>` 안에 그대로 두면 낭독기마다 결과가
 * 다르다(무음·"물결표"·"레프트워즈 애로우"). 실측(Chromium AX 트리)에서 `⌘` 만 든 노드의 이름은
 * 비어 있었다. 그래서 칩은 눈으로 보는 기호를 갖고, 낭독은 같은 조합의 한국어 문장이 맡는다.
 */
import type { Chord } from '@/features/command/lib/key-chord';

/** 눈으로 보는 키 이름. 없으면 키 표기를 그대로 쓴다. */
const VISUAL_KEY: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ' ': 'Space',
  Escape: 'Esc',
};

/** 낭독용 한국어 키 이름. */
const SPOKEN_KEY: Record<string, string> = {
  ArrowLeft: '왼쪽 화살표',
  ArrowRight: '오른쪽 화살표',
  ArrowUp: '위쪽 화살표',
  ArrowDown: '아래쪽 화살표',
  ' ': '스페이스',
  Escape: '이스케이프',
  Enter: '엔터',
  Delete: '딜리트',
  Backspace: '백스페이스',
  Tab: '탭',
  '?': '물음표',
  '\\': '백슬래시',
  '/': '슬래시',
};

/** macOS 판별. `navigator` 를 직접 읽지 않고 값으로 받아 테스트가 두 플랫폼을 모두 밟는다. */
export function isMacPlatform(nav: { platform?: string; userAgent?: string } = navigator): boolean {
  const hint = `${nav.platform ?? ''} ${nav.userAgent ?? ''}`;
  return /mac|iphone|ipad|ipod/i.test(hint);
}

/** 칩 하나당 문자열 하나. `<Kbd>` 를 이 개수만큼 나란히 그린다. */
export function chordKeyLabels(chord: Chord, isMac: boolean): string[] {
  const labels: string[] = [];
  if (chord.mod) labels.push(isMac ? '⌘' : 'Ctrl');
  if (chord.shift) labels.push(isMac ? '⇧' : 'Shift');
  if (chord.alt) labels.push(isMac ? '⌥' : 'Alt');
  labels.push(
    VISUAL_KEY[chord.key] ?? (chord.key.length === 1 ? chord.key.toUpperCase() : chord.key),
  );
  return labels;
}

/** 낭독 문장. 예: `커맨드 + K`, `시프트 + 왼쪽 화살표`. */
export function chordSpokenLabel(chord: Chord, isMac: boolean): string {
  const parts: string[] = [];
  if (chord.mod) parts.push(isMac ? '커맨드' : '컨트롤');
  if (chord.shift) parts.push(isMac ? '시프트' : '시프트');
  if (chord.alt) parts.push(isMac ? '옵션' : '알트');
  parts.push(
    SPOKEN_KEY[chord.key] ?? (chord.key.length === 1 ? chord.key.toUpperCase() : chord.key),
  );
  return parts.join(' + ');
}
