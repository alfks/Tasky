'use client';

import type { ComponentType, RefObject } from 'react';

import type { DateKey } from '@/domain/date/date-key';

import { SHELL_MAIN_ID } from '@/features/shell/lib/main-id';
import type { InviteBootstrap } from '@/features/social';

import { Button } from '@/components/ui/Button';

type SocialContentProps = {
  invite: InviteBootstrap | null;
  onClearInvite: (expected: InviteBootstrap) => boolean;
  initialDate: DateKey;
  onDraftDirtyChange: (dirty: boolean) => void;
};

type ShellSocialFrameProps = SocialContentProps & {
  screen: ComponentType<SocialContentProps> | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  loadError: boolean;
  onRetryLoad: () => void;
  onBack: () => void;
};

/** 단일 main과 안정된 제목을 유지하는 경량 프레임. 실제 소셜 화면은 첫 진입 때 청크로 온다. */
export function ShellSocialFrame({
  screen: Screen,
  headingRef,
  loadError,
  onRetryLoad,
  onBack,
  invite,
  onClearInvite,
  initialDate,
  onDraftDirtyChange,
}: ShellSocialFrameProps) {
  return (
    <main
      id={SHELL_MAIN_ID}
      tabIndex={-1}
      className="mx-auto flex min-h-0 w-full max-w-[840px] min-w-0 flex-1 flex-col gap-[var(--space-4)] outline-none"
    >
      <div className="flex shrink-0 items-center justify-between gap-[var(--space-2)]">
        <Button variant="ghost" onClick={onBack}>
          내 할 일로
        </Button>
        <h1 ref={headingRef} tabIndex={-1} className="text-xl font-bold outline-none">
          친구
        </h1>
        <span className="w-[6rem]" aria-hidden="true" />
      </div>
      {Screen ? (
        <Screen
          invite={invite}
          onClearInvite={onClearInvite}
          initialDate={initialDate}
          onDraftDirtyChange={onDraftDirtyChange}
        />
      ) : loadError ? (
        <div role="alert" className="flex flex-col items-start gap-[var(--space-2)]">
          <p>친구 화면을 불러오지 못했어요.</p>
          <Button onClick={onRetryLoad}>다시 시도</Button>
        </div>
      ) : (
        <p role="status">친구 화면을 불러오는 중이에요.</p>
      )}
    </main>
  );
}
