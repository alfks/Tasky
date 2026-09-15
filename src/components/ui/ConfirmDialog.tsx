'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

import { Dialog } from '@/components/ui/Dialog';

/**
 * IME 조합 중에 생긴 키 이벤트인지. 한글 입력에서 조합을 확정하는 Enter 는 조합을 끝내는
 * 동작일 뿐이라 [삭제] 를 눌러서는 안 된다(app-shell R14). 브라우저에 따라 isComposing 또는
 * keyCode 229 중 하나로만 알려 주므로 둘 다 본다.
 */
function isImeKey(e: KeyboardEvent): boolean {
  return e.isComposing || e.keyCode === 229;
}

type ConfirmDialogProps = {
  /** 열림 여부. */
  open: boolean;
  /** 제목. 예: "'장보기'를 삭제할까요?" */
  title: ReactNode;
  /** 본문. 무엇이 사라지는지 한 문장으로. */
  description: ReactNode;
  /** 파괴 버튼 문구. */
  confirmLabel?: string;
  /** 취소 버튼 문구. */
  cancelLabel?: string;
  /** 파괴 버튼을 눌렀을 때. */
  onConfirm: () => void;
  /** 취소·Esc·바깥 클릭·✕ 일 때. */
  onCancel: () => void;
  /** 열었던 요소가 확인의 결과로 사라질 때 포커스를 줄 요소(app-shell R14). */
  returnFocus?: () => HTMLElement | null;
};

/**
 * 단순형 파괴적 확인 대화상자(app-shell R14). 제목·본문·[취소]·[파괴] 만 있는 형태이고,
 * 선택지가 붙는 형(카테고리 삭제 category R10)은 같은 규칙을 지키는 기능 전용 대화상자로 만든다.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '삭제',
  cancelLabel = '취소',
  onConfirm,
  onCancel,
  returnFocus,
}: ConfirmDialogProps) {
  // 초기 포커스는 비파괴 요소인 [취소] — 파괴 버튼은 초기 포커스도 기본 제출 대상도 아니다(R14).
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Enter 는 포커스가 버튼에 있을 때 그 버튼만 실행한다. form 을 쓰지 않으므로 암묵 제출은
  // 애초에 없고, 본문에 입력이 들어오는 경우의 Enter 와 IME 조합 확정 Enter 를 여기서 막는다.
  // 캡처 단계에서 잡아야 대상 요소의 기본 동작(버튼 활성화)보다 먼저 취소할 수 있다.
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      if (isImeKey(e)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      role="alertdialog"
      title={title}
      description={description}
      initialFocusRef={cancelRef}
      returnFocus={returnFocus}
      className="max-w-[400px]"
      footer={
        <>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="h-[var(--control-height)] rounded-md border border-border bg-surface px-[var(--space-4)] text-base font-semibold text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-[var(--control-height)] rounded-md bg-danger px-[var(--space-4)] text-base font-semibold text-on-accent hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {confirmLabel}
          </button>
        </>
      }
    />
  );
}
