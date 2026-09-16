/**
 * 등록된 단축키 목록에 대한 순수 연산. React 도 스토어도 모른다 — 테스트가 상태 없이 돈다.
 *
 * 중복 등록을 어떻게 다루는지(개발은 예외, 프로덕션은 경고 + 먼저 등록된 쪽 유지)와 그 근거는
 * `lib/duplicate-policy.ts` 에 한 번만 적혀 있다.
 */
import { throwsOnDuplicate, reportDuplicate } from '@/features/command/lib/duplicate-policy';
import { chordId, matchesChord, type Chord } from '@/features/command/lib/key-chord';
import {
  SHORTCUTS,
  SHORTCUT_CHORDS,
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

/**
 * 목록에 하나 더한다.
 *
 * 이미 있으면 `strict` 일 때 `DuplicateShortcutError`, 아니면 기록만 남기고 **목록을 그대로**
 * 돌려준다(먼저 등록된 쪽이 산다). 기본값은 환경이 정한다 — `duplicate-policy.ts` 참고.
 * `strict` 를 인자로 뽑아 둔 이유는 프로덕션 갈래도 테스트가 실제로 밟게 하기 위해서다.
 */
export function addShortcut(
  list: readonly ShortcutEntry[],
  entry: ShortcutEntry,
  strict: boolean = throwsOnDuplicate(),
): ShortcutEntry[] {
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
  if (list.some((other) => other.id === entry.id)) {
    const error = new DuplicateShortcutError(entry.id);
    if (strict) throw error;
    reportDuplicate(error);
    return [...list];
  }
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
 * 도움말에 먼저 나타나고, 눌러도 아무 일이 없는 문서가 된다. 항목 포커스 키(R2)도 예외가 아니다:
 * 그 키를 처리하는 컴포넌트가 `useDocumentedShortcuts` 로 등록할 때 비로소 도움말에 나타난다.
 *
 * 묶음 순서(`SHORTCUT_GROUPS`)는 여기서 다시 정렬하지 않는다. 카탈로그가 이미 묶음 순으로 적혀
 * 있고 그 불변식은 카탈로그 테스트가 지킨다 — 여기에 정렬을 두면 **한 줄도 밟히지 않는 코드**가
 * 되어, 지워도 테스트가 초록으로 남는다(실제로 그랬다).
 */
export function helpRows(list: readonly ShortcutEntry[]): HelpRow[] {
  const registered = new Set(list.map((entry) => entry.id));
  return SHORTCUT_IDS.filter((id) => registered.has(id)).map((id) => ({
    id,
    group: SHORTCUTS[id].group,
    description: SHORTCUTS[id].description,
    chords: SHORTCUT_CHORDS[id],
    scope: SHORTCUTS[id].scope,
  }));
}

/** 도움말·팔레트가 조합을 그릴 때 쓰는 조회. */
export function chordsOf(id: ShortcutId): Chord[] {
  return SHORTCUT_CHORDS[id];
}

/** 진단용 — 등록된 조합의 정규형 id 목록. */
export function registeredChordIds(list: readonly ShortcutEntry[]): string[] {
  return list.flatMap((entry) => SHORTCUT_CHORDS[entry.id].map(chordId));
}
