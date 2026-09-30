import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SocialCategoryView, SocialResponse } from '@/domain/social/social';

import type { SocialRepository } from '@/repositories/social-repository';

import { createCategoryAudienceController } from '@/features/category/store/category-audience';
import {
  createPublicationRecovery,
  observePublication,
} from '@/features/category/store/category-publication-recovery';
import { makeCategory } from '@/test/fixtures/category';

const canonical: SocialCategoryView = {
  id: 'remote',
  name: '서버 이름',
  color: '#EF9A9A',
  visibility: 'public',
  version: 1,
  updatedAt: 1,
};
const answer = <T>(data: T): SocialResponse<T> => ({ data, serverTime: 1 });
const original = makeCategory({ name: canonical.name, color: canonical.color });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture() {
  const recovery = createPublicationRecovery();
  let actor = 'actor-a';
  let mode: 'enabled' | 'off' = 'enabled';
  let online = true;
  const me = vi.fn(async () =>
    answer({ profile: { id: actor, nickname: actor, version: 1 }, mode }),
  );
  const saveCategory = vi
    .fn<SocialRepository['saveCategory']>()
    .mockResolvedValue(answer(canonical));
  const revokeCategory = vi
    .fn<SocialRepository['revokeCategory']>()
    .mockResolvedValue(answer({ ...canonical, visibility: 'private', revoked: true }));
  const categories = vi
    .fn<SocialRepository['categories']>()
    .mockResolvedValue(answer({ items: [canonical], nextCursor: null }));
  const persist = vi.fn(async () => true);
  let number = 0;
  const deps = {
    recovery,
    capture: () => () => online,
    online: () => online,
    key: () => `key-${++number}`,
    persist,
    repository: () =>
      ({ me, saveCategory, revokeCategory, categories }) as unknown as SocialRepository,
  };
  const create = (category = original) => createCategoryAudienceController(category, deps);
  return {
    recovery,
    deps,
    create,
    me,
    saveCategory,
    revokeCategory,
    categories,
    persist,
    actor: (next: string) => {
      actor = next;
    },
    mode: () => {
      mode = 'off';
    },
    offline: () => {
      online = false;
    },
  };
}
afterEach(() => vi.useRealTimers());

