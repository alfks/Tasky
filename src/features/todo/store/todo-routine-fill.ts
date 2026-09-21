// 루틴 등록·되돌리기(routine.md R2~R5, R21 확장) + 지연 생성 배선(R6). `todo-actions.ts` 가 300줄
// 제한(code-style §5)을 넘겨 이 파일로 뗐다 — 루틴 관리(중지·재개·삭제)는 `todo-routine-manage.ts`.
//
// **등록은 이제 `Routine` 레코드를 항상 저장한다**(R5, R21과의 핵심 차이). 종료일이 있든 없든
// `createRoutineRule` 이 레코드를 만들고, `planRoutineFill`(ADR-0018 `fillFloor`)이 그 구간의 투두를
// 계획한다. 즉시 채우기(등록 시점, R3·R4)와 지연 생성(방문 시점, R6)은 **같은 계산**을 쓴다 — 구간만
// 다르다(등록은 `resolveImmediateFillThrough`, 방문은 날짜 스트립이 새로 연 범위).
//
// **`fillFloor` 는 얼려 둔다**(ADR-0018 §결정 3) — 배경 채우기(`planMaterializeRoutines`)는 루틴
// 로우를 쓰지 않는다. 대신 재방문마다 같은 구간을 다시 훑고(비용은 `FILL_BACKFILL_HORIZON_DAYS` 가
// 상한을 둔다), 중복·부활 방지는 `SyncRepository.existingIds`(툼스톤 포함 벌크 조회)로 한다 —
// `candidateFillDates` 로 `planRoutineFill` 과 같은 날짜 후보를 얻어 슬롯 id 로 바꾼 뒤 묻는다.
import type { DatasetWrite } from '@/domain/dataset';
import { addCivilDays } from '@/domain/date/civil';
import type { DateKey } from '@/domain/date/date-key';
import type { CategoryId, RoutineId, TodoId } from '@/domain/ids';
import type { Persistable } from '@/domain/meta';
import type { Routine } from '@/domain/routine/routine';
import {
  candidateFillDates,
  FILL_BACKFILL_HORIZON_DAYS,
  planRoutineFill,
  resolveImmediateFillThrough,
} from '@/domain/routine/routine-fill';
import {
  createRoutine as createRoutineRule,
  deleteRoutine as deleteRoutineRule,
} from '@/domain/routine/routine.rules';
import { routineInstanceSlotId } from '@/domain/routine/slot-id';
import type { RoutineRecurrence } from '@/domain/todo/routine.rules';
import type { Todo } from '@/domain/todo/todo';
import { deleteTodo, normalizeTodoTitle } from '@/domain/todo/todo.rules';

import { getRepositories, type Repositories } from '@/repositories/container';

import {
  withoutRoutine,
  withoutTodo,
  withRoutines,
  withTodos,
} from '@/features/todo/store/todo-state';
import type { TodoContext, TodoWriter, TodoWritesPlan } from '@/features/todo/store/todo-writes';

/** 지연 생성(R6)이 한 번에 내다보는 최대 구간. 무기한·매일 루틴도 한 번의 방문이 이 안에서 끝난다. */
export const MATERIALIZE_HORIZON_DAYS = 366;

