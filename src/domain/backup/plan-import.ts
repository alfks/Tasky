// 가져오기 계획 (backup.md R6·R7, ADR-0009 결정 4). **병합과 교체가 같은 출구를 쓴다**:
// 둘 다 "툼스톤을 포함한 최종 전량" 하나를 만들고, 적용은 `DatasetRepository.restore()` 한 번이다.
// 그래서 원자성이 모드와 무관하고("카테고리는 들어갔는데 투두는 안 들어간" 상태가 없다) 물리 삭제로
// 사라지는 정보도 없다.
//
// **여기가 `adopt()` 의 호출처다**(ADR-0009 규칙 1). `adopt` 는 시각·`rev` 를 찍지 않으므로 파일에서 온
// 행의 `createdAt`·`updatedAt`·`rev`·`deletedAt` 이 그대로 저장된다 — 그래야 R6 의 비교 기준(더 최근
// 쪽이 이긴다)과 R2 의 왕복 동일성이 성립한다. `touch()` 를 쓰면 둘 다 무너진다.
import type { BackupDocument } from '@/domain/backup/backup-document';
import type { DatasetSnapshot, PersistableSnapshot } from '@/domain/dataset';
import type { FocusSession } from '@/domain/focus/focus-session';
import { adopt, type Meta } from '@/domain/meta';

/** 병합 = 더 최근 것을 남긴다 / 교체 = 파일로 통째로 바꾼다 (R6·R7). */
export type ImportMode = 'merge' | 'replace';

/** 결과 토스트의 "(추가 20 · 갱신 3 · 유지 289)" (R12). */
export type ImportCounts = { added: number; updated: number; kept: number };

/** 적용할 전량 + 사용자에게 보여줄 개수. */
export type ImportPlan = { snapshot: PersistableSnapshot; counts: ImportCounts };

/** 한 테이블의 병합 결과. `rows` 는 **툼스톤을 포함한** 최종 전량이다. */
export type MergeResult<T> = { rows: T[]; counts: ImportCounts };

const ZERO: ImportCounts = { added: 0, updated: 0, kept: 0 };

const sum = (parts: readonly ImportCounts[]): ImportCounts =>
  parts.reduce(
    (total, part) => ({
      added: total.added + part.added,
      updated: total.updated + part.updated,
      kept: total.kept + part.kept,
    }),
    ZERO,
  );

/** `id` 오름차순 — `readAll()` 의 순서와 같아 왕복·비교가 결정적이다. */
const byId = <T extends Meta>(rows: T[]): T[] =>
  [...rows].sort((a, b) => (a.id === b.id ? 0 : a.id < b.id ? -1 : 1));

/**
 * 병합 (R6). `local` 은 반드시 `readAll()` 결과 — **툼스톤을 포함한 전량**이다.
 * 엔티티 조회로 만들면 로컬에서 지운 항목이 "로컬에 없음" 으로 보여 파일의 옛 비삭제 버전이 부활하고,
 * 적용 시 그 툼스톤이 영구 소실된다(ADR-0009 결정 4).
 *
 * 같은 `id` 는 `updatedAt` 이 더 최근인 쪽을 남기고, **같으면 현재 데이터를 유지**한다. 소프트 삭제도
 * 같은 규칙이라 툼스톤이 더 최근이면 삭제가 유지되며, 남기기로 한 툼스톤은 결과에 그대로 실린다.
 */
export function planMerge<T extends Meta>(
  local: readonly T[],
  incoming: readonly T[],
): MergeResult<T> {
  const merged = new Map<string, T>(local.map((row) => [row.id, row]));
  let added = 0;
  let updated = 0;
  let kept = local.length;

  for (const row of incoming) {
    const current = merged.get(row.id);
    if (current === undefined) {
      merged.set(row.id, row);
      added += 1;
      continue;
    }
    if (row.updatedAt > current.updatedAt) {
      merged.set(row.id, row);
      updated += 1;
      kept -= 1;
    }
  }

  return { rows: byId([...merged.values()]), counts: { added, updated, kept } };
}

/**
 * 교체 (R7). 결과는 파일의 전량 그대로이고, 개수만 현재 데이터와 대조해 알려준다 —
 * 로컬에만 있던 항목은 사라지므로 "유지" 가 아니다(그래서 `kept` 는 항상 0 이다).
 */
function planReplace<T extends Meta>(local: readonly T[], incoming: readonly T[]): MergeResult<T> {
  const known = new Set<string>(local.map((row) => row.id));
  const updated = incoming.filter((row) => known.has(row.id)).length;
  return {
    rows: byId([...incoming]),
    counts: { added: incoming.length - updated, updated, kept: 0 },
  };
}

/**
 * 파일의 `running`/`paused` 세션을 `canceled` 로 (R6). 실행 중 세션은 앱 전체에서 1개여야 하는데
 * (timer R5) 병합은 로컬의 실행 중 세션을 그대로 두므로, 파일 쪽을 끝난 것으로 바꿔야 둘이 되지 않는다.
 * `Meta` 는 건드리지 않는다 — 시각을 다시 찍으면 병합 비교 기준이 흔들린다.
 *
 * **교체 모드에는 적용하지 않는다.** 파일 하나만 남으므로 그 안에 실행 중 세션이 하나뿐이면 규칙이
 * 이미 지켜지고, 손대지 않아야 내보내기 → 교체 가져오기 왕복이 비트 단위로 같아진다(R2).
 */
function cancelActiveSessions(sessions: readonly FocusSession[]): FocusSession[] {
  return sessions.map((session) =>
    session.status === 'running' || session.status === 'paused'
      ? { ...session, status: 'canceled' as const }
      : session,
  );
}

/** 설정은 파일 쪽이 **더 최근일 때만** 갱신한다 (R6). 교체는 무조건 파일 쪽이다 (R7). */
function chooseSettings(
  mode: ImportMode,
  local: DatasetSnapshot['settings'],
  incoming: BackupDocument['settings'],
): DatasetSnapshot['settings'] {
  if (mode === 'replace' || incoming.updatedAt > local.updatedAt) {
    return incoming;
  }
  return local;
}

/**
 * 최종 전량과 개수를 만든다. 여기서 던지면(= `adopt` 의 `Meta` 형식 검증 실패) 저장은 시작조차 하지
 * 않는다 — 계획이 전부 끝난 **뒤에** 저장이 한 번 일어나기 때문이다.
 */
export function planImport(input: {
  mode: ImportMode;
  local: DatasetSnapshot;
  document: BackupDocument;
}): ImportPlan {
  const { mode, local, document } = input;
  const plan = mode === 'merge' ? planMerge : planReplace;
  const sessions =
    mode === 'merge' ? cancelActiveSessions(document.focusSessions) : document.focusSessions;

  const categories = plan(local.categories, document.categories);
  const todos = plan(local.todos, document.todos);
  const focusSessions = plan(local.focusSessions, sessions);

  return {
    snapshot: {
      categories: categories.rows.map((row) => adopt(row)),
      todos: todos.rows.map((row) => adopt(row)),
      focusSessions: focusSessions.rows.map((row) => adopt(row)),
      settings: adopt(chooseSettings(mode, local.settings, document.settings)),
    },
    counts: sum([categories.counts, todos.counts, focusSessions.counts]),
  };
}
