/**
 * 등록된 단축키 목록에 대한 순수 연산. React 도 스토어도 모른다 — 테스트가 상태 없이 돈다.
 *
 * 중복 등록을 **예외로** 다루는 이유: 같은 조합에 두 핸들러가 붙으면 하나가 조용히 이기고, 어느
 * 쪽이 이기는지는 마운트 순서라는 보이지 않는 값에 달린다. 그 상태로 배포되면 "가끔 안 돼요" 라는
 * 재현 불가 버그가 된다. 반면 중복은 **사용자 입력과 무관하게 결정적**이라 마운트하는 순간 항상
 * 터진다 — 개발·테스트에서 100% 잡히고 사용자에게 도달할 경로가 좁다.
 */
import { chordId, matchesChord, type Chord } from '@/features/command/lib/key-chord';
import {
  SHORTCUTS,
  SHORTCUT_CHORDS,
  SHORTCUT_GROUPS,
  SHORTCUT_IDS,
  type ShortcutGroup,
  type ShortcutId,
} from '@/features/command/store/shortcut-catalog';

export type ShortcutHandler = (e: KeyboardEvent) => void;

export type ShortcutEntry = {
  id: ShortcutId;
  /** `global` 은 필수, `item` 은 두지 않는다(문서화 전용 — 항목 컴포넌트가 스스로 처리한다). */
  run?: ShortcutHandler;
};

/** 중복 등록. 두 등록을 모두 이름으로 지목한다 — 어느 화면을 봐야 하는지 알 수 있어야 한다. */
export class DuplicateShortcutError extends Error {
  constructor(id: ShortcutId) {
    super(
      `단축키 '${id}'(${SHORTCUTS[id].chords.join(', ')}) 가 이미 등록돼 있습니다. ` +
        '같은 조합에 두 핸들러를 걸면 하나가 조용히 무시됩니다 — 한쪽을 지우거나 조건부로 등록하세요.',
    );
    this.name = 'DuplicateShortcutError';
  }
}

/** 목록에 하나 더한다. 이미 있으면 `DuplicateShortcutError`. */
export function addShortcut(list: readonly ShortcutEntry[], entry: ShortcutEntry): ShortcutEntry[] {
  const definition = SHORTCUTS[entry.id];
  if (definition.scope === 'global' && entry.run === undefined) {
    throw new Error(`'${entry.id}' 는 전역 단축키라 핸들러가 필요합니다.`);
  }
  if (definition.scope === 'item' && entry.run !== undefined) {
    throw new Error(
      `'${entry.id}' 는 항목 포커스 단축키(R2)라 전역 핸들러를 둘 수 없습니다 — ` +
        '항목 컴포넌트가 자기 keydown 에서 처리합니다.',
    );
  }
  if (list.some((other) => other.id === entry.id)) throw new DuplicateShortcutError(entry.id);
  return [...list, entry];
}

/** 등록을 되돌린다. **그 등록 객체와 동일할 때만** 지운다(같은 id 를 다시 등록한 뒤의 해제 경합 방지). */
export function removeShortcut(
  list: readonly ShortcutEntry[],
  entry: ShortcutEntry,
): ShortcutEntry[] {
  const index = list.indexOf(entry);
  if (index === -1) return [...list];
  return [...list.slice(0, index), ...list.slice(index + 1)];
}

/** 이 이벤트를 실행할 전역 단축키. 없으면 `undefined`. */
export function findShortcutFor(
  list: readonly ShortcutEntry[],
  e: KeyboardEvent,
  isMac: boolean,
): ShortcutEntry | undefined {
  return list.find(
    (entry) =>
      SHORTCUTS[entry.id].scope === 'global' &&
      SHORTCUT_CHORDS[entry.id].some((chord) => matchesChord(chord, e, isMac)),
  );
}

export type HelpRow = {
  id: ShortcutId;
  group: ShortcutGroup;
  description: string;
  chords: Chord[];
  scope: 'global' | 'item';
};

/**
 * 도움말 표의 행(R5). **등록된 것만** 싣는다 — 목록 전체를 실으면 아직 아무도 처리하지 않는 키가
 * 도움말에 먼저 나타나고, 눌러도 아무 일이 없는 문서가 된다.
 */
export function helpRows(list: readonly ShortcutEntry[]): HelpRow[] {
  const registered = new Set(list.map((entry) => entry.id));
  const rows = SHORTCUT_IDS.filter((id) => registered.has(id)).map((id) => ({
    id,
    group: SHORTCUTS[id].group,
    description: SHORTCUTS[id].description,
    chords: SHORTCUT_CHORDS[id],
    scope: SHORTCUTS[id].scope,
  }));
  return rows.sort((a, b) => SHORTCUT_GROUPS.indexOf(a.group) - SHORTCUT_GROUPS.indexOf(b.group));
}

/** 도움말·팔레트가 조합을 그릴 때 쓰는 조회. */
export function chordsOf(id: ShortcutId): Chord[] {
  return SHORTCUT_CHORDS[id];
}

/** 진단용 — 등록된 조합의 정규형 id 목록. */
export function registeredChordIds(list: readonly ShortcutEntry[]): string[] {
  return list.flatMap((entry) => SHORTCUT_CHORDS[entry.id].map(chordId));
}
