import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';

import type { SocialScreenProps } from '@/features/social/components/SocialScreen';
import {
  clearPendingInvite,
  consumeInviteAfterReady,
  onIncomingInvite,
} from '@/features/social/lib/invite-bootstrap';
import type { InviteBootstrap } from '@/features/social/lib/invite-bootstrap';
import { onSocialInvalidation } from '@/features/social/session-lifecycle';

/** 셸이 사용하는 작은 화면 경계. 본문·스토어·HTTP 청크는 첫 활성화까지 import하지 않는다. */
export function useSocialShell(
  mainId: string,
  reportsOpen: boolean,
  closeReports: () => void,
  authReady: boolean,
) {
  const [open, setOpen] = useState(false);
  const [invite, setInvite] = useState<InviteBootstrap | null>(null);
  const [component, setComponent] = useState<ComponentType<SocialScreenProps> | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const updateDirty = useCallback((value: boolean) => {
    dirtyRef.current = value;
    setDirty(value);
  }, []);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const returnFocusPending = useRef(false);
  const pendingInviteRef = useRef<InviteBootstrap | null>(null);

  const openSocial = useCallback((closeReports: () => void) => {
    const opener = document.activeElement;
    openerRef.current = opener instanceof HTMLElement && opener !== document.body ? opener : null;
    closeReports();
    setOpen(true);
  }, []);
  const forceClose = useCallback(() => {
    pendingInviteRef.current = null;
    setOpen(false);
    setInvite(null);
    dirtyRef.current = false;
    setDirty(false);
    setDiscardPrompt(false);
    clearPendingInvite();
  }, []);
  const requestClose = useCallback(() => {
    if (dirtyRef.current) setDiscardPrompt(true);
    else forceClose();
  }, [forceClose]);
  const clearInvite = useCallback(() => {
    setInvite(null);
    clearPendingInvite();
  }, []);

  const applyInvite = useCallback(
    (next: InviteBootstrap) => {
      closeReports();
      setInvite(next);
      setOpen(true);
    },
    [closeReports],
  );

  useLayoutEffect(() => {
    const unsubscribe = onIncomingInvite(() => {
      if (!authReady) return;
      const next = consumeInviteAfterReady();
      if (next === null) return;
      if (dirtyRef.current) {
        pendingInviteRef.current = next;
        setDiscardPrompt(true);
      } else applyInvite(next);
    });
    if (authReady) {
      const next = consumeInviteAfterReady();
      if (next !== null) applyInvite(next);
    }
    return unsubscribe;
  }, [applyInvite, authReady]);
  useEffect(
    () =>
      onSocialInvalidation((reason) => {
        if (
          reason === 'auth' ||
          reason === 'account' ||
          reason === 'revoked' ||
          reason === 'cross-tab'
        )
          forceClose();
      }),
    [forceClose],
  );
  useEffect(() => {
    if (!open || component !== null) return;
    let current = true;
    setLoadError(false);
    void import('@/features/social/components/SocialScreen').then(
      (module) => {
        if (current) setComponent(() => module.SocialScreen);
      },
      () => {
        if (current) setLoadError(true);
      },
    );
    return () => {
      current = false;
    };
  }, [open, component, loadAttempt]);
  useEffect(() => {
    if (!open) return;
    const handle = requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(handle);
  }, [open]);
  useEffect(() => {
    if (wasOpen.current && !open) returnFocusPending.current = true;
    wasOpen.current = open;
    if (open || reportsOpen) {
      // 새 친구 화면이나 Reports가 포커스를 소유하면 옛 복귀 예약을 폐기한다.
      returnFocusPending.current = false;
      return;
    }
    if (returnFocusPending.current) {
      const handle = requestAnimationFrame(() => {
        if (!returnFocusPending.current) return;
        returnFocusPending.current = false;
        const opener = openerRef.current;
        if (opener?.isConnected) opener.focus({ preventScroll: true });
        else document.getElementById(mainId)?.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(handle);
    }
  }, [open, reportsOpen, mainId]);

  return {
    open,
    invite,
    component,
    loadError,
    dirty,
    discardPrompt,
    headingRef,
    openSocial,
    forceClose,
    requestClose,
    clearInvite,
    setDirty: updateDirty,
    retryLoad: () => setLoadAttempt((value) => value + 1),
    confirmDiscard: (): boolean => {
      setDiscardPrompt(false);
      const next = pendingInviteRef.current;
      if (next !== null) {
        pendingInviteRef.current = null;
        dirtyRef.current = false;
        setDirty(false);
        applyInvite(next);
        return true;
      }
      forceClose();
      return false;
    },
    cancelDiscard: () => {
      setDiscardPrompt(false);
      if (pendingInviteRef.current !== null) {
        pendingInviteRef.current = null;
        clearPendingInvite();
      }
    },
  };
}
