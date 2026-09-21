// 가져오기 계획 (backup.md R6·R7·R12, ADR-0009 결정 4). **병합과 교체가 같은 출구를 쓴다**:
// 둘 다 "툼스톤을 포함한 최종 전량" 하나를 만들고, 적용은 `DatasetRepository.restore()` 한 번이다.
// 그래서 원자성이 모드와 무관하고("카테고리는 들어갔는데 투두는 안 들어간" 상태가 없다) 물리 삭제로
// 사라지는 정보도 없다.
//
// **여기가 `adopt()` 의 호출처다**(ADR-0009 규칙 1). `adopt` 는 시각·`rev` 를 찍지 않으므로 파일에서 온
// 행의 `createdAt`·`updatedAt`·`rev`·`deletedAt` 이 그대로 저장된다 — 그래야 R6 의 비교 기준(더 최근
// 쪽이 이긴다)과 R2 의 왕복 동일성이 성립한다. `touch()` 를 쓰면 둘 다 무너진다.
//
// 병합 **전에** 양쪽을 각각 채택하는 이유는 실패의 출처를 구분하기 위해서다(리뷰 라운드 1 Minor-4):
// 섞고 나서 채택하면 형식을 어긴 행이 파일에서 왔는지 지금 저장소에서 왔는지 알 수 없어, 멀쩡한 파일을
// 고른 사용자에게 "파일 형식이 올바르지 않아요" 가 뜬다.
import type { BackupDocument } from '@/domain/backup/backup-document';
import type { DatasetSnapshot, PersistableSnapshot } from '@/domain/dataset';
import type { FocusSession } from '@/domain/focus/focus-session';
import { adopt, isTombstone, type Meta, type Persistable } from '@/domain/meta';

/** 병합 = 더 최근 것을 남긴다 / 교체 = 파일로 통째로 바꾼다 (R6·R7). */
export type ImportMode = 'merge' | 'replace';

/** 결과 토스트의 "(추가 20 · 갱신 3 · 유지 289)" (R12). */
export type ImportCounts = { added: number; updated: number; kept: number };

/** 적용할 전량 + 사용자에게 보여줄 개수. */
export type ImportPlan = { snapshot: PersistableSnapshot; counts: ImportCounts };

/** 한 테이블의 병합 결과. `rows` 는 **툼스톤을 포함한** 최종 전량이다. */
export type MergeResult<T> = { rows: T[]; counts: ImportCounts };

/**
 * **지금 저장소**의 행이 `Meta` 형식을 어겼다 — 파일 탓이 아니다.
 * 호출부는 이것을 저장 실패 문구(§2 "가져오지 못했어요. 파일은 바뀌지 않았어요")로 바꾼다.
 * `DomainError` 를 상속하지 않는 것이 그 분기의 근거다(`src/domain/errors.ts` 는 이 티켓 소유 밖이라
 * 코드를 더하지 않는다).
 */
export class LocalSnapshotError extends Error {
  constructor(readonly reason: unknown) {
    super('LOCAL_SNAPSHOT_INVALID');
    this.name = 'LocalSnapshotError';
  }
}

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
 * 파일에서 온 행을 채택한다. 형식 위반은 `DomainError('META_FORMAT_INVALID')` 로 그대로 올라간다 —
 * 그것이 R4 의 형식 오류다.
 */
const adoptFile = <T extends Meta>(rows: readonly T[]): Persistable<T>[] => rows.map(adopt);

/** 지금 저장소에서 읽은 행을 채택한다. 실패는 파일 탓이 아니므로 표식을 바꿔 던진다. */
function adoptLocal<T extends Meta>(rows: readonly T[]): Persistable<T>[] {
  try {
    return rows.map(adopt);
  } catch (error) {
    throw new LocalSnapshotError(error);
  }
}

