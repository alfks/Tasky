'use client';

import { useState } from 'react';

import type { DateKey } from '@/domain/date/date-key';
import type { PostInput } from '@/domain/social/social';

import { useCompletedSharePicker } from '@/features/social/hooks/useCompletedSharePicker';
import { copyCompletedTodo, editShareDraft } from '@/features/social/lib/share-draft';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog } from '@/components/ui/Dialog';

type SocialShareComposerProps = {
  visible: boolean;
  initialDate: DateKey;
  hasFriends: boolean | null;
  busy: boolean;
  onPublish: (draft: PostInput) => Promise<boolean>;
  onDone: () => void;
  onDirtyChange: (dirty: boolean) => void;
};

export function SocialShareComposer({
  visible,
  initialDate,
  hasFriends,
  busy,
  onPublish,
  onDone,
  onDirtyChange,
}: SocialShareComposerProps) {
  const picker = useCompletedSharePicker(initialDate);
  const [draft, setDraft] = useState<PostInput | null>(null);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const [pendingChoice, setPendingChoice] = useState<PostInput | null>(null);
  const [validationError, setValidationError] = useState(false);

  const updateDraft = (next: PostInput | null) => {
    setDraft(next);
    onDirtyChange(next !== null);
    setValidationError(false);
  };
  const requestClose = () => {
    if (draft !== null) setDiscardPrompt(true);
    else onDone();
  };
  const chooseCompleted = (next: PostInput | null) => {
    if (next === null) return;
    if (draft === null) updateDraft(next);
    else setPendingChoice(next);
  };
  const publish = async () => {
    if (draft === null || busy) return;
    const checked = editShareDraft(draft.text, draft.happenedOn);
    if (checked === null) {
      setValidationError(true);
      return;
    }
    const done = await onPublish(checked);
    if (done) {
      onDirtyChange(false);
      onDone();
    }
  };

  return (
    <>
      <Dialog
        open={visible}
        onClose={requestClose}
        title="기록 공유"
        description="완료한 할 일 한 건을 골라 공개 문장 사본을 만드세요. 새로고침하면 작성 중 문장은 사라져요."
        className="max-h-[min(90dvh,760px)] max-w-[560px] overflow-y-auto"
        footer={
          <>
            <Button variant="outline" onClick={requestClose}>
              돌아가기
            </Button>
            <Button disabled={busy || draft === null} onClick={() => void publish()}>
              친구에게 공유
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-[var(--space-4)]">
          <label className="flex flex-col gap-[var(--space-1)]">
            완료 기록 날짜
            <input
              type="date"
              value={picker.date}
              onChange={(event) => picker.setDate(event.target.value)}
              className="rounded-[var(--radius-md)] border border-border bg-bg p-[var(--space-2)]"
            />
          </label>
          {picker.phase === 'loading' ? (
            <p role="status">완료한 할 일을 불러오는 중이에요.</p>
          ) : null}
          {picker.phase === 'error' ? (
            <div role="alert">
              <p>완료한 할 일을 불러오지 못했어요.</p>
              <Button onClick={picker.retry}>다시 시도</Button>
            </div>
          ) : null}
          {picker.phase === 'ready' && picker.items.length === 0 ? (
            <p>완료한 할 일이 생기면 여기에서 골라 공유할 수 있어요</p>
          ) : null}
          {picker.phase === 'ready' && picker.items.length > 0 ? (
            <div
              role="group"
              aria-label="완료한 할 일 선택"
              className="flex flex-col gap-[var(--space-2)]"
            >
              {picker.items.map((todo) => (
                <Button
                  key={todo.id}
                  variant="outline"
                  onClick={() => chooseCompleted(copyCompletedTodo(todo))}
                >
                  {todo.title}
                </Button>
              ))}
            </div>
          ) : null}
          {draft ? (
            <section
              aria-label="공유 미리보기"
              className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-xl)] border border-border bg-surface p-[var(--space-4)]"
            >
              <label className="flex flex-col gap-[var(--space-1)]">
                공개 문장
                <textarea
                  value={draft.text}
                  maxLength={560}
                  onChange={(event) => updateDraft({ ...draft, text: event.target.value })}
                  className="min-h-[100px] rounded-[var(--radius-md)] border border-border bg-bg p-[var(--space-2)]"
                />
              </label>
              <label className="flex flex-col gap-[var(--space-1)]">
                공개 날짜
                <input
                  type="date"
                  value={draft.happenedOn}
                  onChange={(event) => updateDraft({ ...draft, happenedOn: event.target.value })}
                  className="rounded-[var(--radius-md)] border border-border bg-bg p-[var(--space-2)]"
                />
              </label>
              <div className="rounded-[var(--radius-md)] border border-border p-[var(--space-3)]">
                <p className="break-words whitespace-pre-wrap">{draft.text}</p>
                <time dateTime={draft.happenedOn}>{draft.happenedOn}</time>
              </div>
              <p className="text-sm text-muted">
                현재 친구와 앞으로 추가할 친구가 볼 수 있어요. 원래 할 일을 수정하거나 지워도 이
                공유는 남아요. 내 공유에서 따로 지울 수 있어요.
              </p>
              {hasFriends === false ? (
                <p className="text-sm text-muted">친구를 추가하면 이 기록이 보여요.</p>
              ) : null}
              {validationError ? (
                <p role="alert" className="text-danger">
                  공개 문장과 날짜를 확인해 주세요.
                </p>
              ) : null}
            </section>
          ) : null}
        </div>
      </Dialog>
      <ConfirmDialog
        open={discardPrompt && visible}
        title="작성 중인 공유를 버릴까요?"
        description="보내지 않은 문장은 사라져요."
        confirmLabel="버리기"
        cancelLabel="계속 작성"
        onConfirm={() => {
          setDiscardPrompt(false);
          onDirtyChange(false);
          onDone();
        }}
        onCancel={() => setDiscardPrompt(false)}
      />
      <ConfirmDialog
        open={pendingChoice !== null && visible}
        title="다른 완료 기록을 고를까요?"
        description="지금 작성 중인 공개 문장은 새 기록의 제목으로 바뀌어요."
        confirmLabel="바꾸기"
        cancelLabel="계속 작성"
        onConfirm={() => {
          updateDraft(pendingChoice);
          setPendingChoice(null);
        }}
        onCancel={() => setPendingChoice(null)}
      />
    </>
  );
}
