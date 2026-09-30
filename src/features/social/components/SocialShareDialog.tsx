import { useRef, useState } from 'react';

import type { CompletedSocialChoice } from '@/features/social/components/SocialScreen';
import { useShareComposer } from '@/features/social/hooks/useShareComposer';
import { socialFailureMessage } from '@/features/social/hooks/useSocialCommand';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

type SocialShareDialogProps = {
  choices: readonly CompletedSocialChoice[];
  date: string;
  loading: boolean;
  onDateChange: (date: string) => void;
  onClose: () => void;
  onShared: (id: string, audience: 'friends' | 'public' | 'recovered') => void;
};
export function SocialShareDialog({
  choices,
  date,
  loading,
  onDateChange,
  onClose,
  onShared,
}: SocialShareDialogProps) {
  const headingRef = useRef<HTMLParagraphElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const [discard, setDiscard] = useState(false);
  const form = useShareComposer(onShared);
  const close = () => {
    if (form.text !== '') setDiscard(true);
    else onClose();
  };
  const locked = form.command.busy || form.uncertain;
  const canShare =
    form.uncertain ||
    (form.category !== null && form.category.visibility !== 'private' && !form.checking);
  const audience =
    form.category?.visibility === 'public'
      ? '모두 공개'
      : form.category?.visibility === 'friends'
        ? '친구만'
        : '나만 보기';
  return (
    <>
      <Dialog
        open
        title="완료한 기록 공유"
        onClose={close}
        initialFocusRef={headingRef}
        footer={
          <>
            <Button variant="outline" disabled={form.command.busy} onClick={close}>
              닫기
            </Button>
            <Button
              loading={form.command.busy}
              disabled={!canShare}
              onClick={() => void form.share()}
            >
              {form.uncertain ? '완료 여부 확인' : '공유하기'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-[var(--space-4)]">
          <p ref={headingRef} tabIndex={-1} className="text-sm text-muted outline-none">
            직접 고른 한 건만 별도 사본으로 공유해요. 새로고침하면 작성 중인 문장은 지워져요.
          </p>
          <label className="flex flex-col gap-[var(--space-2)]">
            기록 날짜
            <input
              type="date"
              value={date}
              disabled={locked}
              onChange={(event) => onDateChange(event.target.value)}
              className="min-h-[var(--control-height)] min-w-0 rounded-[var(--radius-md)] border border-border bg-surface px-[var(--space-3)] focus-visible:outline-2 focus-visible:outline-focus"
            />
          </label>
          {loading ? <p role="status">완료한 할 일을 불러오는 중</p> : null}
          {!loading && choices.length === 0 ? (
            <p>완료한 할 일이 생기면 여기에서 골라 공유할 수 있어요.</p>
          ) : null}
          <fieldset disabled={locked} className="flex flex-col gap-[var(--space-2)]">
            <legend className="mb-[var(--space-2)] text-sm text-muted">완료한 할 일 선택</legend>
            {choices.map((choice) => (
              <label
                key={choice.key}
                className="flex items-start gap-[var(--space-2)] rounded-[var(--radius-md)] border border-border p-[var(--space-3)]"
              >
                <input
                  type="radio"
                  name="completed-record"
                  checked={form.selected?.key === choice.key}
                  onChange={() => form.select(choice)}
                  className="mt-[var(--space-1)] accent-accent focus-visible:outline-2 focus-visible:outline-focus"
                />
                <span className="min-w-0 break-words">
                  {choice.text}
                  <span className="block text-sm text-muted">{choice.categoryLabel}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {form.selected === null ? null : (
            <>
              <label className="flex flex-col gap-[var(--space-2)]">
                공유 문장
                <textarea
                  value={form.text}
                  disabled={locked}
                  onChange={(event) => form.setText(event.target.value)}
                  aria-describedby="share-preview-help"
                  rows={4}
                  maxLength={560}
                  className="w-full min-w-0 resize-y rounded-[var(--radius-md)] border border-border bg-surface p-[var(--space-3)] text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                />
              </label>
              <section
                aria-label="공유 미리보기"
                className="rounded-[var(--radius-lg)] border border-border bg-surface-2 p-[var(--space-3)]"
              >
                <p className="text-sm text-muted">
                  {form.selected.happenedOn} · {form.category?.emoji}{' '}
                  {form.category?.name ?? form.selected.categoryLabel} · {audience}
                </p>
                <p className="mt-[var(--space-2)] break-words whitespace-pre-wrap">{form.text}</p>
              </section>
              <p id="share-preview-help" className="text-sm text-muted">
                {audience === '모두 공개'
                  ? '로그인하지 않은 사람도 볼 수 있어요. 원래 할 일을 수정하거나 지워도 이 공유는 남아요.'
                  : '현재 친구와 앞으로 추가할 친구가 볼 수 있어요. 원래 할 일을 수정하거나 지워도 이 공유는 남아요. 내 공유에서 따로 지울 수 있어요.'}
              </p>
              {form.checking ? <p role="status">공개 범위를 확인하고 있어요.</p> : null}
              {!form.checking && !canShare ? (
                <>
                  <p>
                    이 카테고리는 나만 볼 수 있어요. 다른 사람에게 공유하려면 공개 범위를 먼저 바꿔
                    주세요.
                  </p>
                  <Button
                    variant="outline"
                    disabled={locked}
                    onClick={form.selected.onChangeAudience}
                  >
                    공개 범위 바꾸기
                  </Button>
                </>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                disabled={locked}
                onClick={() => void form.reconcile()}
              >
                공개 범위 다시 확인
              </Button>
            </>
          )}
          {form.invalid ? <p role="alert">공유 문장을 1~280자로 입력해 주세요.</p> : null}
          {form.command.error === null ? null : (
            <p role="alert">
              {socialFailureMessage(form.command.error)}
              {form.command.error === 'conflict' ? ' 공개 범위를 다시 확인해 주세요.' : ''}
            </p>
          )}
        </div>
      </Dialog>
      <Dialog
        open={discard}
        role="alertdialog"
        title="작성 중인 문장을 버릴까요?"
        onClose={() => setDiscard(false)}
        initialFocusRef={continueRef}
        footer={
          <>
            <Button ref={continueRef} variant="outline" onClick={() => setDiscard(false)}>
              계속 작성
            </Button>
            <Button variant="danger" onClick={onClose}>
              버리기
            </Button>
          </>
        }
      >
        <p>
          {form.uncertain
            ? '공유 사본이 이미 만들어졌을 수 있어요. 닫은 뒤 내 공유에서 완료 여부를 확인해 주세요.'
            : '보내지 않은 문장은 저장되지 않아요.'}
        </p>
      </Dialog>
    </>
  );
}
