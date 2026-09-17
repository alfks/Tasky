'use client';

// PWA 알림 두 개(업데이트 토스트·저장 공간 배너)와 앱 수명주기 배선의 **단 하나의 마운트 지점**
// (specs/pwa.md R4·R6~R8). 앱 셸이 이것 하나만 렌더한다.
//
// 업데이트 토스트는 자기 뷰포트가 아니라 전역 허브로 간다(T-30 · app-shell R8). 여기 남는 것은
// 상단 고정 배너의 라이브 영역뿐이다.
import { useEffect, useRef } from 'react';

import { StorageNoticeBanner } from '@/features/pwa/components/StorageNoticeBanner';
import { useOverlayDeferral } from '@/features/pwa/hooks/useOverlayDeferral';
import { usePwaLifecycle } from '@/features/pwa/hooks/usePwaLifecycle';
import { UPDATE_NOTICE_TEXT } from '@/features/pwa/store/pwa-state';
import {
  selectIsStorageNoticeOpen,
  selectIsUpdateReady,
  usePwaStore,
} from '@/features/pwa/store/pwa-store';

import { dismissToast, pushToast, useToasts } from '@/components/ui/Toast';

/**
 * 업데이트 토스트는 사실상 자동으로 닫히지 않아야 한다(R4 §2). `Toast` 의 타이머는 끌 수 없어
 * 32비트 상한을 넣는다 — **정확히는 안 닫히는 게 아니라 약 24.8일 뒤에 닫힌다.** 한 세션 안에서는
 * 도달하지 않는 값이라 지금은 충분하다(실브라우저에서 8초·30초 유지 확인).
 * `Infinity` 를 주면 `setTimeout` 이 비유한값을 0 으로 클램프해 **즉시** 닫히므로 쓸 수 없다.
 * 근본 해법은 `Toast` 의 `durationMs?: number | null` 이고, ✕ 버튼과 함께 T-07 후속 티켓이 맡는다.
 */
const NO_AUTO_DISMISS_MS = 2_147_483_647;

/** 상단 알림 영역을 밖에서 찾는 표식. 셸이 이만큼 자리를 비운다(`shell/lib/top-notice.ts`). */
export const TOP_NOTICE_ATTR = 'data-top-notice';

type PwaNoticesProps = {
  /** 저장 공간 배너의 [백업하기]. 백업 화면이 붙기 전에는 넘기지 않는다(버튼이 그려지지 않는다). */
  onBackup?: () => void;
};

/**
 * 두 알림 모두 스크린리더에 전달된다: 업데이트 토스트는 전역 뷰포트(`ShellToasts`)의 상주
 * `role="status"` 영역이, 배너는 아래의 **비어 있어도 마운트된** `role="alert"` 영역이 낭독한다.
 * 영역과 문구를 같은 순간에 삽입하면 상당수 조합에서 낭독되지 않는다(`Toast.tsx` 의 같은 이유).
 */
export function PwaNotices({ onBackup }: PwaNoticesProps) {
  const { applyUpdate, dismissStorageNotice } = usePwaLifecycle();
  // ✕ 의 목적지. `usePwaLifecycle` 은 이것을 내주지 않으므로(그 훅은 이 티켓의 owns 밖) 스토어에서
  // 직접 집는다 — zustand 액션이라 참조가 고정이다.
  const dismissUpdate = usePwaStore((state) => state.dismissUpdate);
  const isUpdateReady = usePwaStore(selectIsUpdateReady);
  const isStorageNoticeOpen = usePwaStore(selectIsStorageNoticeOpen);
  const isDeferred = useOverlayDeferral(isUpdateReady);

  useUpdateToast(isUpdateReady && !isDeferred, applyUpdate, dismissUpdate);

  return (
    /* 영역에 이름을 붙인다: 토스트 뷰포트도 assertive 영역(role="alert")을 하나 갖고 있어
          이름이 없으면 개발 도구·AX 트리에서 둘을 구분할 수 없다. 다만 **낭독을 이 이름에 기대지
          않는다** — 라이브 영역의 `aria-label` 은 스크린리더 조합에 따라 읽히지 않는다. 사용자가
          들어야 하는 내용은 전부 배너 본문에 있다. 셸이 자리를 비울 때 쓰는 앵커는 이름이 아니라
          `TOP_NOTICE_ATTR` 표식이다 — 문구가 바뀌어도 조용히 죽지 않는다(T-30). */
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="false"
      aria-label="저장 공간 알림"
      {...{ [TOP_NOTICE_ATTR]: '' }}
      className="pointer-events-none fixed inset-x-0 top-[var(--space-4)] z-[var(--z-toast)] flex flex-col items-center px-[var(--space-4)]"
    >
      {isStorageNoticeOpen ? (
        <StorageNoticeBanner onDismiss={dismissStorageNotice} onBackup={onBackup} />
      ) : null}
    </div>
  );
}

/**
 * 업데이트 알림을 전역 허브에 유지한다 (pwa R4 + app-shell R8).
 *
 * 두 규칙이 부딪히는 자리다: R4 는 "자동으로 닫히지 않는다", R8 은 "동시에 1개". 허브는 새 토스트가
 * 오면 오래된 것을 밀어내므로 그대로 두면 투두 하나만 지워도 업데이트 알림이 영영 사라진다. 그래서
 * **밀려나면 화면이 빌 때 다시 올린다**. 지금 떠 있는 토스트가 있으면 기다린다 — 곧바로 되밀면
 * 사용자가 방금 한 동작의 결과(예: `[되돌리기]`)를 읽을 기회를 뺏는다.
 */
function useUpdateToast(show: boolean, applyUpdate: () => void, dismissUpdate: () => void): void {
  const toasts = useToasts();
  const hubId = useRef<string | null>(null);
  const latest = useRef({ applyUpdate, dismissUpdate });
  useEffect(() => {
    latest.current = { applyUpdate, dismissUpdate };
  });

  useEffect(() => {
    if (!show) {
      if (hubId.current !== null) dismissToast(hubId.current);
      hubId.current = null;
      return;
    }
    if (hubId.current !== null && toasts.some((toast) => toast.id === hubId.current)) return;
    if (toasts.length > 0) return;
    hubId.current = pushToast({
      message: UPDATE_NOTICE_TEXT,
      action: { label: '새로고침', onAction: () => latest.current.applyUpdate() },
      // ✕ 로 **사용자가 직접** 닫은 것만 `isUpdateDismissed` 로 남긴다. 자동 닫힘·밀려남에서는
      // 불리지 않으므로(`Toast` 계약), 아래 "화면이 비면 다시 올린다" 와 부딪히지 않는다 —
      // 이 배선이 없으면 ✕ 를 눌러도 `show` 가 그대로라 **다음 커밋에 곧바로 되밀린다**(T-29).
      onDismiss: () => latest.current.dismissUpdate(),
      durationMs: NO_AUTO_DISMISS_MS,
    });
  }, [show, toasts]);
}
