'use client';

// 루틴 관리 화면 **본문** (routine.md §2 관리 화면, R7·R7-a·R10·R12-b·R13). 사이드바 진입점
// (`RoutineManager`)이 열 때만 마운트한다. 파일을 가른 것은 길이(컴포넌트 200줄) 때문이지 지연 로드
// 때문이 아니다 — 왜 `lazy()` 가 아닌지는 `RoutineManager.tsx` 머리 주석(실측 수치).
//
// **순수 UI 다.** 액션은 전부 `useTodoActions` 의 loadRoutines·pauseRoutine·resumeRoutine·removeRoutine·
// reorderRoutine 을 부르기만 한다 — 여기서 새로 계산하는 것은 정렬·빈 상태 판정·드롭 좌표뿐이다. 목록
// 구조(손잡이 + 행 + `⋯` 메뉴, 빈 상태 + 추가 버튼, 낭독)는 category.md §2-A(`CategoryList`)를 그대로
// 본떴다.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';

import type { Category } from '@/domain/category/category';
import type { DateKey } from '@/domain/date/date-key';
import type { RoutineId } from '@/domain/ids';
import { createMeta } from '@/domain/meta';
import type { Routine } from '@/domain/routine/routine';
import { compareRoutines } from '@/domain/routine/routine.rules';
import type { Todo } from '@/domain/todo/todo';

import { useDateStripStore } from '@/features/date-strip';
import { movedAnnouncement } from '@/features/todo/components/routine-drag';
import { RoutineDialog } from '@/features/todo/components/RoutineDialog';
import { RoutineManagerRow } from '@/features/todo/components/RoutineManagerRow';
import { useTodoActions } from '@/features/todo/hooks/useTodoActions';
import { useTodoStore } from '@/features/todo/store/todo-store';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Skeleton } from '@/components/ui/Skeleton';

import { nowIso } from '@/lib/date';
import { isAfterMidpoint, moveTargetIndex } from '@/lib/drag-order';
import { newId } from '@/lib/id';

type RoutineManagerDialogProps = {
  /** `TodoItem` 이 받는 것과 같은 목록(활성 + 종료, 삭제된 것 제외) — `RoutineManager` 주석 참고. */
  categories: readonly Category[];
  onClose: () => void;
  /** `⋯ → 삭제` 를 누른 순간, 아직 살아 있는 행에서 자리표를 뜬다(app-shell R14). */
  captureRemovalFocus?: () => void;
  /** 그 행이 사라진 뒤 대체 포커스 대상(`⋯` 가 이미 사라졌을 때만 쓰인다). */
  removalReturnFocus?: () => HTMLElement | null;
};

/**
 * "+ 루틴 추가"(R12-b) 가 여는 `RoutineDialog` 에 넘길 빈 기본값 자리표시 `Todo`. 그 다이얼로그는
 * 초기값을 뽑을 뿐 저장하지 않는다 — 그래도 메타 필드는 `createMeta()` 로만 만든다(ADR-0007).
 */
function blankTodo(categoryId: string, date: DateKey): Todo {
  return createMeta<Todo>(
    { now: nowIso, id: newId },
    { categoryId, date, title: '', done: false, order: 0 },
  );
}

/**
 * 순서 변경 배선(R13): 드래그 드롭 좌표 → 인덱스, `Alt+↑/↓` → 이웃 인덱스, 둘 다 같은 저장 액션과
 * 같은 낭독 문면으로 끝난다. 낭독은 **저장이 실제로 일어났을 때만** 한다.
 */
function useRoutineReorder(routines: readonly Routine[], today: DateKey) {
  const { reorderRoutine } = useTodoActions();
  const [announcement, setAnnouncement] = useState('');
  const [draggingId, setDraggingId] = useState<RoutineId | null>(null);

  const moveTo = (routine: Routine, index: number): void => {
    void reorderRoutine(routine.id, index, today).then((moved) => {
      if (moved) setAnnouncement(movedAnnouncement(routine.title, index));
    });
  };

  const handleDropOn = (overId: RoutineId, event: ReactDragEvent<HTMLElement>): void => {
    const dragged = draggingId;
    const rect = event.currentTarget.getBoundingClientRect();
    setDraggingId(null);
    if (dragged === null) return;
    const index = moveTargetIndex(
      routines.map((routine) => routine.id),
      dragged,
      overId,
      isAfterMidpoint(rect, event.clientY),
    );
    const routine = routines.find((candidate) => candidate.id === dragged);
    if (index === null || routine === undefined) return;
    moveTo(routine, index);
  };

  const handleMove = (routine: Routine, direction: -1 | 1): void => {
    const from = routines.findIndex((candidate) => candidate.id === routine.id);
    const to = from + direction;
    // 양끝에서 더 갈 곳이 없으면 아무것도 저장하지 않고 낭독도 없다 — 바뀐 게 없으니 할 말이 없다.
    if (from === -1 || to < 0 || to >= routines.length) return;
    moveTo(routine, to);
  };

  return {
    announcement,
    drag: { draggingId, onDragChange: setDraggingId, onDropOn: handleDropOn },
    handleMove,
  };
}

