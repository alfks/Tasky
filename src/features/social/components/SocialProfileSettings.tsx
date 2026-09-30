import { useRef, useState } from 'react';

import { parseNickname } from '@/domain/social/input';
import type { ProfileView } from '@/domain/social/social';

import { socialFailureMessage, useSocialCommand } from '@/features/social/hooks/useSocialCommand';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

type SocialProfileSettingsProps = { profile: ProfileView; enabled: boolean; onChanged: () => void };
export function SocialProfileSettings({ profile, enabled, onChanged }: SocialProfileSettingsProps) {
  const [open, setOpen] = useState(false);
  const [nickname, setNickname] = useState(profile.nickname);
  const [invalid, setInvalid] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const command = useSocialCommand();
  const save = async () => {
    const parsed = parseNickname(nickname);
    if (!parsed.ok) {
      setInvalid(true);
      return;
    }
    const input = { nickname: parsed.value, expectedVersion: profile.version };
    if (
      (await command.run('nickname', JSON.stringify(input), (repo, options) =>
        repo.renameProfile(input, options),
      )) !== null
    ) {
      setOpen(false);
      onChanged();
    }
  };
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={!enabled}
        onClick={() => {
          setNickname(profile.nickname);
          setOpen(true);
        }}
      >
        별명 변경
      </Button>
      <Dialog
        open={open}
        title="친구에게 보일 별명 변경"
        onClose={() => {
          if (!command.busy) setOpen(false);
        }}
        initialFocusRef={cancelRef}
        footer={
          <>
            <Button
              ref={cancelRef}
              variant="outline"
              disabled={command.busy}
              onClick={() => setOpen(false)}
            >
              취소
            </Button>
            <Button loading={command.busy} onClick={() => void save()}>
              별명 저장
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-[var(--space-2)]">
          친구에게 보일 별명
          <input
            value={nickname}
            disabled={command.busy}
            maxLength={40}
            onChange={(event) => {
              setNickname(event.target.value);
              setInvalid(false);
            }}
            className="h-[var(--control-height)] rounded-[var(--radius-md)] border border-border bg-surface px-[var(--space-3)] focus-visible:outline-2 focus-visible:outline-focus"
          />
        </label>
        {invalid ? <p role="alert">별명을 1~20자로 입력해 주세요.</p> : null}
        {command.error === null ? null : <p role="alert">{socialFailureMessage(command.error)}</p>}
      </Dialog>
    </>
  );
}
