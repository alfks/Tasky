'use client';

// 루틴 관리 화면 (routine.md §2 관리 화면, R7·R7-a·R10·R12-b). 사이드바 "루틴" 진입점 +
// 다이얼로그를 한 파일에 담는다(`BackupLauncher` 와 같은 꼴).
//
// **순수 UI 다.** 액션은 전부 T-81(`useTodoActions` 의 loadRoutines·pauseRoutine·resumeRoutine·
// removeRoutine)이 이미 만들어 둔 것을 부르기만 한다 — 여기서 새로 계산하는 것은 화면에 필요한
// 정렬·빈 상태 판정뿐이다. 목록 구조(카드 안 행 + `⋯` 메뉴, 빈 상태 + 추가 버튼)는 category.md
// §2-A(`CategoryList`)를 그대로 본떴다.
import { useEffect, useMemo, useRef, useState } from 'react';

import type { Category } from '@/domain/category/category';
import type { DateKey } from '@/domain/date/date-key';
import { createMeta } from '@/domain/meta';
import { compareRoutines } from '@/domain/routine/routine.rules';
import type { Todo } from '@/domain/todo/todo';

import { useDateStripStore } from '@/features/date-strip';
import { RoutineDialog } from '@/features/todo/components/RoutineDialog';
import { RoutineManagerRow } from '@/features/todo/components/RoutineManagerRow';
import { useTodoActions } from '@/features/todo/hooks/useTodoActions';
import { useTodoStore } from '@/features/todo/store/todo-store';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Skeleton } from '@/components/ui/Skeleton';

import { nowIso } from '@/lib/date';
import { newId } from '@/lib/id';

type RoutineManagerProps = {
  /**
   * `TodoItem` 이 받는 것과 같은 목록(활성 + 종료, 삭제된 것 제외) — `todo` feature 가 `category`
   * feature 를 직접 import 하면 두 배럴이 서로를 참조해 순환이 생기므로(category → todo 는 이미
   * `useTodoGroup` 으로 존재한다) props 로 받는다. `AppShell` → `ShellSidebar` → 여기, 두 단계
   * prop-drilling — 감당할 만한 규모라 이번 라운드는 그대로 둔다(리뷰 #104 Nit, 더 나은 수·백로그는
   * `docs/PHASE2_TICKET_BACKLOG.md` T-89).
   */
  categories: readonly Category[];
  /** `⋯ → 삭제` 를 누른 순간, 아직 살아 있는 행에서 자리표를 뜬다(app-shell R14). */
  captureRemovalFocus?: () => void;
  /** 그 행이 사라진 뒤 대체 포커스 대상(`⋯` 가 이미 사라졌을 때만 쓰인다). */
  removalReturnFocus?: () => HTMLElement | null;
};

/**
 * "+ 루틴 추가"(R12-b) 가 여는 `RoutineDialog`(T-82 소유, 여기서 고치지 않는다) 에 넘길 빈 기본값
 * 자리표시 `Todo`. 그 다이얼로그는 `todo.title`·`todo.memo`·`todo.categoryId`·`todo.date` 로
 * 초기값을 뽑을 뿐 저장하지 않는다 — 그래도 메타 필드는 `createMeta()` 로만 만든다(ADR-0007,
 * 리터럴 `createdAt`/`updatedAt`/`rev` 는 도메인 밖에서도 금지).
 */
function blankTodo(categoryId: string, date: DateKey): Todo {
  return createMeta<Todo>(
    { now: nowIso, id: newId },
    { categoryId, date, title: '', done: false, order: 0 },
  );
}

