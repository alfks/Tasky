// 타이머의 저장 배선 — **언제 무엇을 함께 저장하는가**만 담는다. 규칙은 전부 `@/domain/focus`.
import type { DatasetWrite } from '@/domain/dataset';
import type { FocusSession } from '@/domain/focus/focus-session';
import type { TodoId } from '@/domain/ids';
import type { MetaDeps, Persistable } from '@/domain/meta';
import { addTodoFocusSeconds } from '@/domain/todo/todo.rules';

import { getRepositories } from '@/repositories/container';

import { useTodoStore } from '@/features/todo';

/** 진행 중 상태 변화(시작·일시정지·재개)는 세션 한 건만 쓴다. */
export function persistSession(session: Persistable<FocusSession>): Promise<void> {
  return getRepositories().focusSessions.upsert(session);
}

/** 칩·카드 문구에 쓸 투두 제목. 없으면(삭제됐거나 "할 일 없이") `null`. */
export async function readTodoTitle(todoId: TodoId | undefined): Promise<string | null> {
  if (todoId === undefined) {
    return null;
  }
  const todo = await getRepositories().todos.getById(todoId);
  return todo?.title ?? null;
}

/**
 * 투두 스토어가 **같은 날짜를 보고 있을 때만** 다시 읽는다 (timer R8).
 *
 * 왜 필요한가: 우리가 `focusSeconds` 를 올린 뒤에도 투두 스토어의 메모리 사본은 옛 값을 들고 있다.
 * 그 사본으로 다음 쓰기(체크 토글 등)가 일어나면 방금 더한 집중 시간이 덮여 사라진다.
 * 다른 feature 의 내부를 만지지 않고 공개 배럴의 `loadDate` 만 쓴다.
 */
async function refreshTodoCache(todoId: TodoId): Promise<void> {
  const { byId, date, loadDate } = useTodoStore.getState();
  if (date === null || byId[todoId] === undefined) {
    return;
  }
  await loadDate(date);
}

/**
 * 끝난 세션 저장 (timer R8). 연결된 투두가 있으면 **한 트랜잭션**으로 `focusSeconds` 까지 올린다 —
 * 둘이 갈리면 세션 기록과 표시용 합계가 어긋난다. 투두가 그 사이 삭제됐으면 세션만 남긴다.
 */
export async function persistEnding(
  session: Persistable<FocusSession>,
  deps: MetaDeps,
): Promise<void> {
  const repos = getRepositories();
  const todoId = session.todoId;
  if (todoId === undefined || session.elapsedSeconds <= 0) {
    await repos.focusSessions.upsert(session);
    return;
  }
  const todo = await repos.todos.getById(todoId);
  if (todo === undefined) {
    await repos.focusSessions.upsert(session);
    return;
  }
  const writes: DatasetWrite[] = [
    { table: 'focusSessions', entity: session },
    { table: 'todos', entity: addTodoFocusSeconds(todo, session.elapsedSeconds, deps) },
  ];
  await repos.dataset.write(writes);
  await refreshTodoCache(todoId);
}
