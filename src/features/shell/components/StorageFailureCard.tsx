'use client';

// 저장소 열기 실패 안내 (app-shell.md §2-C "에러(저장소 열기 실패)"). 메인 전체를 이 카드로 바꾼다.
import { useState } from 'react';

import { useShellStorageStore } from '@/features/shell/store/shell-storage-store';

import { Button } from '@/components/ui/Button';

/** 스펙 §2-C 문면 그대로. 문구를 여기 상수로 두어 테스트가 스펙과 1:1 로 대조한다. */
export const STORAGE_FAILURE_TEXT =
  '이 브라우저에서는 저장 공간을 열 수 없어요(사생활 보호 모드일 수 있어요)';
export const MEMORY_MODE_CTA = '메모리 모드로 계속';
/** 메모리 모드 상시 배너 (같은 문단). */
export const MEMORY_MODE_BANNER_TEXT = '지금 적는 내용은 새로고침하면 사라져요';

type StorageFailureCardProps = {
  /** 메모리 구현으로 갈아끼운 뒤 다시 읽어야 할 것들. 셸이 넘긴다. */
  onContinue: () => void;
};

export function StorageFailureCard({ onContinue }: StorageFailureCardProps) {
  const continueInMemory = useShellStorageStore((state) => state.continueInMemory);
  const [switching, setSwitching] = useState(false);

  const handleContinue = async (): Promise<void> => {
    setSwitching(true);
    await continueInMemory();
    setSwitching(false);
    onContinue();
  };

  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-[var(--space-4)] rounded-[var(--radius-xl)] border border-border bg-surface p-[var(--space-6)]"
    >
      <h2 className="text-lg font-semibold text-text">저장 공간을 열 수 없어요</h2>
      <p className="text-base text-muted">{STORAGE_FAILURE_TEXT}</p>
      <Button loading={switching} onClick={() => void handleContinue()}>
        {MEMORY_MODE_CTA}
      </Button>
    </div>
  );
}
