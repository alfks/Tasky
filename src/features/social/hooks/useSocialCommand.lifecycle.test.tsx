import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { useSocialCommand } from '@/features/social/hooks/useSocialCommand';

const f = vi.hoisted(() => ({
  listeners: new Set<(reason: string) => void>(),
  scope: 0,
  available: true,
  repository: { me: vi.fn() },
}));
function emit(reason: string) {
  f.scope += 1;
  f.listeners.forEach((listener) => listener(reason));
}
vi.mock('@/repositories/container', () => ({ getSocialRepository: () => f.repository }));
vi.mock('@/features/social/session-lifecycle', () => ({
  captureSocialDispatch: () => {
    const scope = f.scope;
    return () => f.available && scope === f.scope;
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
const answer = <T,>(data: T) => ({ data, serverTime: 1 });
beforeEach(() => {
  emit('account');
  f.available = true;
  f.repository.me.mockReset().mockResolvedValue(answer({ profile: { id: 'A' } }));
});

it.each(['offline', 'hidden', 'revoked', 'cross-tab', 'provider', 'auth'])(
  '%s 중 첫 응답은 버리고 remount 뒤 현재 repository에 원래 DTO/key로만 재시도한다',
  async (reason) => {
    let resolve!: (value: ReturnType<typeof answer<boolean>>) => void;
    const keys: string[] = [];
    const original = vi.fn(async (repository, options) => {
      expect(repository).toBe(f.repository);
      keys.push(options.key);
      if (keys.length === 1)
        return new Promise<ReturnType<typeof answer<boolean>>>((done) => {
          resolve = done;
        });
      return answer(true);
    });
    const view = renderHook(() => useSocialCommand('held'));
    let first!: Promise<boolean | null>;
    act(() => {
      first = view.result.current.run('post', 'FIRST', original);
    });
    await waitFor(() => expect(original).toHaveBeenCalledOnce());
    act(() => emit(reason));
    expect(view.result.current.busy).toBe(false);
    expect(view.result.current.uncertain).toBe(true);
    view.unmount();
    await act(async () => {
      resolve(answer(true));
      expect(await first).toBeNull();
    });
    const next = renderHook(() => useSocialCommand('held'));
    const changed = vi.fn();
    await act(async () => {
      await next.result.current.run('post', 'B', changed);
    });
    expect(changed).not.toHaveBeenCalled();
    expect(next.result.current.uncertain).toBe(true);
    await act(async () => {
      expect(await next.result.current.retry()).toBe(true);
    });
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    expect(next.result.current.uncertain).toBe(false);
  },
);

it.each(['rate-limited', 'csrf', 'validation', 'social-disabled', 'unavailable', 'temporary'])(
  '첫 unknown 뒤 %s는 FIRST를 정리하지 않는다',
  async (code) => {
    const send = vi
      .fn()
      .mockRejectedValueOnce({ code: 'temporary' })
      .mockRejectedValueOnce({ code })
      .mockResolvedValue(answer(true));
    const view = renderHook(() => useSocialCommand('retry'));
    await act(async () => {
      await view.result.current.run('invite', 'DTO', send);
    });
    await act(async () => {
      await view.result.current.retry();
    });
    expect(view.result.current.uncertain).toBe(true);
    await act(async () => {
      await view.result.current.retry();
    });
    expect(send.mock.calls[2][1]).toEqual(send.mock.calls[0][1]);
  },
);

it.each(['request-expired', 'idempotency-conflict'])(
  '%s는 uncertain을 유지하지만 재전송과 새 key를 차단한다',
  async (code) => {
    const send = vi
      .fn()
      .mockRejectedValueOnce({ code: 'temporary' })
      .mockRejectedValueOnce({ code });
    const view = renderHook(() => useSocialCommand('blocked'));
    await act(async () => {
      await view.result.current.run('rename', 'FIRST', send);
      await view.result.current.retry();
    });
    expect(view.result.current.uncertain).toBe(true);
    expect(view.result.current.retryAllowed).toBe(false);
    await act(async () => {
      await view.result.current.retry();
    });
    expect(send).toHaveBeenCalledTimes(2);
  },
);

it('fresh actor가 달라지면 옛 요청을 호출하지 않으며 old reply도 새 actor를 settle하지 않는다', async () => {
  const send = vi.fn().mockRejectedValue({ code: 'temporary' });
  const view = renderHook(() => useSocialCommand('actor'));
  await act(async () => {
    await view.result.current.run('post', 'FIRST', send);
  });
  f.repository.me.mockResolvedValue(answer({ profile: { id: 'B' } }));
  await act(async () => {
    await view.result.current.retry();
  });
  expect(send).toHaveBeenCalledOnce();
  expect(view.result.current.pending).toBeNull();
});

it('동일 operation의 두 observer는 동시에 두 번 전송하지 않는다', async () => {
  let finish!: (value: ReturnType<typeof answer<boolean>>) => void;
  const send = vi.fn(
    () =>
      new Promise<ReturnType<typeof answer<boolean>>>((resolve) => {
        finish = resolve;
      }),
  );
  const first = renderHook(() => useSocialCommand('shared'));
  const second = renderHook(() => useSocialCommand('shared'));
  let pending!: Promise<boolean | null>;
  act(() => {
    pending = first.result.current.run('post', 'FIRST', send);
  });
  await waitFor(() => expect(send).toHaveBeenCalledOnce());
  await act(async () => {
    await second.result.current.run('post', 'FIRST', send);
  });
  expect(send).toHaveBeenCalledOnce();
  await act(async () => {
    finish(answer(true));
    await pending;
  });
});

it('64개의 unresolved를 버리지 않고 65번째는 me/network 전에 막으며 explicit abandon 뒤 허용한다', async () => {
  const send = vi.fn().mockRejectedValue({ code: 'temporary' });
  for (let index = 0; index < 64; index += 1) {
    const view = renderHook(() => useSocialCommand(`capacity-${index}`));
    await act(async () => {
      await view.result.current.run('post', 'FIRST', send);
    });
    view.unmount();
  }
  const extra = renderHook(() => useSocialCommand('extra'));
  await act(async () => {
    await extra.result.current.run('post', 'FIRST', send);
  });
  expect(f.repository.me).toHaveBeenCalledTimes(64);
  expect(extra.result.current.error).toBe('request-pending');
  expect(extra.result.current.uncertain).toBe(false);
  const old = renderHook(() => useSocialCommand('capacity-0'));
  await act(async () => {
    await old.result.current.retry();
  });
  expect(f.repository.me).toHaveBeenCalledTimes(65);
  act(() => old.result.current.abandon());
  await act(async () => {
    await extra.result.current.run('post', 'FIRST', send);
  });
  expect(f.repository.me).toHaveBeenCalledTimes(66);
});

it('receipt 없는 profile 생성의 응답손실은 fresh me canonical로 확인하고 다시 create/rename하지 않는다', async () => {
  f.repository.me.mockResolvedValueOnce(answer({ profile: null }));
  const send = vi.fn().mockRejectedValue({ code: 'temporary' });
  const view = renderHook(() => useSocialCommand('profile'));
  await act(async () => {
    await view.result.current.run('profile', 'FIRST NAME', send);
  });
  f.repository.me.mockResolvedValue(
    answer({ profile: { id: 'A', nickname: 'canonical', version: 1 } }),
  );
  await act(async () => {
    expect(await view.result.current.retry()).toMatchObject({ nickname: 'canonical' });
  });
  expect(send).toHaveBeenCalledOnce();
  expect(view.result.current.uncertain).toBe(false);
});

it('A의 X가 unknown일 때 새 namespace Y의 fresh B 증명도 전체 A 의도를 지우고 현재 mutation을 중단한다', async () => {
  const oldSend = vi.fn().mockRejectedValue({ code: 'temporary' });
  const old = renderHook(() => useSocialCommand('X'));
  await act(async () => {
    await old.result.current.run('post-X', 'FIRST-A', oldSend);
  });
  expect(old.result.current.uncertain).toBe(true);
  f.repository.me.mockResolvedValue(answer({ profile: { id: 'B' } }));
  const nextSend = vi.fn().mockResolvedValue(answer(true));
  const next = renderHook(() => useSocialCommand('Y'));
  await act(async () => {
    await next.result.current.run('post-Y', 'FIRST-B', nextSend);
  });
  expect(nextSend).not.toHaveBeenCalled();
  expect(old.result.current.pending).toBeNull();
  expect(next.result.current.pending).toBeNull();
  await act(async () => {
    await next.result.current.run('post-Y', 'FIRST-B', nextSend);
  });
  expect(nextSend).toHaveBeenCalledOnce();
  expect(oldSend).toHaveBeenCalledOnce();
});
