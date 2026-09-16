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
 * 업데이트 토스트는 사실상 자동으로 닫히지 않아야 한다(R4 §2). `Toast` 의 타이머는 끌 수 없어
 * 32비트 상한을 넣는다 — **정확히는 안 닫히는 게 아니라 약 24.8일 뒤에 닫힌다.** 한 세션 안에서는
 * 도달하지 않는 값이라 지금은 충분하다(실브라우저에서 8초·30초 유지 확인).
 * `Infinity` 를 주면 `setTimeout` 이 비유한값을 0 으로 클램프해 **즉시** 닫히므로 쓸 수 없다.
 * 근본 해법은 `Toast` 의 `durationMs?: number | null` 이고, ✕ 버튼과 함께 T-07 후속 티켓이 맡는다.
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
          이름이 없으면 개발 도구·AX 트리에서 둘을 구분할 수 없다. 다만 **낭독을 이 이름에 기대지
          않는다** — 라이브 영역의 `aria-label` 은 스크린리더 조합에 따라 읽히지 않는다. 사용자가
          들어야 하는 내용은 전부 배너 본문에 있다. */}
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
