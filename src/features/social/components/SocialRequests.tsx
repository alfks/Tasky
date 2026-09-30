import { useRef, useState } from 'react';

import type { RequestView } from '@/domain/social/social';

import { SocialPagination } from '@/features/social/components/SocialPagination';
import { socialFailureMessage, useSocialCommand } from '@/features/social/hooks/useSocialCommand';
import { useSocialResource } from '@/features/social/hooks/useSocialResource';
import { invalidateSocialSession, recheckSocialSession } from '@/features/social/session-lifecycle';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

type SocialRequestsProps = { direction: 'incoming' | 'outgoing'; enabled: boolean };
export function SocialRequests({ direction, enabled }: SocialRequestsProps) {
  const requests = useSocialResource((repo, cursor) =>
    repo.requests(direction, cursor === undefined ? undefined : { cursor }),
  );
  const command = useSocialCommand(`requests-${direction}`);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const [leaving, setLeaving] = useState(false);
  const close = () => {
    if (command.busy) return;
    if (command.uncertain) setLeaving(true);
    else setBlockRequest(null);
  };
  const [blockRequest, setBlockRequest] = useState<RequestView | null>(null);
  const act = async (request: RequestView, action: 'accept' | 'decline' | 'cancel' | 'block') => {
    const input = { peerId: request.peer.id, expectedVersion: request.pairVersion };
    const result = await command.run(
      `${action}-${request.peer.id}`,
      JSON.stringify(input),
      (repo, options) => {
        if (action === 'accept') return repo.acceptRequest(input, options);
        if (action === 'decline') return repo.declineRequest(input, options);
        if (action === 'cancel') return repo.cancelRequest(input, options);
        return repo.setBlock({ ...input, blocked: true }, options).then((value) => ({
          ...value,
          data: {
            peerId: input.peerId,
            pairVersion: value.data.pairVersion,
            state: 'none' as const,
          },
        }));
      },
      async (code) => {
        if (code === 'conflict') {
          setBlockRequest(null);
          await requests.refresh();
          headingRef.current?.focus();
        }
      },
    );
    if (result !== null) {
      setBlockRequest(null);
      if (action === 'block' || action === 'accept') {
        invalidateSocialSession('revoked');
        await recheckSocialSession();
      } else await requests.refresh();
      headingRef.current?.focus();
    }
  };
  const title = direction === 'incoming' ? '받은 요청' : '보낸 요청';
  return (
    <section aria-label={title} className="flex flex-col gap-[var(--space-3)]">
      <h3 ref={headingRef} tabIndex={-1} className="text-base font-semibold outline-none">
        {title}
      </h3>
      {requests.busy ? <p role="status">요청을 불러오는 중</p> : null}
      {requests.items.length === 0 && !requests.busy ? (
        <p className="text-sm text-muted">대기 중인 요청이 없어요</p>
      ) : null}
      {command.error === null && requests.error === null ? null : (
        <p role="alert">{socialFailureMessage(command.error ?? requests.error)}</p>
      )}
      {command.uncertain ? (
        <Button
          disabled={!command.retryAllowed}
          onClick={() =>
            void command.retry().then(async (result) => {
              if (result === null) return;
              setBlockRequest(null);
              invalidateSocialSession('revoked');
              await recheckSocialSession();
              await requests.refresh();
              headingRef.current?.focus();
            })
          }
        >
          완료 여부 확인
        </Button>
      ) : null}
      <ul className="flex flex-col gap-[var(--space-2)]">
        {requests.items.map((request) => (
          <li
            key={request.peer.id}
            className="flex flex-wrap items-center justify-between gap-[var(--space-2)] rounded-[var(--radius-md)] border border-border p-[var(--space-3)]"
          >
            <span className="break-words">{request.peer.nickname}</span>
            <div className="flex flex-wrap gap-[var(--space-2)]">
              {direction === 'incoming' ? (
                <>
                  <Button
                    size="sm"
                    disabled={!enabled || requests.busy || command.uncertain}
                    loading={command.busy}
                    onClick={() => void act(request, 'accept')}
                  >
                    수락
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    loading={command.busy}
                    disabled={command.uncertain}
                    onClick={() => void act(request, 'decline')}
                  >
                    거절
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={command.busy}
                    disabled={command.uncertain}
                    onClick={() => setBlockRequest(request)}
                  >
                    차단
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  loading={command.busy}
                  disabled={command.uncertain}
                  onClick={() => void act(request, 'cancel')}
                >
                  요청 취소
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {blockRequest === null ? null : (
        <Dialog
          open
          role="alertdialog"
          title={`${blockRequest.peer.nickname}님 차단`}
          onClose={close}
          initialFocusRef={cancelRef}
          returnFocus={() => headingRef.current}
          footer={
            <>
              <Button ref={cancelRef} variant="outline" disabled={command.busy} onClick={close}>
                취소
              </Button>
              <Button
                variant="danger"
                loading={command.busy}
                disabled={command.uncertain && !command.retryAllowed}
                onClick={() => void act(blockRequest, 'block')}
              >
                {command.uncertain ? '완료 여부 확인' : '확인'}
              </Button>
            </>
          }
        >
          <p>이 계정에서는 서로의 기록을 숨겨요. 모두 공개인 기록은 로그아웃하면 볼 수 있어요.</p>
          {command.error === null ? null : (
            <p role="alert">{socialFailureMessage(command.error)}</p>
          )}
        </Dialog>
      )}
      <Dialog
        open={leaving}
        role="alertdialog"
        title="완료 여부를 나중에 확인할까요?"
        onClose={() => setLeaving(false)}
        initialFocusRef={continueRef}
        footer={
          <>
            <Button ref={continueRef} variant="outline" onClick={() => setLeaving(false)}>
              같은 요청으로 확인
            </Button>
            <Button
              onClick={() => {
                setLeaving(false);
                setBlockRequest(null);
              }}
            >
              나중에 확인
            </Button>
          </>
        }
      >
        <p>
          요청이 이미 적용됐을 수 있어요. 완료 여부 확인에서 같은 요청으로 다시 확인할 수 있어요.
        </p>
      </Dialog>
      <SocialPagination
        pageIndex={requests.pageIndex}
        nextCursor={requests.nextCursor}
        busy={requests.busy}
        onNext={() => void requests.next()}
        onPrevious={() => void requests.previous()}
      />
    </section>
  );
}