/** 루틴 등록·되돌리기·지연 생성 세 액션. `TodoActions`(`todo-actions.ts`)가 그대로 펼쳐 넣는다. */
export type RoutineFillActions = {
  /**
   * 루틴 등록 (routine.md R2~R5, R21 확장): `Routine` 레코드를 저장하고 그 구간(종료일이 있으면
   * 전체, 없으면 지금 보이는 범위 끝까지, R3)을 즉시 채운다. 결과가 0건이어도(R4) 레코드는
   * 저장된다 — 실패가 아니다. 성공하면 실제로 만든 투두들의 id 를 돌려준다.
   */
  createRoutine: (input: {
    categoryId: CategoryId;
    title: string;
    memo?: string;
    startDate: DateKey;
    /** 없으면 무기한(R2) — 이 경우에만 이후 R6 지연 생성이 의미가 있다. */
    endDate?: DateKey;
    recurrence: RoutineRecurrence;
  }) => Promise<TodoId[] | false>;
  /**
   * 등록 되돌리기 (R21 확장): 방금 만든 인스턴스와 **그 루틴 레코드 자체**를 함께 지운다 — 인스턴스만
   * 지우고 레코드를 남기면 다음 방문에 R6 가 그대로 다시 채워 "되돌리기"가 거짓말이 된다.
   */
  undoRoutine: (ids: readonly TodoId[]) => Promise<boolean>;
  /**
   * 지연 생성 배선 (R6): 날짜 스트립이 새 범위를 열 때마다 부른다(`DateStrip.onVisibleRange` →
   * `ShellHeader`). 무기한 루틴 중 워터마크가 `to` 에 못 미친 것만 그 구간을 채운다. 채울 것이
   * 없으면(보통의 경우) 저장소에 쓰지 않고 조회만으로 끝난다.
   *
   * `revision` 은 낭비 방지 캐시(아래 `createRoutineFillActions`)의 무효화 근거다. **셸이 이미
   * 합산해 둔 값**(`writeRevision + dataRevision`, `ShellHeader#useSummaryRevision`)을 넘긴다 —
   * `todo` 스토어 혼자서는 `dataRevision`(백업 가져오기)을 모르고, `@/features/backup` 을 직접
   * 구독하면 순환이 된다(리뷰 m2: 캐시가 `writeRevision` 만 보면 가져오기 뒤 재확인이 늦어져
   * `src/features/backup/index.ts` 의 "자기 데이터를 캐시해 둔 화면은 `dataRevision` 을 구독한다"
   * 규약과 어긋난다). 생략하면(스토어 단위 테스트 등) `writeRevision` 단독으로 대신한다.
   */
  materializeRoutines: (input: {
    from: DateKey;
    to: DateKey;
    today: DateKey;
    revision?: number;
  }) => Promise<boolean>;
};

/**
 * `existing`(그 구간의 살아 있는 투두) 중 같은 날짜·카테고리·정규화된 제목이 루틴과 겹치면(R4·R21
 * dedup — 사용자가 직접 만든 투두 포함, 실제 id 는 슬롯 id 가 아닐 수 있다) 그 날짜의 **슬롯 id 를
 * 대신 채워 넣는다** — `planRoutineFill` 은 멤버십만 보므로 이렇게 하면 실제 id 가 달라도 그 슬롯을
 * "이미 있다" 로 판정해 건너뛴다. **슬롯 id 자체의 존재 여부(F1·부활 방지)는 여기서 보지 않는다** —
 * 그건 `SyncRepository.existingIds`(툼스톤 포함)가 권위 있게 답한다(호출부).
 */
function titleDedupIds(routine: Routine, existing: readonly Todo[]): Set<string> {
  const title = normalizeTodoTitle(routine.title);
  const ids = new Set<string>();
  for (const todo of existing) {
    if (todo.categoryId === routine.categoryId && normalizeTodoTitle(todo.title) === title) {
      ids.add(routineInstanceSlotId(routine.id, todo.date));
    }
  }
  return ids;
}

/** `routines` 각각의 채울 후보 날짜를 슬롯 id로 바꿔 한 번에 `SyncRepository.existingIds`(툼스톤
 * 포함)에 묻는다 — 루틴별로 따로 왕복하지 않는다. 후보가 없으면 저장소를 아예 안 부른다. */
async function tombstoneInclusiveIds(
  routines: readonly Routine[],
  through: DateKey,
  today: DateKey | undefined,
): Promise<ReadonlySet<string>> {
  const candidateIds = routines.flatMap((routine) =>
    candidateFillDates(routine, through, today).map((date) => routineInstanceSlotId(routine.id, date)),
  );
  if (candidateIds.length === 0) {
    return new Set();
  }
  return getRepositories().sync.existingIds('todos', candidateIds);
}

