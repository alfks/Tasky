import { useEffect, useRef, useState } from 'react';

import { parsePostInput } from '@/domain/social/input';
import type { PostInput, SocialCategoryView, SocialErrorCode } from '@/domain/social/social';

import type { CompletedSocialChoice } from '@/features/social/components/SocialScreen';
import { useSocialCommand } from '@/features/social/hooks/useSocialCommand';
import {
  captureSocialDispatch,
  onSocialInvalidation,
  onSocialReady,
} from '@/features/social/session-lifecycle';

export function useShareComposer(
  onShared: (id: string, audience: 'friends' | 'public' | 'recovered') => void,
) {
  const [selected, setSelected] = useState<CompletedSocialChoice | null>(null);
  const [text, setText] = useState('');
  const [category, setCategory] = useState<SocialCategoryView | null>(null);
  const [checking, setChecking] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const sequence = useRef(0);
  const pendingInput = useRef<PostInput | null>(null);
  const pendingCategory = useRef<SocialCategoryView | null>(null);
  const command = useSocialCommand('share');
  let recoveryInput: PostInput | null = null;
  if (command.ownerVerified && command.pending?.operation === 'share') {
    try {
      const parsed = parsePostInput(JSON.parse(command.pending.signature));
      if (parsed.ok) recoveryInput = parsed.value;
    } catch {
      /* 형식이 잘못된 의도는 내용 없이 원래 명령만 확인한다. */
    }
  }
  useEffect(
    () =>
      onSocialInvalidation((reason) => {
        sequence.current += 1;
        setCategory(null);
        setChecking(false);
        if (reason === 'account') {
          setText('');
          setSelected(null);
          pendingInput.current = null;
          pendingCategory.current = null;
        }
      }),
    [],
  );
  const reconcile = async (choice: CompletedSocialChoice) => {
    const current = ++sequence.current;
    const allowed = captureSocialDispatch();
    setChecking(true);
    setCategory(null);
    try {
      const confirmed = await choice.resolveCategory();
      if (current === sequence.current && allowed()) setCategory(confirmed);
    } catch {
      if (current === sequence.current && allowed()) setCategory(null);
    } finally {
      if (current === sequence.current && allowed()) setChecking(false);
    }
  };
  const select = (choice: CompletedSocialChoice) => {
    if (command.busy || command.uncertain) return;
    setSelected(choice);
    setText(choice.text);
    setInvalid(false);
    void reconcile(choice);
  };
  const share = async () => {
    const current = sequence.current;
    const allowed = captureSocialDispatch();
    let submitted = pendingInput.current;
    const isCurrent = () =>
      current === sequence.current && allowed() && pendingInput.current === submitted;
    const clearPending = () => {
      pendingInput.current = null;
      pendingCategory.current = null;
    };
    const onFailure = (code: SocialErrorCode, uncertain: boolean) => {
      if (!isCurrent() || uncertain) return;
      clearPending();
      if (selected === null) {
        setCategory(null);
        setChecking(false);
      } else if (code === 'conflict' || code === 'limit-reached' || code === 'unavailable') {
        // 계정 확인·명령 관측은 끝났으므로 후속 읽기가 busy 수명을 늘리지 않는다.
        void reconcile(selected);
      }
    };
    const finish = (
      result: { id: string } | null,
      audience: 'friends' | 'public' | 'recovered',
    ) => {
      if (!isCurrent()) return;
      if (result !== null) {
        clearPending();
        onShared(result.id, audience);
      } else if (!command.hasIntent()) clearPending();
    };
    if (command.hasIntent()) {
      if (!command.ownerVerified || !command.retryAllowed) return;
      const result = await command.retry<{ id: string }>(onFailure);
      finish(result, 'recovered');
      return;
    }
    if (selected === null) return;
    if (
      pendingInput.current === null &&
      (category === null || category.visibility === 'private' || category.revoked || checking)
    )
      return;
    const input = pendingInput.current ?? {
      text,
      happenedOn: selected.happenedOn,
      categoryId: category!.id,
      categoryVersion: category!.version,
    };
    const parsed = parsePostInput(input);
    if (!parsed.ok) {
      setInvalid(true);
      return;
    }
    const recovering = pendingInput.current !== null;
    const commandInput = pendingInput.current ?? parsed.value;
    submitted = commandInput;
    if (pendingInput.current === null) pendingCategory.current = category;
    pendingInput.current = submitted;
    const result = await command.run(
      'share',
      JSON.stringify(commandInput),
      (repo, options) => repo.createPost(commandInput, options),
      onFailure,
    );
    finish(
      result,
      recovering ? 'recovered' : category?.visibility === 'public' ? 'public' : 'friends',
    );
  };
  const resume = useRef<() => void>(() => undefined);
  resume.current = () => {
    if (selected !== null) void reconcile(selected);
  };
  useEffect(() => onSocialReady(() => resume.current()), []);
  useEffect(
    () => () => {
      sequence.current += 1;
    },
    [],
  );
  return {
    selected,
    text,
    setText,
    category,
    checking,
    invalid,
    command,
    select,
    share,
    reconcile: () => (selected === null ? Promise.resolve() : reconcile(selected)),
    uncertain: command.uncertain,
    recoveryInput,
    previewCategory: command.uncertain ? pendingCategory.current : category,
  };
}
