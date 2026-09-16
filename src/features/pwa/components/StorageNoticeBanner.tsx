'use client';

import { STORAGE_NOTICE_TEXT } from '@/features/pwa/store/pwa-state';

import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';

type StorageNoticeBannerProps = {
  /** ✕. 기기별로 기억되어 다시 뜨지 않는다 (pwa R6). */
  onDismiss: () => void;
  /**
   * [백업하기]. **백업 화면이 붙기 전에는 넘기지 않는다** — 넘기지 않으면 버튼을 그리지 않는다.
   * 누르면 아무 일도 없는 버튼을 미리 그려 두지 않기 위해서다.
   */
  onBackup?: () => void;
};

/**
 * 저장 공간을 보장받지 못했을 때 상단에 **1회** 뜨는 알림 (pwa.md §2·R6).
 *
 * backup R14 의 백업 경고 점(조건이 참인 동안 상시·끌 수 없음)과 **다른 것**이다 — 그래서 같은
 * 컴포넌트로 만들지 않는다(R6 의 명시 요구). 낭독은 이 배너를 품은 `role="alert"` 영역이 맡는다.
 */
export function StorageNoticeBanner({ onDismiss, onBackup }: StorageNoticeBannerProps) {
  return (
    <div className="pointer-events-auto flex items-center gap-[var(--space-3)] rounded-[var(--radius-lg)] border border-border bg-surface px-[var(--space-4)] py-[var(--space-3)] text-base text-text shadow-md">
      <span>{STORAGE_NOTICE_TEXT}</span>
      {onBackup === undefined ? null : (
        <Button size="sm" variant="outline" onClick={onBackup}>
          백업하기
        </Button>
      )}
      <IconButton label="저장 공간 알림 닫기" onClick={onDismiss}>
        ✕
      </IconButton>
    </div>
  );
}