/** 종료일 있는 등록도 포함해 **항상** `Routine` 레코드를 만들고, 그 구간을 즉시 채운다(R3~R5). */
async function planCreateRoutine(
  ctx: TodoContext,
  input: {
    categoryId: CategoryId;
    title: string;
    memo?: string;
    startDate: DateKey;
    endDate?: DateKey;
    recurrence: RoutineRecurrence;
  },
): Promise<{ plan: TodoWritesPlan | null; createdIds: TodoId[] }> {
  const routine = createRoutineRule(
    {
      title: input.title,
      memo: input.memo,
      categoryId: input.categoryId,
      recurrence: input.recurrence,
      startDate: input.startDate,
      endDate: input.endDate,
    },
    ctx.deps,
  );
  const visibleRangeEnd = ctx.get().visibleRange?.to ?? input.startDate;
  const through = resolveImmediateFillThrough({
    startDate: input.startDate,
    endDate: input.endDate,
    visibleRangeEnd,
  });
  // 새 루틴이라 그 슬롯 id 는 아직 존재하지 않는 로우와 겹칠 수 없다(방금 만든 routine.id 라 서버·
  // 다른 기기가 먼저 알 수 없다) — `SyncRepository.existingIds` 를 물을 필요가 없다. 같은 제목의
  // 투두를 먼저 만들어 둔 경우(리뷰 Major 1 픽스처, R4·R21 dedup)만 살아 있는 로우로 잡는다.
  const existing = await getRepositories().todos.listByDateRange(input.startDate, through);
  const existingIds = titleDedupIds(routine, existing);
  const filled = planRoutineFill({ routine, through, existingIds, siblings: existing }, ctx.deps);
  // `through >= startDate` 는 `resolveImmediateFillThrough` 가 늘 보장하고 `routine.active` 는 방금
  // 만든 레코드라 항상 true 다 — `planRoutineFill` 이 null 을 돌려줄 조건이 성립하지 않는다. 그래도
  // 시그니처가 `| null` 이라 방어적으로만 다룬다(대상 없음과 같은 취급 — 저장하지 않고 실패).
  if (filled === null) {
    return { plan: null, createdIds: [] };
  }
  // **종료일이 있는데 0건이면 Routine 레코드를 아예 안 쓴다**(중복 검사를 저장 전에 끝낸다 —
  // 리뷰 Major 1). R21 그대로 이 경우는 "전부 이미 등록돼 있다" 오류지 등록이 아니다 — 오류인데
  // 레코드만 남으면 관리 화면(T-83) 없이는 지울 방법이 없는 유령 레코드가 된다. 무기한(endDate
  // undefined)은 R4·R5 그대로 0건도 성공이라 이 분기를 타지 않는다 — 아래에서 항상 저장한다.
  if (input.endDate !== undefined && filled.todos.length === 0) {
    return { plan: { writes: [], apply: () => ({}) }, createdIds: [] };
  }
  const writes: DatasetWrite[] = [
    ...filled.todos.map((entity) => ({ table: 'todos' as const, entity })),
    { table: 'routines' as const, entity: routine },
  ];
  return {
    plan: {
      writes,
      apply: (state) => {
        const visible = filled.todos.filter((todo) => todo.date === state.date);
        return {
          byId: visible.length === 0 ? state.byId : withTodos(state.byId, visible),
          routines: withRoutines(state.routines, [routine]),
        };
      },
    },
    createdIds: filled.todos.map((todo) => todo.id),
  };
}

/** 인스턴스들과 그 루틴 레코드(들)를 함께 지우는 계획을 짠다. 이미 없는 id 는 조용히 건너뛴다. */
async function planUndoRoutine(ctx: TodoContext, ids: readonly TodoId[]): Promise<TodoWritesPlan> {
  const found = await Promise.all(ids.map((id) => getRepositories().todos.getById(id)));
  const todos = found.filter((todo): todo is Todo => todo !== undefined);
  if (todos.length === 0) {
    return { writes: [], apply: () => ({}) };
  }
  const deletedTodos = todos.map((todo) => deleteTodo(todo, ctx.deps));
  const routineIds = new Set(
    todos.map((todo) => todo.routineId).filter((id): id is RoutineId => id !== undefined),
  );
  const foundRoutines = await Promise.all(
    [...routineIds].map((id) => getRepositories().routines.getById(id)),
  );
  const deletedRoutines = foundRoutines
    .filter((routine): routine is Routine => routine !== undefined)
    .map((routine) => deleteRoutineRule(routine, ctx.deps));
  const writes: DatasetWrite[] = [
    ...deletedTodos.map((entity) => ({ table: 'todos' as const, entity })),
    ...deletedRoutines.map((entity) => ({ table: 'routines' as const, entity })),
  ];
  return {
    writes,
    apply: (state) => ({
      byId: deletedTodos.reduce((acc, todo) => withoutTodo(acc, todo.id), state.byId),
      routines: deletedRoutines.reduce(
        (acc, routine) => withoutRoutine(acc, routine.id),
        state.routines,
      ),
    }),
  };
}

