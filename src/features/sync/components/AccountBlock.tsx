'use client';

// 사이드바 "계정 블록" (sync.md §2, app-shell.md R12-a — 도구 줄 아래, 사이드바 맨 끝).
// 이메일 · 동기화 상태 3종 · [로그아웃] · [계정 삭제].
import { useState } from 'react';

import { AccountDeleteDialog } from '@/features/sync/components/AccountDeleteDialog';
import { useSyncStore } from '@/features/sync/store/sync-store';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { pushToast } from '@/components/ui/Toast';

type AccountBlockProps = {
  exportBackup: () => Promise<boolean>;
};

type Status = 'synced' | 'pending' | 'offline' | 'deciding';

/**
 * "대기 N건" 이 "오프라인" 보다 먼저다 — 오프라인 중에 쓴 변경이 있으면 "몇 건이 밀렸는지" 가
 * "온라인인지" 보다 더 실질적인 정보다(sync.md R6 "저장됨처럼 보이는데 서버에 아직 없는 상태를
 * 정직하게 표시한다"). 대기 중인 게 없을 때만 순수 오프라인 안내로 내려간다(e2e 로 드러난 순서
 * 버그 — 예전 순서는 오프라인이면 대기 건수를 무조건 가렸다).
 *
 * `uploadPending` 이 **가장 먼저다**(리뷰 Major 4) — R7 선택을 아직 안 했다는 뜻이라, 그 로컬
 * 데이터는 아웃박스에 없어 `pendingCount` 에 안 잡히지만 "동기화됨" 은 명백한 거짓말이다. 사용자가
 * Esc·✕ 로 다이얼로그를 보류해도(`deferUpload`) 이 값은 그대로 참으로 남아, 새로고침해 다시
 * 결정하기 전까지는 "● 동기화됨" 이 뜨지 않는다.
 */
function statusOf(online: boolean, pendingCount: number, uploadPending: boolean): Status {
  if (uploadPending) return 'deciding';
  if (pendingCount > 0) return 'pending';
  return online ? 'synced' : 'offline';
}

const STATUS_TEXT: Record<Status, (pendingCount: number) => string> = {
  synced: () => '● 동기화됨',
  pending: (n) => `○ 대기 ${n}건`,
  offline: () => '○ 오프라인 · 온라인이 되면 이어서 보냅니다',
  deciding: () => '○ 업로드 확인이 필요해요 · 새로고침하면 다시 물어요',
};

export function AccountBlock({ exportBackup }: AccountBlockProps) {
  const email = useSyncStore((state) => state.email);
  const online = useSyncStore((state) => state.online);
  const pendingCount = useSyncStore((state) => state.pendingCount);
  const uploadPending = useSyncStore((state) => state.uploadPending);
  const logout = useSyncStore((state) => state.logout);
  const deleteAccount = useSyncStore((state) => state.deleteAccount);

  const [confirming, setConfirming] = useState<'logout' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);

  const status = statusOf(online, pendingCount, uploadPending);

  const handleLogout = async () => {
    setBusy(true);
    try {
      const ok = await logout(exportBackup);
      if (!ok) pushToast({ message: '저장을 확인할 수 없어 로그아웃하지 않았어요.' });
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      const ok = await deleteAccount(exportBackup);
      if (!ok) pushToast({ message: '계정을 삭제하지 못했어요. 다시 시도해 주세요.' });
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  return (
    <div className="flex flex-col gap-[var(--space-1)] border-t border-border pt-[var(--space-2)]">
      <p className="truncate px-[var(--space-1)] text-sm font-medium text-text">{email}</p>
      {/* 리뷰 Minor 6-b — 오프라인 전환·대기 건수 증가를 스크린리더가 듣게 한다. */}
      <p role="status" className="px-[var(--space-1)] text-xs text-muted">
        {STATUS_TEXT[status](pendingCount)}
      </p>
      <div className="flex gap-[var(--space-2)] px-[var(--space-1)]">
        <button
          type="button"
          onClick={() => setConfirming('logout')}
          className="text-sm text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          로그아웃
        </button>
        <button
          type="button"
          onClick={() => setConfirming('delete')}
          className="text-sm text-danger hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          계정 삭제
        </button>
      </div>

      <ConfirmDialog
        open={confirming === 'logout'}
        title="로그아웃할까요?"
        description="이 기기의 데이터를 내보낸 뒤 로컬에서 지워요."
        confirmLabel={busy ? '로그아웃하는 중…' : '로그아웃'}
        cancelLabel="취소"
        onConfirm={() => void handleLogout()}
        onCancel={() => setConfirming(null)}
      />
      <AccountDeleteDialog
        open={confirming === 'delete'}
        busy={busy}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
