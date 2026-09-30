import { useEffect, useRef, useState } from 'react';

import { parsePostInput } from '@/domain/social/input';
import type { PostInput, SocialCategoryView } from '@/domain/social/social';

import type { CompletedSocialChoice } from '@/features/social/components/SocialScreen';
import { useSocialCommand } from '@/features/social/hooks/useSocialCommand';
import { onSocialInvalidation, onSocialReady } from '@/features/social/session-lifecycle';

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
  const command = useSocialCommand();
  useEffect(
    () =>
      onSocialInvalidation((reason) => {
        sequence.current += 1;
        setCategory(null);
        if (['auth', 'account', 'closed', 'provider', 'revoked', 'cross-tab'].includes(reason)) {
          setText('');
          setSelected(null);
          pendingInput.current = null;
        }
      }),
    [],
  );
  const reconcile = async (choice: CompletedSocialChoice) => {
    const current = ++sequence.current;
    setChecking(true);
    setCategory(null);
    try {
      const confirmed = await choice.resolveCategory();
      if (current === sequence.current) setCategory(confirmed);
    } catch {
      if (current === sequence.current) setCategory(null);
    } finally {
      if (current === sequence.current) setChecking(false);
    }
  };
  const select = (choice: CompletedSocialChoice) => {
    setSelected(choice);
    setText(choice.text);
    setInvalid(false);
    void reconcile(choice);
  };
  const share = async () => {
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
    pendingInput.current = submitted;
    const result = await command.run(
      'share',
      JSON.stringify(submitted),
      (repo, options) => repo.createPost(submitted, options),
      async (code) => {
        if (code !== 'temporary' && code !== 'request-pending') pendingInput.current = null;
        if (code === 'conflict' || code === 'unavailable') await reconcile(selected);
      },
    );
    if (result !== null) {
      pendingInput.current = null;
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
    uncertain: command.error === 'temporary' || command.error === 'request-pending',
  };
}
