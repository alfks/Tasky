'use client';

// 계정 삭제 확인 (sync.md §2 R14, app-shell.md R14 공통 규칙). `ConfirmDialog` 그대로 — 선택지가
// [취소]/[삭제] 둘뿐이라 전용 대화상자를 새로 짓지 않는다(그 컴포넌트 머리주석의 "단순형" 분류).
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

type AccountDeleteDialogProps = {
  open: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AccountDeleteDialog({ open, busy, onConfirm, onCancel }: AccountDeleteDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      title="계정을 삭제할까요?"
      description="서버에 저장된 모든 데이터가 사라져요. 삭제 전에 이 기기의 데이터를 먼저 내보내요."
      confirmLabel={busy ? '삭제하는 중…' : '삭제'}
      cancelLabel="취소"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
