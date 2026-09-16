/**
 * 등록 가능한 단축키 **전체 목록**(shortcuts R1·R2). 조합·설명·묶음의 단일 소스다.
 *
 * 왜 조합을 호출처가 아니라 여기에 두는가: R5 는 "도움말은 등록된 단축키에서 생성된다(수동 표 금지)"
 * 를 요구한다. 조합이 기능마다 흩어져 있으면 도움말은 여전히 자동이지만 **예약 키 검사·중복 검사가
 * 등록 시점까지 미뤄진다** — 즉 그 화면을 실제로 마운트해야만 사고가 드러난다. 목록을 한곳에 두면
 * 모듈이 로드되는 순간 전부 파싱·검사된다(아래 `SHORTCUT_CHORDS`).
 *
 * 기능 쪽은 조합이 아니라 **id 로** 핸들러를 건다: `useShortcut('date.next', handler)`.
 */
import { chordId, parseChord, type Chord } from '@/features/command/lib/key-chord';
import { reservedConflict } from '@/features/command/lib/reserved-keys';

/**
 * `global` — 문서 전역에서 디스패처가 직접 실행한다. 핸들러가 등록돼야 도움말에 나타난다.
 * `item` — 포커스가 그 항목에 있을 때 항목 컴포넌트가 처리한다(R2). 디스패처는 손대지 않고
 * 도움말에만 싣는다. 항목 키까지 디스패처가 가로채면 어떤 항목이 대상인지 알 수 없다.
 */
export type ShortcutScope = 'global' | 'item';

/** 도움말 표의 묶음. 순서는 이 배열 순서다(도움말 스케치와 같다). */
export const SHORTCUT_GROUPS = ['이동', '할 일', '화면'] as const;
export type ShortcutGroup = (typeof SHORTCUT_GROUPS)[number];

export type ShortcutDefinition = {
  /** 같은 동작에 붙는 조합들. `Delete`·`Backspace` 처럼 둘 이상일 수 있다. */
  chords: readonly string[];
  group: ShortcutGroup;
  /** 도움말 표에 그대로 나가는 한국어 설명. */
  description: string;
  scope: ShortcutScope;
  /** 입력·textarea 안에서도 동작하는가(R1 의 `Mod+K` 하나). */
  allowInEditable?: boolean;
};

export const SHORTCUTS = {
  'date.prev': {
    chords: ['ArrowLeft'],
    group: '이동',
    description: '하루 전으로',
    scope: 'global',
  },
  'date.next': { chords: ['ArrowRight'], group: '이동', description: '하루 뒤로', scope: 'global' },
  'date.prevWeek': {
    chords: ['Shift+ArrowLeft'],
    group: '이동',
    description: '한 주 전으로',
    scope: 'global',
  },
  'date.nextWeek': {
    chords: ['Shift+ArrowRight'],
    group: '이동',
    description: '한 주 뒤로',
    scope: 'global',
  },
  'date.today': { chords: ['T'], group: '이동', description: '오늘로', scope: 'global' },
  'palette.open': {
    chords: ['Mod+K'],
    group: '이동',
    description: '명령 팔레트 열기',
    scope: 'global',
    allowInEditable: true,
  },
  'todo.new': { chords: ['N'], group: '할 일', description: '할 일 추가', scope: 'global' },
  'todo.toggle': {
    chords: ['Space'],
    group: '할 일',
    description: '완료 표시 (선택한 할 일)',
    scope: 'item',
  },
  'todo.edit': {
    chords: ['Enter'],
    group: '할 일',
    description: '편집 (선택한 할 일)',
    scope: 'item',
  },
  'todo.remove': {
    chords: ['Delete', 'Backspace'],
    group: '할 일',
    description: '삭제 (선택한 할 일)',
    scope: 'item',
  },
  'todo.moveUp': {
    chords: ['Alt+ArrowUp'],
    group: '할 일',
    description: '위로 옮기기 (선택한 할 일·카테고리)',
    scope: 'item',
  },
  'todo.moveDown': {
    chords: ['Alt+ArrowDown'],
    group: '할 일',
    description: '아래로 옮기기 (선택한 할 일·카테고리)',
    scope: 'item',
  },
  'shell.sidebar': {
    chords: ['Mod+\\'],
    group: '화면',
    description: '사이드바 접기/펼치기',
    scope: 'global',
  },
  'help.open': { chords: ['?'], group: '화면', description: '단축키 도움말', scope: 'global' },
} as const satisfies Record<string, ShortcutDefinition>;