export function RoutineManagerDialog({
  categories,
  onClose,
  captureRemovalFocus,
  removalReturnFocus,
}: RoutineManagerDialogProps) {
  const [creating, setCreating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const routineMap = useTodoStore((state) => state.routines);
  const status = useTodoStore((state) => state.routineStatus);
  const storeError = useTodoStore((state) => state.error);
  const { loadRoutines, pauseRoutine, resumeRoutine, removeRoutine } = useTodoActions();
  const today = useDateStripStore((state) => state.today);

  // 열릴 때(= 이 컴포넌트가 마운트될 때) 다시 읽는다(T-81 주석: "자동 로드 없음") — 항목 메뉴의
  // "루틴으로 등록"(routine.md R12-a)이 그사이 새 루틴을 만들었을 수 있어, 열 때마다 최신값을 보장한다.
  useEffect(() => {
    void loadRoutines();
  }, [loadRoutines]);

  // `error` 는 투두 쓰기 실패와 공유하는 필드다(`todo-state.ts`) — `TodoList` 의 효과가 먼저 읽고
  // 지울 수 있어, 적재 실패 문구는 `routineStatus` 가 'error' 로 바뀌는 순간의 값을 스냅샷해 둔다.
  useEffect(() => {
    if (status === 'error') setLoadError(storeError);
    else if (status === 'ready') setLoadError(null);
  }, [status, storeError]);

  const routines = Object.values(routineMap).sort(compareRoutines);
  const { announcement, drag, handleMove } = useRoutineReorder(routines, today);
  const indefiniteCount = routines.filter((routine) => routine.endDate === undefined).length;
  const loading = status === 'loading';
  const categoryOf = (id: string): Category | undefined =>
    categories.find((category) => category.id === id);
  const defaultCategoryId = categories[0]?.id;
  // 렌더마다 새로 만들면 쓰이지도 않을 `id()`/`now()` 를 매번 버린다 — 실제 입력이 바뀔 때만 다시 만든다.
  const newRoutineTodo = useMemo(
    () => (defaultCategoryId === undefined ? null : blankTodo(defaultCategoryId, today)),
    [defaultCategoryId, today],
  );

  /**
   * 삭제 뒤 포커스(app-shell R14). 자리표는 **메뉴가 열릴 때**(`onOpenMenu`) 이미 떠 있다 — 여기서
   * 다시 뜨면 `document.activeElement` 가 포털된 메뉴 항목이라 `closest('li')` 가 실패한다(실측).
   * 이동은 타이밍을 추측하지 않고 **목록이 실제로 줄어든 렌더** 다음에만 한다(아래 효과) — 깃발은
   * 쓰기 **전에** 세운다(`commitWrites` 는 `await` 가 돌아오기 전에 이미 스토어를 바꾼다). 단일
   * 플래그라 삭제 두 건이 한 커밋에 겹치면 두 번째 이동이 소실되지만 메뉴는 한 번에 하나만 청한다.
   * 마지막 루틴을 지워 목록이 비면 `removalReturnFocus` 가 `null` 이라 "+ 루틴 추가" 로 떨어진다
   * (모달 안이라 사이드바 `nav` 폴백은 닿지 않는다) — 그래도 `<body>` 는 아니다.
   */
  const focusAfterRemovalRef = useRef(false);
  const routineCountRef = useRef(routines.length);
  const handleRemove = async (id: RoutineId): Promise<void> => {
    focusAfterRemovalRef.current = true;
    const ok = await removeRoutine(id);
    if (!ok) focusAfterRemovalRef.current = false;
  };
  useEffect(() => {
    if (focusAfterRemovalRef.current && routines.length < routineCountRef.current) {
      focusAfterRemovalRef.current = false;
      (removalReturnFocus?.() ?? addButtonRef.current)?.focus();
    }
    routineCountRef.current = routines.length;
  }, [routines.length, removalReturnFocus]);

  return (
    <Dialog open onClose={onClose} title="루틴" className="max-w-[440px]">
      <div className="flex flex-col gap-[var(--space-3)]">
        {loading ? (
          <div aria-busy="true" className="flex flex-col gap-[var(--space-2)]">
            <Skeleton className="h-[var(--control-height)]" />
            <Skeleton className="h-[var(--control-height)]" />
          </div>
        ) : (
          <>
            {/* 종료일 있는 기록만 있어도 여기 세지 않는다(routine.md §2 상태 — 기록은 아래 목록에 그대로 보인다). */}
            {indefiniteCount === 0 ? (
              <p className="text-base text-muted">아직 계속 반복되는 루틴이 없어요</p>
            ) : null}
            <ul className="flex flex-col gap-[var(--space-1)]">
              {routines.map((routine) => (
                <RoutineManagerRow
                  key={routine.id}
                  routine={routine}
                  category={categoryOf(routine.categoryId)}
                  onPause={() => void pauseRoutine(routine.id)}
                  onResume={() => void resumeRoutine(routine.id, today)}
                  onRemove={() => void handleRemove(routine.id)}
                  onMove={(direction) => handleMove(routine, direction)}
                  drag={drag}
                  onOpenMenu={captureRemovalFocus}
                  returnFocus={removalReturnFocus}
                />
              ))}
            </ul>
            <Button
              ref={addButtonRef}
              variant="ghost"
              size="sm"
              onClick={() => setCreating(true)}
              disabled={defaultCategoryId === undefined}
              title={defaultCategoryId === undefined ? '카테고리를 먼저 만들어 주세요' : undefined}
              className="justify-start"
            >
              + 루틴 추가
            </Button>
          </>
        )}

        {loadError === null ? null : (
          <p
            role="alert"
            style={{ color: 'color-mix(in srgb, var(--color-danger) 70%, var(--color-text))' }}
            className="flex items-center gap-[var(--space-2)] text-sm"
          >
            {loadError}
            <Button variant="outline" size="sm" onClick={() => void loadRoutines()}>
              다시 시도
            </Button>
          </p>
        )}

        {/* 순서 변경 결과 낭독 (R13·§5). 드래그·`Alt+↑/↓` 가 같은 자리에 같은 문면을 낸다. 화면에는 보이지 않는다. */}
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </div>

      {creating && newRoutineTodo !== null ? (
        <RoutineDialog
          todo={newRoutineTodo}
          categories={categories}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </Dialog>
  );
}
