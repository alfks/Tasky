import { useEffect, useRef, useState } from 'react';

import { parsePostInput } from '@/domain/social/input';
import type { PostInput, SocialCategoryView } from '@/domain/social/social';

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
      if (current === sequence.current) setCategory(null);
    } finally {
      if (current === sequence.current) setChecking(false);
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
    if (command.hasIntent()) {
      if (!command.ownerVerified || !command.retryAllowed) return;
      const result = await command.retry<{ id: string }>();
      if (result !== null && current === sequence.current && allowed())
        onShared(result.id, 'recovered');
      return;
    }
    if (selected === null) return;
    if (
      pendingInput.current === null &&
      (category === null || category.visibility === 'private' || checking)
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
    const submitted = pendingInput.current ?? parsed.value;
    if (pendingInput.current === null) pendingCategory.current = category;
    pendingInput.current = submitted;
    const result = await command.run(
      'share',
      JSON.stringify(submitted),
      (repo, options) => repo.createPost(submitted, options),
      async (code, uncertain) => {
        if (!uncertain) {
          pendingInput.current = null;
          pendingCategory.current = null;
        }
        if (code === 'conflict' || code === 'unavailable') await reconcile(selected);
      },
    );
    if (result === null && !command.hasIntent()) {
      pendingInput.current = null;
      pendingCategory.current = null;
    }
    if (result !== null && current === sequence.current && allowed()) {
      pendingInput.current = null;
      pendingCategory.current = null;
      onShared(
        result.id,
        recovering ? 'recovered' : category?.visibility === 'public' ? 'public' : 'friends',
      );
    }
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