export type ShortcutId = keyof typeof SHORTCUTS;

/**
 * 정의 조회. `as const` 로 굳힌 리터럴 타입은 `allowInEditable` 이 없는 갈래를 만들어 내므로
 * (선택 필드를 적지 않은 항목) 읽을 때는 넓은 타입으로 되돌린다.
 */
export function shortcutDefinition(id: ShortcutId): ShortcutDefinition {
  return SHORTCUTS[id];
}

/** 모든 id. 도움말·테스트가 전수를 돌 때 쓴다. */
export const SHORTCUT_IDS = Object.keys(SHORTCUTS) as ShortcutId[];

/**
 * 항목 포커스 단축키 id(R2). 이 키들을 **실제로 처리하는** 목록 컴포넌트(T-15)가
 * `useDocumentedShortcuts(ITEM_SHORTCUT_IDS)` 로 **한 번** 등록해 도움말에 싣는다. 처리기가 없는
 * `<CommandLayer/>` 가 대신 등록하면, 아직 동작하지 않는 키가 도움말에 먼저 나타난다(R5 위반).
 * 등록하는 쪽은 한 곳뿐이어야 한다 — 투두 행과 카테고리 행이 각각 부르면 중복이다.
 * 모듈 상수라 훅의 의존성으로 안전하다.
 */
export const ITEM_SHORTCUT_IDS: readonly ShortcutId[] = SHORTCUT_IDS.filter(
  (id) => SHORTCUTS[id].scope === 'item',
);

/**
 * 조합 하나가 카탈로그에 들어가도 되는지 검사하고, 통과하면 `seen` 에 주인을 기록한다(R4).
 *
 * `buildChords` 안에 인라인으로 두지 않는 이유: 그러면 테스트가 이 검사를 **복제**해야만 검증할 수
 * 있고(카탈로그 전체를 돌며 같은 판정을 다시 쓰는 거울 픽스처), 그 복제는 프로덕션 가드를 한 번도
 * 밟지 않는다 — 가드를 통째로 지워도 테스트가 초록으로 남는다. 실제로 그랬다. 함수로 뽑아 두면
 * 테스트가 예약 조합·중복 조합을 **직접 먹여** 던지는 것을 단언할 수 있다.
 *
 * `seen` 의 키는 `scope:chordId` 다 — 같은 조합이라도 전역과 항목은 서로 다른 순간에 쓰인다(R2).
 */
export function assertRegisterable(
  chord: Chord,
  spec: string,
  id: string,
  scope: ShortcutScope,
  seen: Map<string, string>,
): void {
  if (reservedConflict(chord) !== null) {
    throw new Error(`'${id}' 의 '${spec}' 는 브라우저·OS 예약 조합입니다(R4).`);
  }
  // 목록 안의 충돌은 등록을 기다릴 필요가 없다 — 모듈 로드 시점에 죽는 편이 낫다.
  const key = `${scope}:${chordId(chord)}`;
  const owner = seen.get(key);
  if (owner !== undefined) throw new Error(`'${spec}' 가 '${owner}' 와 '${id}' 에 겹칩니다.`);
  seen.set(key, id);
}

function buildChords(): Record<ShortcutId, Chord[]> {
  const byId = {} as Record<ShortcutId, Chord[]>;
  const seen = new Map<string, string>();
  for (const id of SHORTCUT_IDS) {
    byId[id] = SHORTCUTS[id].chords.map((spec) => {
      const chord = parseChord(spec);
      assertRegisterable(chord, spec, id, SHORTCUTS[id].scope, seen);
      return chord;
    });
  }
  return byId;
}

/** 파싱·검사를 마친 조합. 모듈 로드 시점에 한 번 만든다. */
export const SHORTCUT_CHORDS: Record<ShortcutId, Chord[]> = buildChords();