describe('미확정 카테고리 명령의 탭 수명', () => {
  it('lost create 닫기/재열기는 최초 DTO와 key를 그대로 확인하며 자동 제출하지 않는다', async () => {
    const f = fixture();
    const first = f.create();
    await first.refresh();
    f.saveCategory.mockRejectedValueOnce(new Error('응답 소실'));
    expect(await first.change('public')).toBe(false);
    first.dispose();
    const reopened = f.create();
    await reopened.refresh();
    expect(reopened.getSnapshot().uncertain).toBe(true);
    expect(f.saveCategory).toHaveBeenCalledTimes(1);
    expect(await reopened.retry()).toBe(true);
    expect(f.saveCategory.mock.calls[1]).toEqual(f.saveCategory.mock.calls[0]);
    expect(f.recovery.list()).toHaveLength(0);
  });

  it('lost revoke도 닫기/재열기 뒤 원래 version과 key로만 확인한다', async () => {
    const f = fixture();
    const linked = makeCategory({
      ...original,
      socialCategoryId: canonical.id,
      socialCategoryVersion: 1,
    });
    const first = f.create(linked);
    await first.refresh();
    f.revokeCategory.mockRejectedValueOnce(new Error('응답 소실'));
    expect(await first.revoke()).toBe(false);
    first.dispose();
    const reopened = f.create(linked);
    await reopened.refresh();
    expect(await reopened.retry()).toBe(true);
    expect(f.revokeCategory.mock.calls[1]).toEqual(f.revokeCategory.mock.calls[0]);
  });

  it('14,999ms까지 busy, 15,000ms에서 uncertain으로 탈출하며 늦은 성공을 저장하지 않는다', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const controller = f.create();
    await controller.refresh();
    f.persist.mockClear();
    const server = deferred<SocialResponse<SocialCategoryView>>();
    f.saveCategory.mockReturnValueOnce(server.promise);
    const result = controller.change('public');
    await vi.advanceTimersByTimeAsync(14_999);
    expect(controller.getSnapshot().phase).toBe('saving');
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe(false);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'error', uncertain: true });
    server.resolve(answer(canonical));
    await Promise.resolve();
    expect(f.persist).not.toHaveBeenCalled();
    expect(f.recovery.list()).toHaveLength(1);
    expect(await controller.retry()).toBe(true);
    expect(f.saveCategory.mock.calls[1]).toEqual(f.saveCategory.mock.calls[0]);
  });

  it.each(['revoked', 'provider', 'closed', 'cross-tab', 'offline', 'hidden', 'recheck'])(
    '%s는 불명확 명령을 보관하고 같은 actor 검증 뒤 복구한다',
    async (reason) => {
      const f = fixture();
      const first = f.create();
      await first.refresh();
      f.saveCategory.mockRejectedValueOnce(new Error('응답 소실'));
      await first.change('public');
      first.invalidate(reason);
      expect(f.recovery.list()).toHaveLength(0);
      await first.refresh();
      expect(first.getSnapshot().uncertain).toBe(true);
      expect(f.saveCategory).toHaveBeenCalledTimes(1);
      expect(await first.retry()).toBe(true);
    },
  );

  it('401은 격리만 하며 같은 계정의 새 검증 뒤 원래 key를 복구한다', async () => {
    const f = fixture();
    const first = f.create();
    await first.refresh();
    f.saveCategory.mockRejectedValueOnce({ code: 'unauthorized' });
    await first.change('public');
    expect(f.recovery.list()).toHaveLength(0);
    first.dispose();
    const next = f.create();
    await next.refresh();
    expect(next.getSnapshot().uncertain).toBe(true);
    expect(await next.retry()).toBe(true);
    expect(f.saveCategory.mock.calls[1]).toEqual(f.saveCategory.mock.calls[0]);
  });

  it.each(['account', 'account-deleted'])('%s는 원래 key를 폐기한다', async (reason) => {
    const f = fixture();
    const first = f.create();
    await first.refresh();
    f.saveCategory.mockRejectedValueOnce(new Error('응답 소실'));
    await first.change('public');
    first.invalidate(reason);
    await first.refresh();
    expect(first.getSnapshot().uncertain).toBe(false);
    expect(f.recovery.list()).toHaveLength(0);
  });

  it('fresh actor가 다르면 이전 계정의 보관 명령을 폐기한다', async () => {
    const f = fixture();
    const first = f.create();
    await first.refresh();
    f.saveCategory.mockRejectedValueOnce(new Error('응답 소실'));
    await first.change('public');
    first.dispose();
    f.actor('actor-b');
    const next = f.create();
    await next.refresh();
    expect(next.getSnapshot().uncertain).toBe(false);
    expect(f.recovery.list()).toHaveLength(0);
  });

  it('최초 local CAS는 재열린 자료로 바꾸지 않으며 서버 확인 후 CAS 거절은 로컬 성공이 아니다', async () => {
    const f = fixture();
    const first = f.create();
    await first.refresh();
    f.saveCategory.mockRejectedValueOnce(new Error('응답 소실'));
    await first.change('public');
    first.dispose();
    const restored = { ...original, name: '복원한 새 이름' };
    const next = f.create(restored);
    await next.refresh();
    f.persist.mockResolvedValueOnce(false);
    expect(await next.retry()).toBe(false);
    expect(f.persist).toHaveBeenLastCalledWith(canonical, original, expect.any(Function));
    expect(f.saveCategory.mock.calls[1]).toEqual(f.saveCategory.mock.calls[0]);
    expect(f.recovery.list()).toHaveLength(0);
    expect(next.getSnapshot().error).toBe('conflict');
  });

  it('off는 자동 새 조회와 unknown save 재전송을 막되 owner 철회는 허용한다', async () => {
    const f = fixture();
    const first = f.create();
    await first.refresh();
    f.saveCategory.mockRejectedValueOnce(new Error('응답 소실'));
    await first.change('public');
    first.dispose();
    f.mode();
    const next = f.create();
    await next.refresh();
    expect(await next.retry()).toBe(false);
    const reads = f.me.mock.calls.length;
    await next.refresh(true);
    expect(f.me).toHaveBeenCalledTimes(reads);
    expect(f.saveCategory).toHaveBeenCalledTimes(1);
    const other = f.create(
      makeCategory({ seq: 2, socialCategoryId: canonical.id, socialCategoryVersion: 1 }),
    );
    await other.refresh();
    expect(await other.revoke()).toBe(true);
    expect(f.recovery.list()).toHaveLength(1);
  });

  it('32개 상한은 새 명령만 막고 이전 key와 원래 CAS를 축출하지 않는다', () => {
    const registry = createPublicationRecovery();
    registry.verifyActor('actor', registry.proof(), () => true);
    for (let i = 0; i < 32; i += 1)
      registry.reserve(
        `local:${i}`,
        { kind: 'save', original, input: { expectedVersion: 0, ...canonical } },
        () => `key-${i}`,
      );
    const first = registry.get('local:0');
    expect(() =>
      registry.reserve(
        'local:33',
        { kind: 'save', original, input: { expectedVersion: 0, ...canonical } },
        () => 'key-new',
      ),
    ).toThrow('limit-reached');
    expect(
      registry.reserve(
        'local:0',
        {
          kind: 'save',
          original: { ...original, name: '다름' },
          input: { expectedVersion: 0, ...canonical },
        },
        () => 'wrong',
      ),
    ).toBe(first);
    expect(first?.intent.original).toEqual(original);
    expect(registry.list()).toHaveLength(32);
  });

  it('stale me proof는 registry를 잠금 해제하지 못한다', () => {
    const registry = createPublicationRecovery();
    const proof = registry.proof();
    registry.lock('auth');
    expect(registry.verifyActor('actor', proof, () => true)).toBe(false);
    expect(registry.actor()).toBeNull();
  });

  it('dispose는 관측 타이머를 정리하고 원래 명령을 uncertain으로 남긴다', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const controller = f.create();
    await controller.refresh();
    f.saveCategory.mockReturnValueOnce(new Promise(() => {}));
    const result = controller.change('public');
    expect(vi.getTimerCount()).toBe(1);
    controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
    await expect(result).resolves.toBe(false);
    expect(f.recovery.list()[0]?.status).toBe('uncertain');
  });

  it('독립 관측 취소가 물리 서버 요청을 성공/실패로 판정하지 않는다', async () => {
    const server = deferred<number>();
    const observation = observePublication(() => server.promise);
    observation.cancel();
    await expect(observation.promise).resolves.toEqual({ type: 'uncertain' });
    server.resolve(1);
    await expect(observation.promise).resolves.toEqual({ type: 'uncertain' });
  });
});