/**
 * 지연 생성(R6) 계획: 무기한·활성 루틴 중 살아 있는 카테고리를 가리키는 것만 채운다.
 *
 * **루틴 로우를 쓰지 않는다**(ADR-0018 §결정 3) — `fillFloor` 가 얼어 있으므로 `due` 판정은 매
 * 방문마다 같은 루틴을 다시 고를 수 있다(재스캔, `FILL_BACKFILL_HORIZON_DAYS` 가 비용 상한). 중복
 * 생성·부활 방지는 `SyncRepository.existingIds`(툼스톤 포함)로 한다 — `tombstoneInclusiveIds` 가
 * `due` 전체의 후보 슬롯 id 를 한 번에 묻는다.
 */
async function planMaterializeRoutines(
  ctx: TodoContext,
  input: { to: DateKey; today: DateKey },
): Promise<TodoWritesPlan> {
  const { routines, todos, categories } = getRepositories();
  const [all, liveCategories] = await Promise.all([
    routines.list({ includeInactive: true }), // 관리(T-83)·🔁 배지가 함께 읽는 상태를 여기서 채운다.
    categories.list(),
  ]);
  const horizon = addCivilDays(input.today, MATERIALIZE_HORIZON_DAYS);
  const through = input.to < horizon ? input.to : horizon;
  const liveIds = new Set(liveCategories.map((category) => category.id));
  const due = all.filter(
    (routine) => routine.active && liveIds.has(routine.categoryId) && routine.fillFloor < through,
  );
  if (due.length === 0) {
    // 조회 2회, 쓰기 0회로 끝나는 보통의 경우(R6) — 그래도 state.routines 는 최신으로 맞춘다.
    return { writes: [], apply: (state) => ({ routines: withRoutines(state.routines, all) }) };
  }

  // 뒤로 훑는 길이는 지평선(`FILL_BACKFILL_HORIZON_DAYS`)에서 잘린다 — `planRoutineFill`·
  // `candidateFillDates` 내부 계산과 같은 값이어야 쿼리 범위와 실제로 채우는 범위가 어긋나지 않는다.
  const backfillFloor = addCivilDays(input.today, -FILL_BACKFILL_HORIZON_DAYS);
  const fillFrom = due
    .map((routine) => {
      const earliest = addCivilDays(routine.fillFloor, 1);
      return backfillFloor > earliest ? backfillFloor : earliest;
    })
    .sort()[0] as DateKey;
  const [existing, tombstoneInclusive] = await Promise.all([
    todos.listByDateRange(fillFrom, through),
    tombstoneInclusiveIds(due, through, input.today),
  ]);
  const created: Persistable<Todo>[] = [];
  const writes: DatasetWrite[] = [];
  for (const routine of due) {
    // 이미 이 호출에서 채운 것(created)도 같이 넣어야, 같은 배치의 다른 루틴과 카테고리·제목이
    // 겹칠 때(R4·R21 dedup) 서로를 본다 — `existing` 만 보면 배치 안에서는 안 걸린다.
    const priorTodos = [...existing, ...created];
    const existingIds = new Set(tombstoneInclusive);
    for (const id of titleDedupIds(routine, priorTodos)) {
      existingIds.add(id);
    }
    const plan = planRoutineFill(
      { routine, through, today: input.today, existingIds, siblings: priorTodos },
      ctx.deps,
    );
    if (plan === null) continue;
    created.push(...plan.todos);
    writes.push(...plan.todos.map((entity) => ({ table: 'todos' as const, entity })));
  }
  return {
    writes,
    apply: (state) => ({
      byId: withTodos(
        state.byId,
        created.filter((todo) => todo.date === state.date),
      ),
      routines: withRoutines(state.routines, all),
    }),
  };
}

