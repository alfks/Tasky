import { useState } from 'react';

import { parseNickname } from '@/domain/social/input';

import { socialFailureMessage, useSocialCommand } from '@/features/social/hooks/useSocialCommand';

import { Button } from '@/components/ui/Button';

type SocialOnboardingProps = { enabled: boolean; onReady: () => void };
export function SocialOnboarding({ enabled, onReady }: SocialOnboardingProps) {
  const command = useSocialCommand('profile');
  const [nickname, setNickname] = useState(command.pending?.signature ?? '');
  const [invalid, setInvalid] = useState(false);
  const start = async () => {
    const parsed = parseNickname(nickname);
    if (!parsed.ok) {
      setInvalid(true);
      return;
    }
    const created = await command.run('profile', parsed.value, (repo) =>
      repo.createProfile({ nickname: parsed.value }),
    );
    if (created !== null) onReady();
  };
  return (
    <section
      aria-label="친구 공유 시작하기"
      className="flex max-w-[440px] flex-col gap-[var(--space-4)] rounded-[var(--radius-xl)] border border-border bg-surface p-[var(--space-5)]"
    >
      <h2 className="text-lg font-semibold">친구에게 보일 이름을 정해 주세요</h2>
      <p className="text-sm text-muted">
        소셜 참여는 선택이에요. 이메일, 구글 이름과 사진은 공개하지 않아요.
      </p>
      <label className="flex flex-col gap-[var(--space-2)]">
        친구에게 보일 별명
        <input
          aria-describedby="social-nickname-help"
          value={nickname}
          onChange={(event) => {
            setNickname(event.target.value);
            setInvalid(false);
          }}
          maxLength={40}
          disabled={command.busy || command.uncertain}
          className="h-[var(--control-height)] rounded-[var(--radius-md)] border border-border bg-surface px-[var(--space-3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        />
      </label>
      <p id="social-nickname-help" className="text-sm text-muted">
        1~20자. 다른 사람과 같은 이름을 사용할 수 있어요.
      </p>
      {invalid ? <p role="alert">별명을 1~20자로 입력해 주세요.</p> : null}
      {command.error === null ? null : <p role="alert">{socialFailureMessage(command.error)}</p>}
      <Button
        disabled={!enabled || (command.uncertain && !command.retryAllowed)}
        loading={command.busy}
        onClick={() => void start()}
      >
        {command.uncertain ? '완료 여부 확인' : '시작하기'}
      </Button>
    </section>
  );
}
