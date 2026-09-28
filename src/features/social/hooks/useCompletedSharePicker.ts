import { useEffect, useRef, useState } from 'react';

import type { DateKey } from '@/domain/date/date-key';
import { isHappenedOn } from '@/domain/social/input';
import type { Todo } from '@/domain/todo/todo';

import { getRepositories } from '@/repositories/container';

import { captureSocialDispatch, onSocialInvalidation } from '@/features/social/session-lifecycle';
import { useSocialStore } from '@/features/social/store/social-store';

/** 개인 화면 선택 날짜와 독립된 날짜로 완료 기록만 읽는다. */
export function useCompletedSharePicker(initialDate: DateKey) {
  const [date, setDate] = useState<DateKey>(initialDate);
  const [items, setItems] = useState<readonly Todo[]>([]);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const socialPhase = useSocialStore((state) => state.phase);

  useEffect(() => {
    if (socialPhase === 'ready') setAttempt((current) => current + 1);
  }, [socialPhase]);

  useEffect(
    () =>
      onSocialInvalidation((reason) => {
        if (
          reason === 'auth' ||
          reason === 'account' ||
          reason === 'revoked' ||
          reason === 'cross-tab' ||
          reason === 'provider' ||
          reason === 'closed'
        ) {
          generation.current += 1;
          setItems([]);
        }
      }),
    [],
  );

  useEffect(() => {
    const current = ++generation.current;
    const allowed = captureSocialDispatch();
    setItems([]);
    setPhase('loading');
    void getRepositories()
      .todos.listByDate(date)
      .then(
        (todos) => {
          if (!allowed() || generation.current !== current) return;
          setItems(todos.filter((todo) => todo.done));
          setPhase('ready');
        },
        () => {
          if (!allowed() || generation.current !== current) return;
          setPhase('error');
        },
      );
    return () => {
      generation.current += 1;
    };
  }, [date, attempt]);

  return {
    date,
    setDate: (value: string) => {
      if (isHappenedOn(value)) setDate(value as DateKey);
    },
    items,
    phase,
    retry: () => setAttempt((current) => current + 1),
  };
}