export function createRoutineFillActions(ctx: TodoContext, writer: TodoWriter): RoutineFillActions {
  // 낭비 방지 캐시(리뷰 Major 2): 이미 확인을 마친 `to`(와 그 시점의 `revision`)를 기억해 뒀다가,
  // 그 뒤로 아무 일도 없었는데 같은 범위(또는 더 좁은 범위)를 다시 열면 저장소를 아예 안 읽는다.
  // `revision` 이 과도하게 자주 오르는 값이어도(루틴이 아닌 투두 쓰기에도 오른다) 안전하다 — 그때는
  // 그냥 한 번 더 읽을 뿐이다. 위험한 방향은 그 반대(무효화를 놓치는 것)뿐인데, 루틴 쓰기(등록·
  // 중지·재개·삭제)는 전부 `commitWrites` 를 거쳐 `writeRevision` 을 올리고, 백업 가져오기는 호출부
  // (`ShellHeader`)가 넘기는 `revision` 인자에 `dataRevision` 을 함께 합산해 둔다(리뷰 m2).
  //
  // **저장소 참조도 함께 기억한다.** 이 캐시는 스토어 인스턴스(클로저)와 함께 사는데, `setRepositories`
  // 로 저장소가 통째로 바뀌면(테스트의 매 `beforeEach`, 실서비스라면 메모리 폴백 전환 등) 예전
  // 저장소를 보고 세운 워터마크 판정이 새 저장소에는 안 맞는다 — 참조가 같을 때만 캐시를 믿는다.
  let lastHandled: { to: DateKey; revisionAtCheck: number; repos: Repositories } | null = null;

  return {
    createRoutine: async (input) => {
      let createdIds: TodoId[] = [];
      const ok = await writer.commitWrites(async () => {
        const { plan, createdIds: ids } = await planCreateRoutine(ctx, input);
        createdIds = ids;
        return plan;
      });
      return ok ? createdIds : false;
    },

    undoRoutine: (ids) => writer.commitWrites(() => planUndoRoutine(ctx, ids)),

    materializeRoutines: ({ from, to, today, revision }) => {
      // 다음 등록(`createRoutine`)의 R3 "보이는 범위 끝" 이 이 값을 읽는다 — 쓰기 큐 밖에서 즉시
      // 반영해야, 이 호출이 아직 큐를 기다리는 중이어도 그 사이의 등록이 최신 범위를 본다.
      ctx.set({ visibleRange: { from, to } });

      const currentRevision = revision ?? ctx.get().writeRevision;
      const currentRepos = getRepositories();
      const cached = lastHandled;
      if (
        cached !== null &&
        cached.repos === currentRepos &&
        to <= cached.to &&
        currentRevision === cached.revisionAtCheck
      ) {
        return Promise.resolve(true); // 이미 이 구간까지 확인했고 그 뒤로 아무 일도 없었다.
      }

      return writer
        .commitWrites(() => planMaterializeRoutines(ctx, { to, today }))
        .then((ok) => {
          if (ok) {
            lastHandled = {
              to,
              revisionAtCheck: revision ?? ctx.get().writeRevision,
              repos: currentRepos,
            };
          } else {
            // 지연 생성은 조용해야 한다(routine.md R6 "토스트 없음") — 사용자가 한 일은 "날짜 이동"
            // 이지 "루틴 만들기"가 아니므로, 이 배경 작업의 실패가 방금 사용자가 한 다른 쓰기의 성공
            // 문구를 덮거나 없던 실패 토스트를 새로 띄우면 안 된다(리뷰 m1). `commitWrites` 가 실패
            // 시 채운 `error` 를 다음 렌더가 커밋되기 전에 비운다.
            ctx.set({ error: null });
          }
          return ok;
        });
    },
  };
}
