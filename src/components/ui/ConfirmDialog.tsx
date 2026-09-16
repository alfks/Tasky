'use client';

import { useRef } from 'react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

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
  /** 열었던 요소가 확인의 결과로 사라졌을 때 포커스를 줄 요소(app-shell R14). */
  returnFocus?: () => HTMLElement | null;
};

/**
 * 단순형 파괴적 확인 대화상자(app-shell R14). 제목·본문·[취소]·[파괴] 만 있는 형태이고,
 * 선택지가 붙는 형(카테고리 삭제 category R10)은 `Dialog` 위에 직접 짓는다 — Enter/IME 규칙과
 * 포커스 규칙은 `Dialog` 가 갖고 있으므로 그쪽도 그대로 물려받는다.
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
          <Button ref={cancelRef} variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
