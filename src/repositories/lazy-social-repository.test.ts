import { describe, expect, it, vi } from 'vitest';

import { createLazySocialRepository } from '@/repositories/lazy-social-repository';
import type { SocialRepository } from '@/repositories/social-repository';

const ME = { data: { profile: null, mode: 'off' as const }, serverTime: 1 };

function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('미설정');
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('지연 소셜 저장소', () => {
  it('닫힌 화면에서는 무거운 구현을 가져오지 않는다', async () => {
    const load = vi.fn(async () => ({ me: async () => ME }) as SocialRepository);
    const repo = createLazySocialRepository(load, () => () => false);
    await expect(repo.me()).rejects.toMatchObject({ name: 'AbortError' });
    expect(load).not.toHaveBeenCalled();
  });

  it('동시 첫 호출은 한 번만 로드하고 같은 구현을 쓴다', async () => {
    const arrival = deferred<SocialRepository>();
    const load = vi.fn(() => arrival.promise);
    const me = vi.fn(async () => ME);
    const repo = createLazySocialRepository(load, () => () => true);
    const first = repo.me();
    const second = repo.me();
    expect(load).toHaveBeenCalledTimes(1);
    arrival.resolve({ me } as unknown as SocialRepository);
    await expect(Promise.all([first, second])).resolves.toEqual([ME, ME]);
    expect(me).toHaveBeenCalledTimes(2);
  });

  it('모듈 로딩 중 계정이 바뀌면 명령을 새 계정에 보내지 않는다', async () => {
    const arrival = deferred<SocialRepository>();
    const createPost = vi.fn(async () => ({ data: { id: 'x' }, serverTime: 1 }));
    let epoch = 1;
    const repo = createLazySocialRepository(
      () => arrival.promise,
      () => {
        const captured = epoch;
        return () => captured === epoch;
      },
    );
    const command = repo.createPost(
      { text: '완료', happenedOn: '2026-09-28' },
      { key: 'v1.1800000000000.00000000000000000000000000000001' },
    );
    epoch += 1;
    arrival.resolve({ createPost } as unknown as SocialRepository);
    await expect(command).rejects.toMatchObject({ name: 'AbortError' });
    expect(createPost).not.toHaveBeenCalled();
  });

  it('로드 실패 후 다음 명시 호출에는 다시 로드하되 명령을 자동 재시도하지 않는다', async () => {
    const me = vi.fn(async () => ME);
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('청크 실패'))
      .mockResolvedValueOnce({ me } as unknown as SocialRepository);
    const repo = createLazySocialRepository(load, () => () => true);
    await expect(repo.me()).rejects.toThrow('청크 실패');
    expect(load).toHaveBeenCalledTimes(1);
    await expect(repo.me()).resolves.toEqual(ME);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
