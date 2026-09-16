'use client';

// 행이 목록에서 내려가거나 다시 그려진 뒤 **포커스를 어디로 보내는가** (app-shell R14, todo.md §5).
//
// 포커스가 `<body>` 로 떨어지면 키보드 사용자는 다음 `Tab` 에서 문서 처음으로 돌아간다. 이 화면에는
// 그렇게 될 수 있는 길이 셋 있고, 셋 다 원인이 다르다:
//
// 1. **행이 사라진다** — 삭제·"내일로"·"다른 카테고리로 옮기기". 사라진 **뒤에** 갈 곳을 계산하면
//    이미 DOM 에서 끊어져 형제도 컨테이너도 찾을 수 없다. 그래서 떠나기 **전에** 찍어 둔다
//    (`fallback`), 메뉴에서 시작한 경로는 메뉴를 연 순간에 찍는다(`snapshotFocus`).
// 2. **행은 남는데 옮겨진 것이 확정될 때까지 한 박자 걸린다** — 쓰기가 끝나는 시점에 한 번 더
//    확인한다(`handOff`). 아무도 포커스를 가져가지 않았을 때만 되돌리므로 사용자가 그 사이 누른
//    곳을 빼앗지 않는다.
// 3. **편집 패널이 닫힌다** — Esc·[취소]·[저장]·제목 `Enter` 네 경로 전부. 패널은 `onClose()` 로
//    언마운트될 뿐 돌아갈 대상을 정하지 않아, 그대로 두면 편집을 마칠 때마다 포커스를 잃는다
//    (Chromium 실측). 편집하던 **그 항목의 제목 버튼** 으로 돌려준다.
//
// 3번을 되돌리는 것은 닫기가 **사용자 조작이었을 때만** 이다. 삭제 확인처럼 행 자체가 사라져서
// 패널이 닫힌 경우에는 확인 대화상자가 정한 행선지를 빼앗으면 안 된다.
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

import type { TodoId } from '@/domain/ids';

import { focusFallback } from '@/features/todo/components/todo-focus';

type Params = {
  /** 지금 이 행에 편집 패널이 펼쳐져 있는가. `null` 이면 닫힌 상태다. */
  editingField: 'title' | 'memo' | null;
  rowRef: RefObject<HTMLLIElement | null>;
  /** 편집을 마쳤을 때 포커스가 돌아갈 자리 — 편집하던 그 항목의 제목 버튼이다. */
  titleRef: RefObject<HTMLButtonElement | null>;
  onEditChange: (id: TodoId | null, field?: 'title' | 'memo') => void;
};

export type TodoItemFocus = {
  /** 지금 이 행이 사라진다면 포커스를 받을 곳 (다음 형제 → 이전 형제 → 목록). */
  fallback: () => HTMLElement | null;
  /** 오버레이에 넘길 복귀 대상. 메뉴가 미리 찍어 둔 자리까지 본다. */
  returnFocus: () => HTMLElement | null;
  /** 메뉴가 열릴 때 "이 행이 사라지면 어디로 갈지" 를 미리 찍어 둔다. */
  snapshotFocus: () => void;
  /** 쓰기가 끝난 뒤, 행이 정말 사라졌고 아무도 포커스를 안 가져갔으면 넘긴다. */
  handOff: (fallback: HTMLElement | null) => void;
  /** 편집 패널이 닫히는 **모든** 경로가 지나는 문. */
  closeEdit: () => void;
};

export function useTodoItemFocus({
  editingField,
  rowRef,
  titleRef,
  onEditChange,
}: Params): TodoItemFocus {
  const snapshot = useRef<HTMLElement | null>(null);
  const closingEdit = useRef(false);

  useEffect(() => {
    if (editingField !== null || !closingEdit.current) return;
    closingEdit.current = false;
    titleRef.current?.focus();
  }, [editingField, titleRef]);

  const fallback = (): HTMLElement | null => focusFallback(rowRef.current);

  const handOff = (target: HTMLElement | null): void => {
    if (target === null) return;
    requestAnimationFrame(() => {
      if (rowRef.current?.isConnected !== true && document.activeElement === document.body) {
        target.focus();
      }
    });
  };

  return {
    fallback,
    handOff,
    returnFocus: () => fallback() ?? snapshot.current,
    snapshotFocus: () => {
      snapshot.current = fallback();
    },
    closeEdit: () => {
      closingEdit.current = true;
      // 저장이 카테고리·날짜를 바꿨으면 행 자체가 내려가 위 effect 가 돌 자리가 없어진다 — 안전망.
      const target = fallback();
      onEditChange(null);
      handOff(target);
    },
  };
}
