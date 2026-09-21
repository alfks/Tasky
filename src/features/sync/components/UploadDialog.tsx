'use client';

// 첫 로그인 업로드 다이얼로그 (sync.md §2 R7, app-shell.md R14). 파괴적 선택지("내보내고 지우기")가
// 있어 `role="alertdialog"`, 초기 포커스는 비파괴 선택지인 [올리기]. Esc·✕·바깥 클릭은 **보류**다 —
// `onClose` 를 `deferUpload` 에 연결할 뿐 아무것도 지우지 않는다(다음 접속에 다시 묻는다).
import { useEffect, useRef, useState } from 'react';

import { getRepositories } from '@/repositories/container';

import { useSyncStore } from '@/features/sync/store/sync-store';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { pushToast } from '@/components/ui/Toast';

type UploadDialogProps = {
  exportBackup: () => Promise<boolean>;
};

async function countLocalRows(): Promise<{ todos: number; categories: number }> {
  const repositories = getRepositories();
  const [todos, categories] = await Promise.all([
    repositories.todos.listAll(),
    repositories.categories.list({ includeClosed: true }),
  ]);
  return { todos: todos.length, categories: categories.length };
}

export function UploadDialog({ exportBackup }: UploadDialogProps) {
  const resolveUpload = useSyncStore((state) => state.resolveUpload);
  const deferUpload = useSyncStore((state) => state.deferUpload);
  const uploadRef = useRef<HTMLButtonElement>(null);
  const [counts, setCounts] = useState<{ todos: number; categories: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void countLocalRows().then((next) => {
      if (alive) setCounts(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  const choose = async (choice: 'upload' | 'export-wipe') => {
    setBusy(true);
    try {
      const ok = await resolveUpload(choice, exportBackup);
      // "올리기" 는 내보내기를 거치지 않으므로 실패 문구를 이 갈래에만 낸다(리뷰 Minor 6-a,
      // `AccountBlock` 이 로그아웃·계정 삭제 실패에 토스트를 띄우는 것과 같은 방식).
      if (!ok && choice === 'export-wipe') {
        pushToast({ message: '저장을 확인할 수 없어 아직 지우지 않았어요.' });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={deferUpload}
      role="alertdialog"
      title="이 기기의 데이터를 계정으로 올릴까요?"
      description={
        counts === null
          ? undefined
          : `로그인 전에 이 기기에 저장된 할 일 ${counts.todos}개, 카테고리 ${counts.categories}개가 있어요.`
      }
      initialFocusRef={uploadRef}
      className="max-w-[420px]"
      footer={
        <>
          <Button variant="outline" onClick={() => void choose('export-wipe')} disabled={busy}>
            내보내고 지우기
          </Button>
          <Button ref={uploadRef} onClick={() => void choose('upload')} loading={busy}>
            올리기
          </Button>
        </>
      }
    />
  );
}
