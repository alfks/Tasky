'use client';

// 계정 전환 안내 (sync.md R1, 리뷰 Major 2). 표식의 `userSub` 와 서버 세션의 `sub` 가 다르면 뜬다.
// "올리기" 선택지는 없다(R1 — 다른 계정 데이터를 합치는 것은 항상 틀린 동작) — 그래서 버튼은
// [내보내고 지우기] 하나뿐이고, `AccountDeletedNotice` 와 같은 모양이다.
//
// **왜 조용히 지우지 않고 먼저 묻는가**: 예전엔 `verifySession` 이 감지 즉시 사용자 활성화 없이
// 내보내기를 시도했다 — `showSaveFilePicker` 는 배경에서 부르면 대부분 거부되어 앵커 다운로드로
// 떨어지는데, 그 경로는 저장 완료를 **확인하지 못해도** `save()` 가 곧장 resolve 돼 "내보냈다"로
// 잘못 보고했다(실측: Firefox·Safari 는 항상 이 경로, Chromium 도 활성화가 없으면 마찬가지).
// 이 다이얼로그의 [내보내고 지우기] 클릭 자체가 그 저장에 필요한 사용자 제스처를 공급한다.
//
// Esc·✕ 는 안내를 잠시 닫을 뿐 — 로컬은 그대로라(옛 계정 데이터가 남아 있다) 다음 동기화 확인이
// 서버에서 다시 다른 `sub` 를 받으면 되살아난다(`AccountDeletedNotice` 와 같은 재현 규칙). 초기
// 포커스는 지정하지 않는다 — `Dialog` 기본값이 첫 포커스 가능 요소인 ✕(비파괴 선택지)로 간다.
import { useState } from 'react';

import { useSyncStore } from '@/features/sync/store/sync-store';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { pushToast } from '@/components/ui/Toast';

type AccountSwitchedNoticeProps = {
  exportBackup: () => Promise<boolean>;
};

export function AccountSwitchedNotice({ exportBackup }: AccountSwitchedNoticeProps) {
  const confirmAccountSwitch = useSyncStore((state) => state.confirmAccountSwitch);
  const dismiss = useSyncStore((state) => state.dismissAccountSwitchedNotice);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      const ok = await confirmAccountSwitch(exportBackup);
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
      title="다른 계정으로 로그인했어요"
      description="이 기기의 기존 데이터를 내보낸 뒤 지우고, 새 계정 데이터를 받아올게요."
      className="max-w-[420px]"
      footer={
        <Button onClick={() => void confirm()} loading={busy}>
          내보내고 지우기
        </Button>
      }
    />
  );
}
