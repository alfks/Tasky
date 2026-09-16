/**
 * 명령 레지스트리의 순수 연산(shortcuts R7·R8·R12).
 *
 * T-17 이 파는 이음새다: 팔레트(T-19)는 이 목록을 **읽고 그리기만** 하고, 각 기능은 자기 명령을
 * 여기 등록한다. 팔레트가 명령 목록을 직접 들고 있으면 새 기능이 생길 때마다 팔레트 파일을 고쳐야
 * 하고, 그 파일은 한 티켓의 소유라 충돌이 난다.
 */
import { throwsOnDuplicate, reportDuplicate } from '@/features/command/lib/duplicate-policy';
import type { ShortcutId } from '@/features/command/store/shortcut-catalog';

export type Command = {
  /** 전역 유일. `<feature>.<action>` 형태를 권한다. */
  id: string;
  /** 팔레트에 보이는 한국어 이름. */
  label: string;
  /** 검색에만 쓰는 별칭(R8). 라벨에 없는 말로 찾게 해 준다. */
  keywords?: readonly string[];
  /** 이 명령과 같은 일을 하는 단축키가 있으면 그 id — 팔레트가 오른쪽에 조합을 그린다. */
  shortcutId?: ShortcutId;
  /** 실행. 실패는 호출처(스토어)가 잡는다. */
  run: () => void | Promise<void>;
  /** 지금 쓸 수 있는가. 없으면 항상 참(예: 카테고리가 0개면 "새 할 일" 은 거짓). */
  when?: () => boolean;
};

export class DuplicateCommandError extends Error {
  constructor(id: string) {
    super(`명령 '${id}' 가 이미 등록돼 있습니다 — 같은 id 로 두 번 등록하면 하나가 가려집니다.`);
    this.name = 'DuplicateCommandError';
  }
}

/**
 * 여러 개를 한 번에. 하나라도 중복이면 **아무것도 등록하지 않는다**(부분 등록 상태 금지).
 *
 * 중복의 처리는 단축키와 같다 — `strict` 면 던지고, 아니면 기록만 남기고 먼저 등록된 쪽을
 * 유지한다(`lib/duplicate-policy.ts`). 이 등록도 `useEffect` 안에서 일어나므로 프로덕션에서
 * 던지면 앱 전체가 하얘진다.
 */
export function addCommands(
  list: readonly Command[],
  commands: readonly Command[],
  strict: boolean = throwsOnDuplicate(),
): Command[] {
  const ids = new Set(list.map((command) => command.id));
  for (const command of commands) {
    if (ids.has(command.id)) {
      const error = new DuplicateCommandError(command.id);
      if (strict) throw error;
      reportDuplicate(error);
      return [...list];
    }
    ids.add(command.id);
  }
  return [...list, ...commands];
}

/** 등록 해제. 목록에 없는 id 는 조용히 무시한다(언마운트는 여러 번 올 수 있다). */
export function removeCommands(list: readonly Command[], ids: readonly string[]): Command[] {
  const drop = new Set(ids);
  return list.filter((command) => !drop.has(command.id));
}

/** `when()` 을 통과한 것만. `when` 이 던지면 그 명령은 숨긴다 — 팔레트 전체가 죽는 것보다 낫다. */
export function availableCommands(list: readonly Command[]): Command[] {
  return list.filter((command) => {
    if (command.when === undefined) return true;
    try {
      return command.when();
    } catch {
      return false;
    }
  });
}

/** R8 의 정규화 — 공백 제거 + 소문자. 한글 초성 검색은 하지 않는다(범위 밖). */
export function normalizeQuery(query: string): string {
  return query.replace(/\s+/g, '').toLowerCase();
}

/**
 * 부분 일치 검색(R8). 라벨 접두 일치 → 라벨 부분 일치 → 키워드 일치 순으로 앞세운다.
 * 빈 질의는 **정렬하지 않고 그대로** 돌려준다(최근 실행 순서는 호출처가 얹는다 — R12).
 */
export function matchCommands(list: readonly Command[], query: string): Command[] {
  const q = normalizeQuery(query);
  if (q === '') return [...list];
  const scored: { command: Command; score: number }[] = [];
  list.forEach((command) => {
    const label = normalizeQuery(command.label);
    if (label.startsWith(q)) scored.push({ command, score: 0 });
    else if (label.includes(q)) scored.push({ command, score: 1 });
    else if ((command.keywords ?? []).some((word) => normalizeQuery(word).includes(q))) {
      scored.push({ command, score: 2 });
    }
  });
  return scored.sort((a, b) => a.score - b.score).map((entry) => entry.command);
}

/** 최근 실행 순으로 앞세운다(R12). 최근 목록에 없는 명령은 원래 순서를 지킨다. */
export function orderByRecent(list: readonly Command[], recentIds: readonly string[]): Command[] {
  const rank = new Map(recentIds.map((id, index) => [id, index]));
  const fallback = recentIds.length;
  return [...list].sort((a, b) => (rank.get(a.id) ?? fallback) - (rank.get(b.id) ?? fallback));
}

/** 최대 `limit` 개의 최근 실행 id. 방금 것이 맨 앞. */
export function pushRecent(recentIds: readonly string[], id: string, limit = 5): string[] {
  return [id, ...recentIds.filter((other) => other !== id)].slice(0, limit);
}
