import { afterEach, expect, it } from 'vitest';

import { invalidateSocialSession } from '@/features/social/session-lifecycle';
import { useSocialStore } from '@/features/social/store/social-store';

afterEach(() => useSocialStore.getState().close());

it('초안과 명시적 재시도 key는 탭 메모리에 두고 세션 철회 시 지운다', async () => {
  await useSocialStore.getState().open();
  useSocialStore.getState().setDraft('작성 중');
  const key = useSocialStore.getState().keyFor('post:one');
  expect(key).toMatch(/^v1\.\d+\.[0-9a-f]{32}$/u);
  expect(useSocialStore.getState().keyFor('post:one')).toBe(key);
  expect(useSocialStore.getState().draft).toBe('작성 중');
  invalidateSocialSession('offline');
  expect(useSocialStore.getState().draft).toBe('작성 중');
  expect(useSocialStore.getState().keyFor('post:one')).toBe(key);
  invalidateSocialSession('hidden');
  invalidateSocialSession('recheck');
  expect(useSocialStore.getState().retryKeys['post:one']).toBe(key);
  invalidateSocialSession('cross-tab');
  expect(useSocialStore.getState().draft).toBe('');
  expect(useSocialStore.getState().retryKeys).toEqual({});
});
