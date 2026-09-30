import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { commandIntentStore } from '@/features/social/hooks/social-command-intents';
import { useSocialCommand } from '@/features/social/hooks/useSocialCommand';

const f = vi.hoisted(() => ({
  listeners: new Set<(reason: string) => void>(),
  scope: 0,
  repository: { me: vi.fn(), write: vi.fn() },
}));
vi.mock('@/repositories/container', () => ({ getSocialRepository: () => f.repository }));
vi.mock('@/features/social/session-lifecycle', () => ({
  captureSocialDispatch: () => {
    const scope = f.scope;
    return () => scope === f.scope;
  },
  invalidateSocialSession: (reason: string) => {
    f.scope += 1;
    f.listeners.forEach((listener) => listener(reason));
  },
  onSocialReady: () => () => undefined,
  onSocialInvalidation: (listener: (reason: string) => void) => {
    f.listeners.add(listener);
    return () => f.listeners.delete(listener);
  },
}));
const answer = <T>(data: T) => ({ data, serverTime: 1 });
beforeEach(() => {
  vi.useFakeTimers();
  f.scope += 1;
  f.listeners.forEach((listener) => listener('account'));
  f.repository.me.mockReset().mockResolvedValue(answer({ profile: { id: 'A' } }));
  f.repository.write.mockReset().mockResolvedValue(answer(true));
});
afterEach(() => vi.useRealTimers());
it('FIRST me deadline 뒤 late proof는 POST를 시작하지 않으며 intent를 만들지 않는다', async () => {
  let proof!: () => void;
  f.repository.me.mockImplementation(
    () =>
      new Promise((resolve) => {
        proof = () => resolve(answer({ profile: { id: 'A' } }));
      }),
  );
  const view = renderHook(() => useSocialCommand('proof-timeout'));
  let operation!: Promise<unknown>;
  act(() => {
    operation = view.result.current.run('write', 'FIRST', (repo) =>
      (repo as never as typeof f.repository).write(),
    );
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
    await operation;
  });
  expect(view.result.current.busy).toBe(false);
  expect(view.result.current.hasIntent()).toBe(false);
  expect(view.result.current.error).toBe('temporary');
  await act(async () => proof());
  expect(f.repository.write).not.toHaveBeenCalled();
  expect(commandIntentStore.get('proof-timeout')).toBeUndefined();
});
it('me와 write는 TOTAL15s이며 late old reply는 retry의 mutex나 FIRST key를 정리하지 않는다', async () => {
  let proof!: () => void;
  let oldReply!: () => void;
  let newReply!: () => void;
  f.repository.me.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        proof = () => resolve(answer({ profile: { id: 'A' } }));
      }),
  );
  const send = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          oldReply = () => resolve(answer('old'));
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          newReply = () => resolve(answer('canonical'));
        }),
    );
  const view = renderHook(() => useSocialCommand('write-timeout'));
  let first!: Promise<unknown>;
  act(() => {
    first = view.result.current.run('write', 'FIRST', send);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
    proof();
  });
  const original = commandIntentStore.get('write-timeout')!;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5_000);
    await first;
  });
  expect(view.result.current.uncertain).toBe(true);
  expect(view.result.current.busy).toBe(false);
  let retry!: Promise<unknown>;
  await act(async () => {
    retry = view.result.current.retry();
  });
  expect(send.mock.calls[1][1]).toEqual(send.mock.calls[0][1]);
  await act(async () => oldReply());
  expect(commandIntentStore.get('write-timeout')).toBe(original);
  expect(original.inFlight).toBe(true);
  expect(view.result.current.busy).toBe(true);
  await act(async () => {
    newReply();
    expect(await retry).toBe('canonical');
  });
  expect(commandIntentStore.get('write-timeout')).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});
it('unmount 뒤 deadline은 원래 pair만 uncertain으로 남기며 current UI callback을 호출하지 않는다', async () => {
  const send = vi.fn(() => new Promise<never>(() => undefined));
  const failed = vi.fn();
  const view = renderHook(() => useSocialCommand('unmounted'));
  let first!: Promise<unknown>;
  await act(async () => {
    first = view.result.current.run('delete-post', 'FIRST', send, failed);
  });
  view.unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
    await first;
  });
  expect(commandIntentStore.get('unmounted')).toMatchObject({
    signature: 'FIRST',
    uncertain: true,
    inFlight: false,
  });
  expect(failed).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
