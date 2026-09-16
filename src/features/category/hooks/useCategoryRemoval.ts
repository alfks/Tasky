// 삭제 대화상자의 흐름 한 벌 (category R10~R16): 열기 → N/M 세기 → 실행 → 되돌리기 토스트.
//
// **되돌리기 토스트를 슬롯 하나로 두는 이유**: 스토어의 `pendingRemoval` 도 슬롯 하나라, 삭제가
// 연달아 일어나면 뒤의 메모가 앞의 것을 덮는다. 토스트를 배열로 쌓으면 화면에 남은 앞 토스트의
// [되돌리기] 가 **뒤의 삭제**를 되감는다 — 눌린 것과 다른 일이 일어난다. 슬롯 하나면 화면의
// [되돌리기] 와 스토어의 메모가 항상 짝이다.
//
// 되돌리기 창은 **이 세션 안에서만** 유효하다. 새로고침하면 메모가 사라지고(소프트 삭제된 값은
// 조회로 다시 읽히지 않는다 — ADR-0007 결정 4) 토스트도 함께 사라진다.
import { useRef, useState } from 'react';

import type { Category } from '@/domain/category/category';
import type { CategoryRemovalChoice } from '@/domain/category/removal';

import { getRepositories } from '@/repositories/container';

import { removalToastMessage } from '@/features/category/components/CategoryRemoveDialogText';
import { SAVE_FAILED } from '@/features/category/store/category-state';
import { useCategoryStore } from '@/features/category/store/category-store';
import { useTodoStore } from '@/features/todo';

import type { ToastItem } from '@/components/ui/Toast';

/** 대화상자 문구가 쓰는 두 수: N(완료 = 기록으로 남는다) · M(미완료 = 사용자가 처리를 고른다). */
export type CategoryRemovalCounts = { done: number; incomplete: number };

/** 투두를 세지 못했을 때. 삭제는 M 을 모른 채 물을 수 없으므로 대화상자를 열지 않는다. */
const COUNT_FAILED = '할 일을 읽지 못했어요. 다시 시도해 주세요';

/** 대화상자 + 토스트가 함께 쓰는 제어기. `CategoryList` 의 `onRemove` 에 `requestRemove` 를 넘긴다. */
export type CategoryRemovalController = {
  /** 열려 있는 삭제 대상. `null` 이면 대화상자가 닫혀 있다. */
  target: Category | null;
  /** 대상의 N/M. 아직 세는 중이면 `null` 이고 그동안 대화상자는 열리지 않는다. */
  counts: CategoryRemovalCounts | null;
  /** 삭제 저장 중(중복 실행 방지). */
  removing: boolean;
  /** 대화상자 안에 그대로 보여줄 실패 문구 (§2-D). */
  error: string | null;
  /** `⋯ → 삭제`. */
  requestRemove: (category: Category) => void;
  /** 취소·Esc·✕·바깥 클릭. */
  cancel: () => void;
  /** 고른 처리로 실행한다. 성공하면 대화상자를 닫고 되돌리기 토스트를 띄운다. */
  confirm: (choice: CategoryRemovalChoice) => Promise<boolean>;
  /** 지금 떠 있는 토스트(되돌리기 또는 실패). 최대 한 장이다. */
  toast: ToastItem | null;
  /** 6초가 지났거나 닫혔을 때. 되돌리기 창을 닫는다. */
  dismissToast: () => void;
};

/** 삭제·되돌리기로 투두가 움직였으니 보고 있는 날짜를 다시 읽는다(카테고리 스토어는 투두를 모른다). */
function refreshTodos(): void {
  const { date, loadDate } = useTodoStore.getState();
  if (date !== null) {
    void loadDate(date);
  }
}

export function useCategoryRemoval(): CategoryRemovalController {
  const [target, setTarget] = useState<Category | null>(null);
  const [counts, setCounts] = useState<CategoryRemovalCounts | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastItem | null>(null);
  // 늦게 도착한 이전 요청의 개수를 버린다(연속으로 다른 카테고리의 삭제를 열었을 때).
  const requestSeq = useRef(0);
  const toastSeq = useRef(0);

  const removeCategory = useCategoryStore((state) => state.removeCategory);
  const undoRemoval = useCategoryStore((state) => state.undoRemoval);
  const clearPendingRemoval = useCategoryStore((state) => state.clearPendingRemoval);

  const show = (item: Omit<ToastItem, 'id'>): void => {
    toastSeq.current += 1;
    setToast({ id: `category-removal-${toastSeq.current}`, ...item });
  };

  const dismissToast = (): void => {
    setToast(null);
    clearPendingRemoval();
  };

  const undo = async (): Promise<void> => {
    setToast(null);
    if (await undoRemoval()) {
      refreshTodos();
      return;
    }
    show({ message: useCategoryStore.getState().error ?? SAVE_FAILED, variant: 'error' });
  };

  const requestRemove = (category: Category): void => {
    requestSeq.current += 1;
    const seq = requestSeq.current;
    setTarget(category);
    setCounts(null);
    setError(null);
    void getRepositories()
      .todos.listByCategory(category.id)
      .then((todos) => {
        if (seq !== requestSeq.current) {
          return;
        }
        setCounts({
          done: todos.filter((todo) => todo.done).length,
          incomplete: todos.filter((todo) => !todo.done).length,
        });
      })
      .catch(() => {
        if (seq !== requestSeq.current) {
          return;
        }
        setTarget(null);
        show({ message: COUNT_FAILED, variant: 'error' });
      });
  };

  const cancel = (): void => {
    requestSeq.current += 1;
    setTarget(null);
    setCounts(null);
    setError(null);
  };

  const confirm = async (choice: CategoryRemovalChoice): Promise<boolean> => {
    if (target === null || removing) {
      return false;
    }
    setRemoving(true);
    const removed = await removeCategory({ category: target, choice });
    setRemoving(false);
    if (!removed) {
      setError(useCategoryStore.getState().error ?? SAVE_FAILED);
      return false;
    }
    cancel();
    refreshTodos();
    show({
      message: removalToastMessage(target.name),
      action: { label: '되돌리기', onAction: () => void undo() },
    });
    return true;
  };

  return {
    target,
    counts,
    removing,
    error,
    requestRemove,
    cancel,
    confirm,
    toast,
    dismissToast,
  };
}
