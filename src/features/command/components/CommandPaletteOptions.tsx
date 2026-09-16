/**
 * 팔레트가 그리는 **목록의 모양**(shortcuts §2 · R8·R9·R12). 전부 순수 함수다.
 *
 * 왜 컴포넌트에서 떼어 놓는가: 목록의 규칙(빈 질의는 최근 실행 순, 질의가 있으면 명령 + 투두 두
 * 섹션)은 렌더 트리와 무관한 판정인데, 컴포넌트 안에 두면 그 판정을 검증하려고 매번 대화상자를
 * 띄워야 하고 그 테스트는 화면을 조금만 고쳐도 깨진다.
 *
 * 매칭 자체(`matchCommands`·`orderByRecent`·`availableCommands`)는 T-17 이 이미 만들어 둔 것을
 * 쓴다 — 여기서 다시 구현하지 않는다(그 모듈은 T-24 가 `src/domain/` 으로 옮긴다).
 *
 * 확장자가 `.tsx` 인데 JSX 가 없는 이유: T-19 의 `owns` 가 `CommandPalette*.tsx` 라 이 feature 에
 * 새 `.ts` 를 만들 수 없다. T-24 가 도메인으로 옮길 때 `.ts` 가 된다.
 */
import type { DateKey } from '@/domain/date/date-key';
import type { Todo } from '@/domain/todo/todo';

import {
  availableCommands,
  matchCommands,
  normalizeQuery,
  orderByRecent,
  type Command,
} from '@/features/command/store/command-registry';
import type { ShortcutId } from '@/features/command/store/shortcut-catalog';

/** 레지스트리에 등록된 명령, 또는 질의에서 즉석으로 만든 명령(날짜 이동 — R7). */
export type CommandOption = {
  kind: 'command';
  key: string;
  label: string;
  /** 오른쪽에 그릴 조합. 없으면 그리지 않는다. */
  shortcutId?: ShortcutId;
  /** 등록된 명령이면 그 id — 실행을 스토어에 맡겨 최근 목록에 남긴다(R12). */
  commandId?: string;
  /** 즉석 명령의 실행. 등록된 명령에는 없다. */
  run?: () => void | Promise<void>;
};

/** 검색에 걸린 투두 한 건(R9). 고르면 그 날짜로 이동하고 그 행에 포커스한다. */
export type TodoOption = {
  kind: 'todo';
  key: string;
  todo: Todo;
  /** 제목 아래(좁은 화면) 또는 오른쪽에 붙는 "카테고리 · 9월 17일". */
  meta: string;
};

export type PaletteOption = CommandOption | TodoOption;

/** 목록의 한 묶음. `label` 은 `role="group"` 의 접근 이름이자 눈에 보이는 제목이다. */
export type PaletteSection = { id: string; label: string; options: PaletteOption[] };

const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const SLASH_DATE = /^(\d{1,2})\/(\d{1,2})$/;
const KOREAN_DATE = /^(\d{1,2})월\s*(\d{1,2})일$/;

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/**
 * 달력에 **실제로 있는 날**일 때만 `DateKey`. `2026-02-30` 은 `null` 이다 —
 * `new Date` 는 그것을 3월 2일로 넘겨 버리므로 되돌려 찍어 같은 날인지 본다.
 */
