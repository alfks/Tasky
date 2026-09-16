'use client';

// 행 하나가 벌이는 바깥 동작 — 완료 토글·순서 이동·날짜/카테고리 이동, 그리고 편집 패널 닫기.
//
// 행 컴포넌트에서 떼어낸 이유는 길이(code-style §51)만이 아니다. 네 동작은 전부 "성공했을 때만
// 후처리(낭독·토스트·포커스 인계)를 한다" 는 같은 모양이고, JSX 사이에 흩어져 있으면 새 경로를
// 하나 늘릴 때마다 그 중 하나를 빠뜨리게 된다 — 실제로 포커스 인계가 경로마다 차례로 샜다.
// 포커스 판단 자체는 `useTodoItemFocus` 한 곳에 모여 있다.
import type { RefObject } from 'react';

import type { DateKey } from '@/domain/date/date-key';
import { domainErrorMessage } from '@/domain/errors';
import type { CategoryId, TodoId } from '@/domain/ids';
import type { Todo } from '@/domain/todo/todo';

import { incompletePosition } from '@/features/todo/components/todo-drag';
import { useTodoItemFocus, type TodoItemFocus } from '@/features/todo/components/useTodoItemFocus';
import { useTodoActions } from '@/features/todo/hooks/useTodoActions';
import { TODO_MESSAGES as M } from '@/features/todo/messages';

/** 완료 항목에서 `Alt+↑/↓` 를 눌렀을 때의 낭독 (§5). 문면의 단일 소스는 도메인 규칙이다 —
 *  여기서 문장을 새로 쓰면 같은 사실을 토스트와 낭독이 서로 다르게 말한다. */
const REORDER_DONE = domainErrorMessage('TODO_REORDER_DONE');

type Params = {
  todo: Todo;
  /** 삭제된 카테고리의 투두 (R16) — 체크·편집·순서·드래그가 막힌다. */
  readOnly: boolean;
  /** 순서를 바꿀 수 있는 행인가 (미완료 + 활성 카테고리). */
  canReorder: boolean;
  /** `reorder` 의 좌표계 (R11). */
  sequence: readonly Todo[];
  editingField: 'title' | 'memo' | null;
  rowRef: RefObject<HTMLLIElement | null>;
  titleRef: RefObject<HTMLButtonElement | null>;
  onEditChange: (id: TodoId | null, field?: 'title' | 'memo') => void;
  onAnnounce: (message: string) => void;
  onToggled: (done: boolean) => void;
  onMovedToDate: (todo: Todo, date: DateKey) => void;
};

export type TodoItemActions = Pick<TodoItemFocus, 'returnFocus' | 'snapshotFocus' | 'closeEdit'> & {
  toggle: (next: boolean) => void;
  move: (direction: -1 | 1) => void;
  goToDate: (date: DateKey) => void;
  toCategory: (id: CategoryId) => void;
};

export function useTodoItemActions(params: Params): TodoItemActions {
  const { todo, readOnly, canReorder, sequence, onAnnounce, onToggled, onMovedToDate } = params;
  const { toggleDone, moveBy, moveToDate, changeCategory } = useTodoActions();
  const { fallback, handOff, returnFocus, snapshotFocus, closeEdit } = useTodoItemFocus(params);

  const toggle = (next: boolean): void => {
    if (readOnly) return;
    void toggleDone(todo.id, next).then((ok) => ok && onToggled(next));
  };

  const move = (direction: -1 | 1): void => {
    if (!canReorder) {
      // 완료 항목은 순서를 바꾸지 않는다(R11) — 조용히 무시하면 키가 고장 난 것처럼 보인다(§5).
      onAnnounce(REORDER_DONE);
      return;
    }
    // 끝에서 한 번 더 누른 것은 실패가 아니다 — 스토어도 성공(변경 0건)을 돌려주므로 여기서 가른다.
    const from = incompletePosition(sequence, todo.id);
    const open = sequence.filter((item) => !item.done).length;
    if (from === null || from + direction < 1 || from + direction > open) {
      onAnnounce(M.reorderEdge);
      return;
    }
    void moveBy(todo.id, direction).then(
      (ok) => ok && onAnnounce(M.reordered(todo.title, from + direction)),
    );
  };

  const goToDate = (date: DateKey): void => {
    const target = fallback();
    void moveToDate(todo.id, date).then((ok) => {
      if (!ok) return;
      onMovedToDate(todo, date);
      handOff(target);
    });
  };

  const toCategory = (id: CategoryId): void => {
    const target = fallback();
    void changeCategory(todo.id, id).then((ok) => ok && handOff(target));
  };

  return { toggle, move, goToDate, toCategory, returnFocus, snapshotFocus, closeEdit };
}
