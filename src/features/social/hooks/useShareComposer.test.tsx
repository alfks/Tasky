import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { SocialCategoryView } from '@/domain/social/social';

import { useShareComposer } from '@/features/social/hooks/useShareComposer';

const { repository, invalidations, readiness } = vi.hoisted(() => ({
  repository: { createPost: vi.fn() },
  invalidations: new Set<(reason: string) => void>(),
  readiness: new Set<() => void>(),
}));
vi.mock('@/repositories/container', () => ({ getSocialRepository: () => repository }));
vi.mock('@/features/social/session-lifecycle', () => ({
  captureSocialDispatch: () => () => true,
  invalidateSocialSession: vi.fn(),
  onSocialInvalidation: (listener: (reason: string) => void) => {
    invalidations.add(listener);
    return () => invalidations.delete(listener);
  },
  onSocialReady: (listener: () => void) => {
    readiness.add(listener);
    return () => readiness.delete(listener);
  },
}));
const category: SocialCategoryView = {
  id: 'a'.repeat(32),
  name: '독서',
  color: '#112233',
  visibility: 'friends',
  version: 1,
  updatedAt: 1,
};
beforeEach(() => {
  vi.clearAllMocks();
  invalidations.clear();
  readiness.clear();
});
it('409는 문장을 보존하고 최신 공개 범위를 읽은 뒤 새 명시 클릭을 기다린다', async () => {
  const resolveCategory = vi
    .fn()
    .mockResolvedValueOnce(category)
    .mockResolvedValue({ ...category, visibility: 'public', version: 2 });
  const shared = vi.fn();
  const { result } = renderHook(() => useShareComposer(shared));
  await act(async () => {
    result.current.select({
      key: 'opaque',
      text: '완료',
      happenedOn: '2026-09-30',
      categoryLabel: '독서',
      resolveCategory,
      onChangeAudience: vi.fn(),
    });
  });
  act(() => result.current.setText('직접 고친 문장'));
  repository.createPost.mockRejectedValueOnce({ code: 'conflict' });
  await act(async () => {
    await result.current.share();
  });
  expect(result.current.text).toBe('직접 고친 문장');
  expect(result.current.category?.version).toBe(2);
  expect(repository.createPost).toHaveBeenCalledTimes(1);
  expect(shared).not.toHaveBeenCalled();
});
it('응답 손실과 오프라인 뒤 범위가 private로 바뀌어도 원래 DTO와 키를 재확인한다', async () => {
  const resolveCategory = vi.fn().mockResolvedValue(category);
  const shared = vi.fn();
  const { result } = renderHook(() => useShareComposer(shared));
  await act(async () => {
    result.current.select({
      key: 'opaque',
      text: '완료',
      happenedOn: '2026-09-30',
      categoryLabel: '독서',
      resolveCategory,
      onChangeAudience: vi.fn(),
    });
  });
  repository.createPost.mockRejectedValueOnce({ code: 'temporary' });
  await act(async () => {
    await result.current.share();
  });
  const first = repository.createPost.mock.calls[0];
  act(() => {
    for (const listener of invalidations) listener('offline');
  });
  expect(result.current.uncertain).toBe(true);
  resolveCategory.mockResolvedValue({ ...category, visibility: 'private', version: 2 });
  await act(async () => {
    for (const listener of readiness) listener();
  });
  expect(result.current.category?.visibility).toBe('private');
  repository.createPost.mockResolvedValueOnce({
    data: { id: 'b'.repeat(32), category: { visibility: 'private' } },
    serverTime: 1,
  });
  await act(async () => {
    await result.current.share();
  });
  expect(repository.createPost.mock.calls[1]).toEqual(first);
  expect(shared).toHaveBeenCalledWith('b'.repeat(32), 'recovered');
});