function toDateKeyIfReal(year: number, month: number, day: number): DateKey | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` as DateKey;
}

/**
 * 질의를 날짜로 읽는다(§4): `YYYY-MM-DD` · `M/D` · `M월 D일`. 연도가 없으면 **오늘의 연도**다.
 * 자연어("다음주 월요일")는 범위 밖(§6).
 */
export function parseDateQuery(raw: string, today: DateKey): DateKey | null {
  const query = raw.trim();
  const iso = ISO_DATE.exec(query);
  if (iso !== null) {
    return toDateKeyIfReal(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  const year = Number(today.slice(0, 4));
  const slash = SLASH_DATE.exec(query);
  if (slash !== null) return toDateKeyIfReal(year, Number(slash[1]), Number(slash[2]));
  const korean = KOREAN_DATE.exec(query);
  if (korean !== null) return toDateKeyIfReal(year, Number(korean[1]), Number(korean[2]));
  return null;
}

/** `2026-09-17` → `9월 17일`. 0 을 채우지 않는다(date-strip R11 과 같은 표기). */
export function formatMonthDay(date: DateKey): string {
  const [, month, day] = date.split('-');
  return `${Number(month)}월 ${Number(day)}일`;
}

function toCommandOption(command: Command): CommandOption {
  return {
    kind: 'command',
    key: `command:${command.id}`,
    label: command.label,
    shortcutId: command.shortcutId,
    commandId: command.id,
  };
}

export type BuildSectionsInput = {
  /** 지금 등록된 명령 전부. `when()` 거르기는 여기서 한다. */
  commands: readonly Command[];
  /** 최근 실행 id, 최신 순(R12). 빈 질의의 정렬 키다. */
  recentIds: readonly string[];
  query: string;
  /** 질의가 날짜로 읽혔을 때의 즉석 명령. 명령 섹션 맨 앞에 선다. */
  dateJump: CommandOption | null;
  /** 검색 결과(R9). 검색이 실패했으면 호출처가 빈 배열을 준다 — 투두 섹션이 사라진다(§2 에러). */
  todos: readonly Todo[];
  /** 투두의 카테고리 이름. 없는 id 는 "카테고리 없음" 으로 적는다. */
  categoryNames: ReadonlyMap<string, string>;
};

/**
 * 섹션 목록을 만든다. 빈 섹션은 넣지 않으므로 화면은 `sections.length === 0` 하나만 보면 된다.
 *
 * 빈 질의에서 투두를 싣지 않는 것은 스펙 문면이다(§2 "입력이 비어 있으면 명령만").
 */
export function buildSections(input: BuildSectionsInput): PaletteSection[] {
  const { commands, recentIds, query, dateJump, todos, categoryNames } = input;
  const usable = availableCommands(commands);
  const matched =
    normalizeQuery(query) === '' ? orderByRecent(usable, recentIds) : matchCommands(usable, query);
  const commandOptions: PaletteOption[] = matched.map(toCommandOption);
  if (dateJump !== null) commandOptions.unshift(dateJump);

  // "입력이 비어 있으면 명령만"(§2). 호출처가 빈 질의에 투두를 주더라도 여기서 막는다 —
  // 규칙을 호출처에만 두면 다른 호출처가 생기는 날 조용히 어긋난다.
  const todoOptions: PaletteOption[] = (normalizeQuery(query) === '' ? [] : todos).map((todo) => ({
    kind: 'todo',
    key: `todo:${todo.id}`,
    todo,
    meta: `${categoryNames.get(todo.categoryId) ?? '카테고리 없음'} · ${formatMonthDay(todo.date)}`,
  }));

  const sections: PaletteSection[] = [];
  if (commandOptions.length > 0) {
    sections.push({ id: 'commands', label: '명령', options: commandOptions });
  }
  if (todoOptions.length > 0) {
    sections.push({ id: 'todos', label: `할 일 (${todoOptions.length})`, options: todoOptions });
  }
  return sections;
}

/** 섹션을 평평하게 — `↑/↓` 는 섹션을 넘나들며 한 칸씩 움직인다(§2). */
export function flattenOptions(sections: readonly PaletteSection[]): PaletteOption[] {
  return sections.flatMap((section) => section.options);
}

/** `↑/↓` 다음 자리. 양끝에서 돌아온다. 항목이 없으면 언제나 0. */
export function stepIndex(current: number, delta: number, total: number): number {
  if (total <= 0) return 0;
  return (((current + delta) % total) + total) % total;
}

/** 선택 자리를 목록 길이 안으로 당긴다 — 질의가 바뀌어 목록이 짧아졌을 때 쓴다. */
export function clampIndex(current: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.max(current, 0), total - 1);
}

/** `aria-live` 로 읽히는 결과 수(§5). */
export function resultCountText(total: number): string {
  return total === 0 ? '결과가 없어요' : `결과 ${total}개`;
}