/**
 * 병합 (R6). `local` 은 반드시 `readAll()` 결과 — **툼스톤을 포함한 전량**이다.
 * 엔티티 조회로 만들면 로컬에서 지운 항목이 "로컬에 없음" 으로 보여 파일의 옛 비삭제 버전이 부활하고,
 * 적용 시 그 툼스톤이 영구 소실된다(ADR-0009 결정 4).
 *
 * 같은 `id` 는 `updatedAt` 이 더 최근인 쪽을 남기고, **같으면 현재 데이터를 유지**한다. 소프트 삭제도
 * 같은 규칙이라 툼스톤이 더 최근이면 삭제가 유지되며, 남기기로 한 툼스톤은 결과에 그대로 실린다.
 *
 * **개수는 파일 내용을 분해한다**(R12·§2 예시 `20+3+289 = 312`): `added`+`updated`+`kept` 는 이 표의
 * **파일 행 수**(툼스톤 제외)와 같다. `kept` 는 "파일에 있었지만 로컬 쪽이 더 최신이라 그대로 둔 행" 이다 —
 * 파일에 없는 로컬 행까지 세면 합계가 토스트 앞머리의 "카테고리 N개, 할 일 M개" 와 어긋난다
 * (리뷰 라운드 1 Minor-1 실측: 파일 1건인데 "추가 1 · 갱신 0 · 유지 5").
 */
export function planMerge<T extends Meta>(
  local: readonly T[],
  incoming: readonly T[],
): MergeResult<T> {
  const merged = new Map<string, T>(local.map((row) => [row.id, row]));
  let added = 0;
  let updated = 0;
  let kept = 0;
  // 툼스톤은 토스트 앞머리의 개수(`backupCounts`)에서도 빠지므로 여기서도 세지 않는다.
  const counted = (row: T): boolean => !isTombstone(row);

  for (const row of incoming) {
    const current = merged.get(row.id);
    if (current === undefined) {
      merged.set(row.id, row);
      if (counted(row)) added += 1;
      continue;
    }
    if (row.updatedAt > current.updatedAt) {
      merged.set(row.id, row);
      if (counted(row)) updated += 1;
    } else if (counted(row)) {
      kept += 1;
    }
  }

  return { rows: byId([...merged.values()]), counts: { added, updated, kept } };
}

/**
 * 교체 (R7). 결과는 파일의 전량 그대로이고, 개수만 현재 데이터와 대조해 알려준다 —
 * 로컬에만 있던 항목은 사라지므로 "유지" 가 아니다(그래서 `kept` 는 항상 0 이다).
 * 사라지는 양은 실행 **전에** 다이얼로그가 "지금 있는 카테고리 N개 · 할 일 M개가 사라져요" 로 보여준다.
 */
function planReplace<T extends Meta>(local: readonly T[], incoming: readonly T[]): MergeResult<T> {
  const known = new Set<string>(local.map((row) => row.id));
  const live = incoming.filter((row) => !isTombstone(row));
  const updated = live.filter((row) => known.has(row.id)).length;
  return {
    rows: byId([...incoming]),
    counts: { added: live.length - updated, updated, kept: 0 },
  };
}

/**
 * 실행 중(`running`/`paused`) 세션을 **최대 1개**로 줄인다 (R6, timer R5).
 *
 * 병합은 로컬의 실행 중 세션을 그대로 두므로 파일 쪽을 전부 끝난 것으로 바꾼다(R6 문면).
 * 교체는 파일 하나만 남지만 **파일은 신뢰할 수 없는 입력**이라 실행 중 세션이 2개 이상일 수 있다
 * (리뷰 라운드 1 Minor-8 실측: `running,paused` 가 그대로 들어갔다). 그래서 가장 최근 것 하나만 남기고
 * 나머지를 `canceled` 로 바꾼다 — 우리가 내보낸 파일은 애초에 실행 중 세션이 1개 이하라 왕복 동일성은
 * 그대로다. 대가는 "실행 중 세션이 2개인 손상 파일" 에서만 왕복이 달라지는 것이고, 그쪽은 살려 둘 값이
 * 아니다. `Meta` 는 건드리지 않는다 — 시각을 다시 찍으면 병합 비교 기준이 흔들린다.
 */
function limitActiveSessions(sessions: readonly FocusSession[], keepOne: boolean): FocusSession[] {
  const isActive = (session: FocusSession): boolean =>
    session.status === 'running' || session.status === 'paused';
  const survivor = keepOne
    ? sessions
        .filter(isActive)
        .reduce<FocusSession | null>(
          (best, session) => (best === null || session.updatedAt > best.updatedAt ? session : best),
          null,
        )
    : null;
  return sessions.map((session) =>
    isActive(session) && session.id !== survivor?.id
      ? { ...session, status: 'canceled' as const }
      : session,
  );
}