export function RoutineManager({
  categories,
  captureRemovalFocus,
  removalReturnFocus,
}: RoutineManagerProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const routineMap = useTodoStore((state) => state.routines);
  const status = useTodoStore((state) => state.routineStatus);
  const storeError = useTodoStore((state) => state.error);
  const { loadRoutines, pauseRoutine, resumeRoutine, removeRoutine } = useTodoActions();
  const today = useDateStripStore((state) => state.today);

  // 관리 화면이 열릴 때마다 다시 읽는다(T-81 주석: "자동 로드 없음") — 항목 메뉴의 "루틴으로
  // 등록"(routine.md R12-a)이 그사이 새 루틴을 만들었을 수 있어, 열 때마다 최신값을 보장한다.
  useEffect(() => {
    if (open) void loadRoutines();
  }, [open, loadRoutines]);

  // `error` 는 투두 쓰기 실패와 공유하는 필드다(`todo-state.ts`) — `TodoList` 의 효과가 먼저 읽고
  // 지울 수 있어, 적재 실패 문구는 `routineStatus` 가 'error' 로 바뀌는 순간의 값을 스냅샷해 둔다.
  useEffect(() => {
    if (status === 'error') setLoadError(storeError);
    else if (status === 'ready') setLoadError(null);
  }, [status, storeError]);

  const routines = Object.values(routineMap).sort(compareRoutines);
  const indefiniteCount = routines.filter((routine) => routine.endDate === undefined).length;
  const loading = status === 'loading';
  const categoryOf = (id: string): Category | undefined =>
    categories.find((category) => category.id === id);
  const defaultCategoryId = categories[0]?.id;
  // 렌더마다 새로 만들면(리뷰 #104 Nit) 쓰이지도 않을 `id()`/`now()` 를 매번 버린다 — JSX 에서 직접
  // 부르는 대신 실제 입력이 바뀔 때만 다시 만든다("+ 루틴 추가" 를 여는 동안엔 둘 다 그대로다).
  const newRoutineTodo = useMemo(
    () => (defaultCategoryId === undefined ? null : blankTodo(defaultCategoryId, today)),
    [defaultCategoryId, today],
  );

  /**
   * 자리표는 **메뉴가 열릴 때**(`RoutineManagerRow` 의 `onOpenMenu`) 이미 떠 있다 — `handleRemove`
   * 안에서 다시 뜨면 안 된다. 그 시점의 `document.activeElement` 는 방금 누른 "삭제" 메뉴 항목
   * (팝오버 패널 안, `document.body` 로 포털된 별도 서브트리)이라 `closest('li')` 가 실패해
   * 자리표가 `null` 로 덮인다 — 실측으로 잡은 회귀다.
   *
   * `removalReturnFocus` 의 "목록마저 사라지면 `nav` 영역으로" 규칙(`focus-fallback.ts`)은 이
   * 목록이 **모달 안**(포털로 `document.body` 에 나간다, `Dialog`)이라 닿지 않는다 — 사이드바의
   * `nav` 는 이 DOM 서브트리 밖이다. 마지막 루틴을 지워 목록이 완전히 비면 그 규칙은 `null` 을
   * 주므로, 이 다이얼로그 안의 "+ 루틴 추가" 로 떨어진다(그래도 `<body>` 는 아니다).
   */
  const focusAfterRemovalRef = useRef(false);
  const routineCountRef = useRef(routines.length);

  /**
   * 리뷰 #104 Minor: `await removeRoutine(id)` 가 끝나도 **아직 지운 행이 화면에서 안 지워졌을
   * 수 있다** — 스토어 쓰기와 React 렌더 커밋은 별개다. 타이밍을 추측하는 `requestAnimationFrame`
   * /`queueMicrotask` 대신, **목록이 실제로 줄어든 것**을 의존성으로 하는 효과에서 포커스를
   * 옮긴다(아래 효과) — React 가 몇 번이나 다시 렌더하든, 실제로 줄어든 **그** 렌더 다음에만
   * 반응한다는 뜻이라 계약 없는 타이밍에 기대지 않는다.
   *
   * **깃발은 쓰기 전에 세운다.** `commitWrites` 는 저장소 쓰기가 끝나면 `await` 가 돌려주기
   * **전에** 이미 `ctx.set()` 으로 스토어를 바꾼다(`todo-writes.ts`) — 그래서 `removeRoutine` 의
   * 반환을 기다린 **뒤** 깃발을 세우면 이미 그 렌더가 지나가 있을 수 있다(실측: 매번 그랬다).
   * 쓰기가 실패하면(`ok === false`) 깃발을 내린다 — 아무것도 안 줄었으니 효과가 반응할 일도 없다.
   */
  const handleRemove = async (id: Parameters<typeof removeRoutine>[0]): Promise<void> => {
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
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // 포커스 링·꼴은 같은 도구 줄의 `BackupLauncher` 그대로(theme.md §5 — 링을 두 종류로 만들지 않는다).
        className="flex w-full items-center gap-[var(--space-2)] rounded-[var(--radius-md)] px-[var(--space-3)] py-[var(--space-2)] text-left text-sm text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <span aria-hidden="true">🔁</span>
        <span>루틴</span>
      </button>

      {open ? (
        <Dialog open onClose={() => setOpen(false)} title="루틴" className="max-w-[440px]">
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
                  title={
                    defaultCategoryId === undefined ? '카테고리를 먼저 만들어 주세요' : undefined
                  }
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
          </div>
        </Dialog>
      ) : null}

      {creating && newRoutineTodo !== null ? (
        <RoutineDialog
          todo={newRoutineTodo}
          categories={categories}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </>
  );
}
