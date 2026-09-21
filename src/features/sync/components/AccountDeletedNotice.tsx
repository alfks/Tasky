'use client';

// 계정 삭제 안내 (sync.md §6, ADR-0019). 이 계정이 **다른 기기**에서 삭제됐을 때 뜬다 — 조용히
// 로그아웃시키지 않는다(ADR-0015 §5 "말없이 버리지 않는다"). 선택지는 [내보내고 지우기] 하나뿐이라
// app-shell.md R14 의 "취소" 짝이 없다 — Esc·✕ 는 안내를 잠시 닫을 뿐(dismissAccountDeletedNotice)
// 로컬을 건드리지 않고, 다음 동기화 확인이 서버에서 다시 410 을 받으면 되살아난다.
import { useState } from 'react';

import { useSyncStore } from '@/features/sync/store/sync-store';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { pushToast } from '@/components/ui/Toast';

type AccountDeletedNoticeProps = {
  exportBackup: () => Promise<boolean>;
};

export function AccountDeletedNotice({ exportBackup }: AccountDeletedNoticeProps) {
  const acknowledgeAccountDeleted = useSyncStore((state) => state.acknowledgeAccountDeleted);
  const dismiss = useSyncStore((state) => state.dismissAccountDeletedNotice);
  const [busy, setBusy] = useState(false);

  const acknowledge = async () => {
    setBusy(true);
    try {
      const ok = await acknowledgeAccountDeleted(exportBackup);
      // 리뷰 Minor 6-a — 실패(내보내기 취소/실패)를 조용히 삼키지 않는다. 안내는 다이얼로그가
      // 그대로 다시 보여준다(`ok=false` 면 `accountDeletedNotice` 를 그대로 둔다).
      if (!ok) pushToast({ message: '저장을 확인할 수 없어 아직 지우지 않았어요.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={dismiss}
      role="alertdialog"
      title="계정이 삭제됐어요"
      description="다른 기기에서 이 계정을 삭제했어요. 이 기기의 데이터를 내보내고 지울까요?"
      className="max-w-[420px]"
      footer={
        <Button onClick={() => void acknowledge()} loading={busy}>
          내보내고 지우기
        </Button>
      }
    />
  );
}