/** 설정은 파일 쪽이 **더 최근일 때만** 갱신한다 (R6). 교체는 무조건 파일 쪽이다 (R7). */
function chooseSettings(
  mode: ImportMode,
  local: Persistable<DatasetSnapshot['settings']>,
  incoming: Persistable<BackupDocument['settings']>,
): Persistable<DatasetSnapshot['settings']> {
  if (mode === 'replace' || incoming.updatedAt > local.updatedAt) {
    return incoming;
  }
  return local;
}

/**
 * 최종 전량과 개수를 만든다. 여기서 던지면(= `adopt` 의 `Meta` 형식 검증 실패) 저장은 시작조차 하지
 * 않는다 — 계획이 전부 끝난 **뒤에** 저장이 한 번 일어나기 때문이다.
 *
 * 개수는 **카테고리 + 할 일**만 센다. 토스트 앞머리가 그 둘만 말하므로(§2) 세션까지 더하면 합계가
 * 앞머리와 맞지 않고, 세션 개수는 화면 어디에도 없어 사용자가 대조할 수 없다.
 */
export function planImport(input: {
  mode: ImportMode;
  local: DatasetSnapshot;
  document: BackupDocument;
}): ImportPlan {
  const { mode, local, document } = input;
  const plan = mode === 'merge' ? planMerge : planReplace;
  const sessions = limitActiveSessions(document.focusSessions, mode === 'replace');

  const categories = plan(adoptLocal(local.categories), adoptFile(document.categories));
  const todos = plan(adoptLocal(local.todos), adoptFile(document.todos));
  const focusSessions = plan(adoptLocal(local.focusSessions), adoptFile(sessions));
  const ddays = plan(adoptLocal(local.ddays), adoptFile(document.ddays));
  // 리뷰 #108 Minor 1 — 알려진 한계, 고치지 않고 **결정만** 남긴다: `diaryEntries` 는 일반 `planMerge`
  // 를 그대로 쓴다(id 단위 newer-wins). 그런데 diary R1("하루 1개")은 `id` 가 아니라 `date` 단위
  // 유일성이라, id 가 다른 두 행이 같은 날짜를 가리키는 경우를 이 병합이 못 막는다 — 재현 경로: A 가
  // 어떤 날짜의 기록을 지우고 새로 쓴 뒤(새 id) 내보내면(export 는 todos 와 같이 diaryEntries 도
  // 툼스톤을 안 싣는다, `export-backup.ts`), 그 옛 기록을 아직 갖고 있는 B 와 병합하면 **같은 날짜에
  // 살아 있는 두 행**이 남는다. `getByDate`(`diary.rules.ts#compareDiaryEntries`, createdAt 이른
  // 쪽)가 결정적으로 하나만 골라 화면에서는 조용히 숨지만, DB 에는 두 행이 영구히 남고 `list()`·향후
  // 동기화에서 드러난다. 고치려면 라우틴처럼 date 단위로 묶어 패자를 **소프트 삭제**해야 하는데, 그
  // 삭제에는 `touch()` 가 찍을 시각(`now`)이 필요하고 `planImport` 는 지금 순수 함수라 그 입력이
  // 없다 — 시그니처를 늘리는 일이라 이번 라운드는 결정만 기록하고 후속으로 넘긴다.
  const diaryEntries = plan(adoptLocal(local.diaryEntries), adoptFile(document.diaryEntries));
  // 루틴은 이제 다른 테이블과 같은 일반 newer-wins(`plan`)를 쓴다(ADR-0018) — `fillFloor` 는 오직
  // 사용자 조작(생성·재개)으로만 바뀌는 필드라 전용 병합(구 `planMergeRoutines`, max 고정)이 더
  // 필요 없다. `routine.rules.ts`·`ROUTINE_KEYS` 주석 참고.
  const routines = plan(adoptLocal(local.routines), adoptFile(document.routines));

  return {
    snapshot: {
      categories: categories.rows,
      todos: todos.rows,
      focusSessions: focusSessions.rows,
      settings: chooseSettings(
        mode,
        adoptLocal([local.settings])[0],
        adoptFile([document.settings])[0],
      ),
      ddays: ddays.rows,
      diaryEntries: diaryEntries.rows,
      routines: routines.rows,
    },
    counts: sum([categories.counts, todos.counts]),
  };
}
