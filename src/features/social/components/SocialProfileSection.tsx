'use client';

import { useState } from 'react';

import type { useSocialRelations } from '@/features/social/hooks/useSocialRelations';

import { Button } from '@/components/ui/Button';

type SocialProfileSectionProps = {
  relations: ReturnType<typeof useSocialRelations>;
};

export function SocialProfileSection({ relations }: SocialProfileSectionProps) {
  const [nickname, setNickname] = useState('');
  const profile = relations.data.me?.profile;
  const mode = relations.data.me?.mode;

  return (
    <section
      aria-labelledby="social-profile-title"
      className="rounded-[var(--radius-xl)] border border-border bg-surface p-[var(--space-4)]"
    >
      <h2 id="social-profile-title" tabIndex={-1} className="font-semibold outline-none">
        내 별명
      </h2>
      {profile ? (
        <p className="mt-[var(--space-2)]">{profile.nickname}</p>
      ) : (
        <p className="mt-[var(--space-2)]">친구에게 보일 별명을 직접 정해 주세요.</p>
      )}
      {mode === 'enabled' ? (
        <div className="mt-[var(--space-3)] flex flex-wrap gap-[var(--space-2)]">
          <label className="flex flex-col gap-[var(--space-1)] text-sm">
            {profile ? '새 별명' : '친구에게 보일 별명'}
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={40}
              className="rounded-[var(--radius-md)] border border-border bg-bg px-[var(--space-2)] py-[var(--space-1)] text-text"
            />
          </label>
          <Button
            disabled={relations.busy || nickname.trim().length === 0}
            onClick={() => {
              const valid = relations.captureView();
              void (profile ? relations.rename(nickname) : relations.createProfile(nickname)).then(
                (done) => {
                  if (!done || !valid()) return;
                  setNickname('');
                  requestAnimationFrame(() => {
                    if (!valid()) return;
                    if (
                      document
                        .getElementById('social-tab-friends')
                        ?.getAttribute('aria-selected') === 'true'
                    )
                      document
                        .getElementById('social-profile-title')
                        ?.focus({ preventScroll: true });
                  });
                },
              );
            }}
          >
            {profile ? '별명 바꾸기' : '시작하기'}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
