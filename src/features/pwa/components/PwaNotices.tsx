'use client';

// PWA 알림 두 개(업데이트 토스트·저장 공간 배너)와 앱 수명주기 배선의 **단 하나의 마운트 지점**
// (specs/pwa.md R4·R6~R8). 앱 셸이 이것 하나만 렌더한다.
import { StorageNoticeBanner } from '@/features/pwa/components/StorageNoticeBanner';
import { useOverlayDeferral } from '@/features/pwa/hooks/useOverlayDeferral';
import { usePwaLifecycle } from '@/features/pwa/hooks/usePwaLifecycle';
import { UPDATE_NOTICE_TEXT } from '@/features/pwa/store/pwa-state';
import {
  selectIsStorageNoticeOpen,
  selectIsUpdateReady,
  usePwaStore,
} from '@/features/pwa/store/pwa-store';

import { ToastViewport } from '@/components/ui/Toast';
import type { ToastItem } from '@/components/ui/Toast';

/**
 * 업데이트 토스트는 자동으로 닫히지 않는다(R4 §2). `Toast` 의 타이머는 끌 수 없으므로 32비트
 * 상한(약 24.8일)을 넣는다 — `Infinity` 를 주면 `setTimeout` 이 0 으로 접혀 **즉시** 닫힌다.
 */
const NO_AUTO_DISMISS_MS = 2_147_483_647;

const UPDATE_TOAST_ID = 'pwa-update';

type PwaNoticesProps = {
  /** 저장 공간 배너의 [백업하기]. 백업 화면이 붙기 전에는 넘기지 않는다(버튼이 그려지지 않는다). */
  onBackup?: () => void;
};

/**
 * 두 알림 모두 스크린리더에 전달된다: 토스트는 `ToastViewport` 의 상주 `role="status"` 영역이,
 * 배너는 아래의 **비어 있어도 마운트된** `role="alert"` 영역이 낭독한다. 영역과 문구를 같은 순간에
 * 삽입하면 상당수 조합에서 낭독되지 않는다(`Toast.tsx` 의 같은 이유).
 */
export function PwaNotices({ onBackup }: PwaNoticesProps) {
  const { applyUpdate, dismissStorageNotice } = usePwaLifecycle();
  const isUpdateReady = usePwaStore(selectIsUpdateReady);
  const isStorageNoticeOpen = usePwaStore(selectIsStorageNoticeOpen);
  const dismissUpdate = usePwaStore((state) => state.dismissUpdate);
  const isDeferred = useOverlayDeferral(isUpdateReady);

  const toasts: ToastItem[] =
    isUpdateReady && !isDeferred
      ? [
          {
            id: UPDATE_TOAST_ID,
            message: UPDATE_NOTICE_TEXT,
            action: { label: '새로고침', onAction: applyUpdate },
            durationMs: NO_AUTO_DISMISS_MS,
          },
        ]
      : [];

  return (
    <>
      {/* 영역에 이름을 붙인다: 토스트 뷰포트도 assertive 영역(role="alert")을 하나 갖고 있어
          이름이 없으면 둘을 구분할 수 없다. 스크린리더에서도 어느 알림인지가 먼저 들린다. */}
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="false"
        aria-label="저장 공간 알림"
        className="pointer-events-none fixed inset-x-0 top-[var(--space-4)] z-[var(--z-toast)] flex flex-col items-center px-[var(--space-4)]"
      >
        {isStorageNoticeOpen ? (
          <StorageNoticeBanner onDismiss={dismissStorageNotice} onBackup={onBackup} />
        ) : null}
      </div>
      <ToastViewport toasts={toasts} onClose={dismissUpdate} />
    </>
  );
}
