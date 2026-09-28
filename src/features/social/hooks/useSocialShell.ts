import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';

import type { SocialScreenProps } from '@/features/social/components/SocialScreen';
import {
  clearPendingInvite,
  consumeInviteAfterReady,
} from '@/features/social/lib/invite-bootstrap';
import type { InviteBootstrap } from '@/features/social/lib/invite-bootstrap';
import { onSocialInvalidation } from '@/features/social/session-lifecycle';

/** 셸이 사용하는 작은 화면 경계. 본문·스토어·HTTP 청크는 첫 활성화까지 import하지 않는다. */
export function useSocialShell(mainId: string, reportsOpen: boolean) {
  const [open, setOpen] = useState(false);
  const [invite, setInvite] = useState<InviteBootstrap | null>(null);
  const [component, setComponent] = useState<ComponentType<SocialScreenProps> | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);

  const openSocial = useCallback((closeReports: () => void) => {
    const opener = document.activeElement;
    openerRef.current = opener instanceof HTMLElement && opener !== document.body ? opener : null;
    closeReports();
    setOpen(true);
  }, []);
  const forceClose = useCallback(() => {
    setOpen(false);
    setInvite(null);
    setDirty(false);
    clearPendingInvite();
  }, []);
  const requestClose = useCallback(() => {
    if (dirty) setDiscardPrompt(true);
    else forceClose();
  }, [dirty, forceClose]);
  const clearInvite = useCallback(() => {
    setInvite(null);
    clearPendingInvite();
  }, []);

  useLayoutEffect(() => {
    const next = consumeInviteAfterReady();
    if (next !== null) {
      setInvite(next);
      setOpen(true);
    }
  }, []);
  useEffect(
    () =>
      onSocialInvalidation((reason) => {
        if (reason === 'auth' || reason === 'account' || reason === 'revoked' || reason === 'cross-tab') forceClose();
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
    if (open && !wasOpen.current) {
      wasOpen.current = true;
      const handle = requestAnimationFrame(() =>
        headingRef.current?.focus({ preventScroll: true }),
      );
      return () => cancelAnimationFrame(handle);
    }
    if (!open && wasOpen.current && !reportsOpen) {
      wasOpen.current = false;
      const handle = requestAnimationFrame(() => {
        const opener = openerRef.current;
        if (opener?.isConnected) opener.focus({ preventScroll: true });
        else document.getElementById(mainId)?.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(handle);
    }
    wasOpen.current = open;
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
    setDirty,
    retryLoad: () => setLoadAttempt((value) => value + 1),
    confirmDiscard: () => {
      setDiscardPrompt(false);
      forceClose();
    },
    cancelDiscard: () => setDiscardPrompt(false),
  };
}
