import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import {
  commandIntentStore,
  type PendingCommandDescriptor,
} from '@/features/social/hooks/social-command-intents';
import {
  pendingOwnerMatches,
  verifyPendingOwner,
  type PendingOwnerProof,
} from '@/features/social/hooks/social-command-observer';
import { socialFailureMessage, useSocialCommand } from '@/features/social/hooks/useSocialCommand';
import { captureSocialDispatch, onSocialInvalidation } from '@/features/social/session-lifecycle';

import { Button } from '@/components/ui/Button';

function operationLabel(operation: string) {
  if (operation === 'share') return '기록 공유';
  if (operation === 'profile' || operation === 'nickname') return '이름 설정';
  if (operation.startsWith('delete-')) return '공유 삭제';
  if (operation.startsWith('reaction-')) return '응원';
  if (operation.startsWith('block-')) return '차단 설정';
  if (operation.startsWith('invite-') || operation.startsWith('revoke-invite')) return '친구 초대';
  if (
    operation.startsWith('request-') ||
    operation.startsWith('accept-') ||
    operation.startsWith('decline-') ||
    operation.startsWith('cancel-')
  )
    return '친구 요청';
  return '이전 요청';
}
function PendingCommandRow({
  entry,
  proof,
  onResolved,
}: {
  entry: PendingCommandDescriptor;
  proof: PendingOwnerProof;
  onResolved: (operation: string) => { complete: () => Promise<void>; cancel: () => void };
}) {
  const command = useSocialCommand(entry.namespace, proof);
  const complete = async () => {
    const observation = onResolved(entry.operation);
    const original = commandIntentStore.get(entry.namespace);
    const result = await command.retry();
    if (
      result !== null &&
      proof.isCurrent() &&
      original !== undefined &&
      commandIntentStore.get(entry.namespace) === undefined
    )
      await observation.complete();
    else observation.cancel();
  };
  return (
    <li className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-md)] border border-border p-[var(--space-3)]">
      <span>{operationLabel(entry.operation)}</span>
      {entry.inFlight ? <p role="status">요청 결과를 확인하고 있어요.</p> : null}
      <Button
        variant="outline"
        loading={command.busy || entry.inFlight}
        disabled={!command.ownerVerified || !command.retryAllowed || entry.blocked}
        onClick={() => void complete()}
      >
        완료 여부 확인
      </Button>
      {command.error === null ? null : (
        <p className="text-sm text-muted">{socialFailureMessage(command.error)}</p>
      )}
    </li>
  );
}
/** 카드와 가입 화면이 사라져도 FIRST 요청을 명시적으로 확인할 수 있다. */
export function SocialPendingCommands({
  onResolved,
  onOwnState,
  navigationKey = '',
}: {
  onResolved: (operation: string, sameAccount: () => boolean) => void | Promise<void>;
  onOwnState: () => void;
  navigationKey?: string;
}) {
  const entries = useSyncExternalStore(
    commandIntentStore.subscribe,
    commandIntentStore.descriptors,
  );
  const [proof, setProof] = useState<PendingOwnerProof | null>(null);
  const [proofRevision, setProofRevision] = useState(0);
  const [proofChecking, setProofChecking] = useState(false);
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const alive = useRef(false);
  const navigation = useRef(navigationKey);
  navigation.current = navigationKey;
  const observations = useRef(new Set<() => void>());
  const epoch = commandIntentStore.epoch();
  const eligible = captureSocialDispatch()() && navigator.onLine && !document.hidden;
  const hasPending = entries.length > 0;
  useEffect(() => {
    alive.current = true;
    const cleanups = observations.current;
    const stop = onSocialInvalidation((reason) => {
      if (reason === 'account') setNotice('');
    });
    return () => {
      alive.current = false;
      cleanups.forEach((cancel) => cancel());
      stop();
    };
  }, []);
  useEffect(() => {
    if (!hasPending || !eligible) return;
    let current = true;
    setProofChecking(true);
    void verifyPendingOwner().then((verified) => {
      if (current) {
        setProof(verified);
        setProofChecking(false);
      }
    });
    return () => {
      current = false;
    };
  }, [epoch, eligible, hasPending, proofRevision]);
  const beginCompletion = (operation: string) => {
    const account = commandIntentStore.account();
    const actor = proof?.actorId;
    const nav = navigation.current;
    const regions: { element: HTMLElement; top: number }[] = [];
    let element = heading.current?.parentElement;
    while (element) {
      if (element.scrollHeight > element.clientHeight)
        regions.push({ element, top: element.scrollTop });
      element = element.parentElement;
    }
    let moved = false;
    const mark = () => {
      moved = true;
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchmove'] as const;
    events.forEach((name) => window.addEventListener(name, mark, { passive: true }));
    const cancel = () => {
      events.forEach((name) => window.removeEventListener(name, mark));
      observations.current.delete(cancel);
    };
    observations.current.add(cancel);
    const sameAccount = () =>
      alive.current && commandIntentStore.account() === account && captureSocialDispatch()();
    return {
      cancel,
      complete: async () => {
        if (!sameAccount()) {
          cancel();
          return;
        }
        setNotice('이전 요청의 완료 여부를 확인했어요. 현재 목록을 확인해 주세요.');
        let scheduled = false;
        try {
          await onResolved(operation, sameAccount);
          if (!sameAccount()) return;
          const fresh = await verifyPendingOwner();
          if (
            !fresh ||
            fresh.accountGeneration !== account ||
            (actor !== null && fresh.actorId !== actor)
          )
            return;
          requestAnimationFrame(() => {
            cancel();
            if (!sameAccount() || !fresh.isCurrent() || moved || navigation.current !== nav) return;
            regions.forEach((region) => {
              if (region.element.isConnected) region.element.scrollTop = region.top;
            });
            heading.current?.focus({ preventScroll: true });
          });
          scheduled = true;
        } catch {
          // 완료한 receipt는 유지하고, 현재 목록 확인 실패로 옛 내용·포커스를 복원하지 않는다.
        } finally {
          if (!scheduled) cancel();
        }
      },
    };
  };
  if (!hasPending && notice === '') return null;
  const visible = entries.filter((entry) =>
    pendingOwnerMatches(proof, commandIntentStore.get(entry.namespace)),
  );
  return (
    <section
      aria-labelledby="social-pending-heading"
      className="flex flex-col gap-[var(--space-2)]"
    >
      <h3
        id="social-pending-heading"
        ref={heading}
        tabIndex={-1}
        className="font-semibold outline-none"
      >
        확인 중인 요청
      </h3>
      {hasPending && visible.length === 0 ? (
        <>
          <p role="status">이전 요청의 계정을 확인하고 있어요.</p>
          <Button
            variant="outline"
            loading={eligible && proofChecking}
            disabled={!eligible}
            onClick={() => {
              setProof(null);
              setProofRevision((value) => value + 1);
            }}
          >
            계정 다시 확인
          </Button>
        </>
      ) : null}
      <ul className="flex flex-col gap-[var(--space-2)]">
        {visible.map((entry) => (
          <PendingCommandRow
            key={entry.namespace}
            entry={entry}
            proof={proof!}
            onResolved={beginCompletion}
          />
        ))}
      </ul>
      {visible.length > 0 ? (
        <Button variant="outline" onClick={onOwnState}>
          내 공유와 현재 상태 보기
        </Button>
      ) : null}
      <p role="status" aria-live="polite">
        {notice}
      </p>
    </section>
  );
}
