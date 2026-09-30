import { useEffect, useRef, useState } from 'react';

import { parseNickname } from '@/domain/social/input';
import type { ProfileView } from '@/domain/social/social';

import { getSocialRepository } from '@/repositories/container';

import { socialFailureMessage, useSocialCommand } from '@/features/social/hooks/useSocialCommand';
import {
  captureSocialDispatch,
  invalidateSocialSession,
} from '@/features/social/session-lifecycle';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

type SocialProfileSettingsProps = { profile: ProfileView; enabled: boolean; onChanged: () => void };
export function SocialProfileSettings({ profile, enabled, onChanged }: SocialProfileSettingsProps) {
  const command = useSocialCommand('nickname');
  const [open, setOpen] = useState(false);
  const [nickname, setNickname] = useState(profile.nickname);
  const [canonical, setCanonical] = useState(profile);
  const [invalid, setInvalid] = useState(false);
  const [review, setReview] = useState(false);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const sequence = useRef(0);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  useEffect(
    () => () => {
      sequence.current += 1;
    },
    [],
  );
  const refresh = async () => {
    const current = ++sequence.current;
    const allowed = captureSocialDispatch();
    setChecking(true);
    setFailed(false);
    try {
      const result = await getSocialRepository().me();
      if (current !== sequence.current || !allowed()) return;
      if (result.data.profile?.id !== profile.id) {
        invalidateSocialSession('account');
        return;
      }
      setCanonical(result.data.profile);
    } catch {
      if (current === sequence.current && allowed()) setFailed(true);
    } finally {
      if (current === sequence.current) {
        setChecking(false);
        if (!allowed()) setFailed(true);
      }
    }
  };
  const close = () => {
    if (command.busy) return;
    if (command.uncertain) setLeaving(true);
    else setOpen(false);
  };
  const conflict = async (code: string) => {
    if (code !== 'conflict') return;
    setReview(true);
    await refresh();
  };
  const save = async () => {
    if (checking || failed) return;
    const parsed = parseNickname(nickname);
    if (!parsed.ok) {
      setInvalid(true);
      return;
    }
    const input = { nickname: parsed.value, expectedVersion: canonical.version };
    const result = command.uncertain
      ? await command.retry(conflict)
      : await command.run(
          'nickname',
          JSON.stringify(input),
          (repo, options) => repo.renameProfile(input, options),
          conflict,
        );
    if (result !== null) {
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
          const pending = command.pending;
          setNickname(
            pending
              ? (JSON.parse(pending.signature) as { nickname: string }).nickname
              : profile.nickname,
          );
          setCanonical(profile);
          setOpen(true);
        }}
      >
        별명 변경
      </Button>
      <Dialog
        open={open}
        title="친구에게 보일 별명 변경"
        onClose={close}
        initialFocusRef={cancelRef}
        footer={
          <>
            <Button ref={cancelRef} variant="outline" disabled={command.busy} onClick={close}>
              취소
            </Button>
            <Button
              loading={command.busy}
              disabled={checking || failed || (command.uncertain && !command.retryAllowed)}
              onClick={() => void save()}
            >
              {command.uncertain ? '완료 여부 확인' : '별명 저장'}
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-[var(--space-2)]">
          친구에게 보일 별명
          <input
            value={nickname}
            disabled={command.busy || command.uncertain}
            maxLength={40}
            onChange={(event) => {
              setNickname(event.target.value);
              setInvalid(false);
            }}
            className="h-[var(--control-height)] rounded-[var(--radius-md)] border border-border bg-surface px-[var(--space-3)] focus-visible:outline-2 focus-visible:outline-focus"
          />
        </label>
        {review ? (
          <p role="status">
            현재 별명: {canonical.nickname}. 작성한 이름을 확인한 뒤 다시 저장해 주세요.
          </p>
        ) : null}
        {checking ? <p role="status">현재 별명을 확인하고 있어요.</p> : null}
        {failed ? (
          <p role="alert">
            현재 별명을 확인하지 못했어요.
            <Button variant="outline" onClick={() => void refresh()}>
              다시 확인
            </Button>
          </p>
        ) : null}
        {invalid ? <p role="alert">별명을 1~20자로 입력해 주세요.</p> : null}
        {command.error === null ? null : <p role="alert">{socialFailureMessage(command.error)}</p>}
      </Dialog>
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
                setOpen(false);
              }}
            >
              나중에 확인
            </Button>
          </>
        }
      >
        <p>별명이 이미 변경됐을 수 있어요. 다시 열면 같은 요청으로 확인할 수 있어요.</p>
      </Dialog>
    </>
  );
}
