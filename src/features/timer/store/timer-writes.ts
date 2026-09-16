// 타이머의 저장 배선 — **언제 무엇을 함께 저장하는가**만 담는다. 규칙은 전부 `@/domain/focus`.
//
// **모든 쓰기는 한 줄로 직렬화한다**(`createTimerWriteQueue`, todo-writes.ts 와 같은 장치).
// 직렬화가 없으면 읽고-쓰기 사이가 열려 두 호출이 같은 스냅샷을 본다: `start()` 를 연타하면 둘 다
// `getActive()` 에서 "없음" 을 읽어 **running 세션이 2개** 생긴다(R5 위반). 투두 스토어가 같은 유형의
// 경합으로 `order` 를 중복 발급했던 것과 같은 결함이다.
import type { DatasetWrite } from '@/domain/dataset';
import type { FocusSession } from '@/domain/focus/focus-session';
import type { TodoId } from '@/domain/ids';
import type { MetaDeps, Persistable } from '@/domain/meta';
import { addTodoFocusSeconds } from '@/domain/todo/todo.rules';

import { getRepositories } from '@/repositories/container';

import { useTodoStore } from '@/features/todo';

/** 앞의 쓰기가 끝난 뒤에 `task` 를 시작한다. 앞이 실패해도 큐는 이어진다. */
export type TimerSerialize = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * 쓰기 한 줄 큐 하나. **스토어마다 따로** 만들어 테스트의 격리 인스턴스끼리 큐를 공유하지 않는다.
 * 같은 탭 안의 경합만 막는다 — 다른 탭과의 경합은 R5 의 `getActive()` 확인이 맡고,
 * 두 탭이 같은 순간에 시작하는 경우는 "실시간 채널 없음" 과 같은 등급의 한계다(timer-sync.ts 주석).
 */
export function createTimerWriteQueue(): TimerSerialize {
  let queue: Promise<unknown> = Promise.resolve();
  return (task) => {
    const run = queue.then(task, task);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

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
 *
 * **알려진 한계(lost update)**: 아래 `getById` 와 `dataset.write` 사이에 사용자가 그 투두를 체크하면,
 * 우리가 읽은 스냅샷(`done:false`)이 통째로 되쓰기되어 그 체크가 조용히 되돌아간다. 읽기~쓰기 창을
 * 이미 `await` 한 번으로 좁혔지만 닫지는 못한다 — 닫으려면 트랜잭션 안 재조회나 `rev` 불일치 재시도가
 * 필요하고 둘 다 `repositories`/`domain` 변경이라 이 티켓의 `owns`(`src/features/timer/**`) 밖이다.
 * 후속 티켓에서 `DatasetRepository` 에 낙관적 동시성(rev 검사)을 넣어 닫는다.
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
