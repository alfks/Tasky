import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SocialCategoryView, SocialResponse } from '@/domain/social/social';

import type { SocialRepository } from '@/repositories/social-repository';

import { createCategoryAudienceController } from '@/features/category/store/category-audience';
import { createCategoryPublicationManager } from '@/features/category/store/category-publication-manager';
import { createPublicationRecovery } from '@/features/category/store/category-publication-recovery';
import {
  acquireSocialSession,
  attachSocialClient,
  captureSocialDispatch,
  configureSocialVerifier,
  invalidateSocialSession,
  onSocialInvalidation,
  resetSocialSessionForTest,
} from '@/features/social/session-lifecycle';
import { makeCategory } from '@/test/fixtures/category';

const answer = <T>(data: T): SocialResponse<T> => ({ data, serverTime: 1 });
const canonical: SocialCategoryView = {
  id: 'remote',
  name: '공유',
  color: '#EF9A9A',
  visibility: 'public',
  version: 1,
  updatedAt: 1,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (value: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const stops: (() => void)[] = [];
beforeEach(resetSocialSessionForTest);
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  resetSocialSessionForTest();
});
async function fixture() {
  configureSocialVerifier(async () => 'verified-scope');
  const acquisition = await acquireSocialSession();
  const recovery = createPublicationRecovery();
  stops.push(onSocialInvalidation(recovery.lock));
  const category = makeCategory({ name: canonical.name, color: canonical.color });
  const me = vi
    .fn<SocialRepository['me']>()
    .mockResolvedValue(
      answer({ profile: { id: 'actor', nickname: '나', version: 1 }, mode: 'enabled' }),
    );
  const saveCategory = vi
    .fn<SocialRepository['saveCategory']>()
    .mockResolvedValue(answer(canonical));
  const categories = vi
    .fn<SocialRepository['categories']>()
    .mockResolvedValue(answer({ items: [canonical], nextCursor: null }));
  const persist = vi.fn(async () => true);
  const onSessionFailure = vi.fn((code: 'unauthorized' | 'account-deleted') =>
    invalidateSocialSession(code === 'unauthorized' ? 'auth' : 'account'),
  );
  const deps = {
    recovery,
    persist,
    onSessionFailure,
    capture: captureSocialDispatch,
    online: () => true,
    repository: () => ({ me, saveCategory, categories }) as unknown as SocialRepository,
    key: () => 'immutable-key',
  };
  const controller = createCategoryAudienceController(category, deps);
  const stopController = onSocialInvalidation(controller.invalidate);
  stops.push(
    stopController,
    () => controller.dispose(),
    () => acquisition?.release(),
  );
  const close = () => {
    stopController();
    controller.dispose();
    acquisition?.release();
  };
  return {
    acquisition,
    recovery,
    category,
    deps,
    controller,
    me,
    saveCategory,
    categories,
    persist,
    onSessionFailure,
    close,
  };
}

describe('공개 명령과 현재 인증 세대의 경계', () => {
  it.each(['unauthorized', 'account-deleted'] as const)(
    '현재 저장 %s는 모든 등록 피드의 승인을 즉시 무효화한다',
    async (code) => {
      const f = await fixture();
      await f.controller.refresh();
      const invalidate = vi.fn();
      stops.push(attachSocialClient({ invalidate }));
      const allowed = captureSocialDispatch();
      f.saveCategory.mockRejectedValueOnce({ code });
      expect(await f.controller.change('public')).toBe(false);
      expect(f.onSessionFailure).toHaveBeenCalledWith(code);
      expect(invalidate).toHaveBeenCalledWith(code === 'unauthorized' ? 'auth' : 'account');
      expect(allowed()).toBe(false);
      expect(f.controller.getSnapshot().confirmed).toBeNull();
      if (code === 'account-deleted') {
        const next = await acquireSocialSession();
        stops.push(() => next?.release());
        await f.controller.refresh();
        expect(f.recovery.list()).toHaveLength(0);
      }
    },
  );

  it.each(['unauthorized', 'account-deleted'] as const)(
    '현재 owner 조회 %s도 동일한 전역 차단을 전달한다',
    async (code) => {
      const f = await fixture();
      f.me.mockRejectedValueOnce({ code });
      const allowed = captureSocialDispatch();
      await f.controller.refresh();
      expect(f.onSessionFailure).toHaveBeenCalledWith(code);
      expect(allowed()).toBe(false);
    },
  );

  it('다른 계정 검증 뒤 도착한 이전 저장 401은 새 actor와 registry를 건드리지 않는다', async () => {
    const f = await fixture();
    await f.controller.refresh();
    const pending = deferred<SocialResponse<SocialCategoryView>>();
    f.saveCategory.mockReturnValueOnce(pending.promise);
    const saving = f.controller.change('public');
    invalidateSocialSession('account');
    const next = await acquireSocialSession();
    stops.push(() => next?.release());
    f.me.mockResolvedValue(
      answer({ profile: { id: 'new-actor', nickname: '새 계정', version: 1 }, mode: 'enabled' }),
    );
    await f.controller.refresh();
    const allowed = captureSocialDispatch();
    pending.reject({ code: 'unauthorized' });
    expect(await saving).toBe(false);
    expect(f.onSessionFailure).not.toHaveBeenCalled();
    expect(allowed()).toBe(true);
    expect(f.recovery.actor()).toBe('new-actor');
    expect(f.persist).toHaveBeenCalledTimes(2);
  });

  it('닫힌 unknown은 account 신호에 폐기되며 auth 신호는 같은 actor 검증까지 격리만 한다', async () => {
    const f = await fixture();
    await f.controller.refresh();
    f.saveCategory.mockRejectedValueOnce(new Error('응답 소실'));
    await f.controller.change('public');
    f.close();
    expect(f.recovery.actor()).toBeNull();
    invalidateSocialSession('auth');
    const same = await acquireSocialSession();
    stops.push(() => same?.release());
    const reopened = createCategoryAudienceController(f.category, f.deps);
    stops.push(() => reopened.dispose());
    await reopened.refresh();
    expect(reopened.getSnapshot().uncertain).toBe(true);
    reopened.dispose();
    same?.release();
    invalidateSocialSession('account');
    const again = await acquireSocialSession();
    stops.push(() => again?.release());
    const final = createCategoryAudienceController(f.category, f.deps);
    stops.push(() => final.dispose());
    await final.refresh();
    expect(final.getSnapshot().uncertain).toBe(false);
    expect(f.saveCategory).toHaveBeenCalledTimes(1);
  });

  it('독립 manager의 늦은 401 read도 새 scope를 차단하지 않는다', async () => {
    const f = await fixture();
    const pending = deferred<Awaited<ReturnType<SocialRepository['me']>>>();
    f.me.mockReturnValueOnce(pending.promise);
    const manager = createCategoryPublicationManager({
      ...f.deps,
      getLocal: () => f.category,
      listLocal: () => [f.category],
    });
    stops.push(() => manager.dispose());
    const reading = manager.refresh();
    invalidateSocialSession('account');
    manager.invalidate('account');
    const next = await acquireSocialSession();
    stops.push(() => next?.release());
    await manager.refresh();
    const allowed = captureSocialDispatch();
    pending.reject({ code: 'unauthorized' });
    await expect(reading).resolves.toBe(false);
    expect(f.onSessionFailure).not.toHaveBeenCalled();
    expect(allowed()).toBe(true);
    expect(f.recovery.actor()).toBe('actor');
  });

  it('불명확 서버 장애는 401로 추정하지 않고 같은 승인과 key를 유지한다', async () => {
    const f = await fixture();
    await f.controller.refresh();
    const allowed = captureSocialDispatch();
    f.saveCategory.mockRejectedValueOnce(new Error('503'));
    expect(await f.controller.change('public')).toBe(false);
    expect(f.onSessionFailure).not.toHaveBeenCalled();
    expect(allowed()).toBe(true);
    expect(f.recovery.list()[0]?.key).toBe('immutable-key');
  });

  it.each([
    'rate-limited',
    'csrf',
    'request-expired',
    'validation',
    'social-disabled',
    'idempotency-conflict',
  ] as const)('unknown 뒤 %s는 원래 공개 효과를 없다고 판정하지 않는다', async (code) => {
    const f = await fixture();
    await f.controller.refresh();
    f.saveCategory.mockRejectedValueOnce(new Error('lost response'));
    expect(await f.controller.change('public')).toBe(false);
    f.saveCategory.mockRejectedValueOnce({ code });
    expect(await f.controller.retry()).toBe(false);
    expect(f.controller.getSnapshot().uncertain).toBe(true);
    expect(f.saveCategory.mock.calls[1]).toEqual(f.saveCategory.mock.calls[0]);
    f.close();
    const acquired = await acquireSocialSession();
    stops.push(() => acquired?.release());
    const reopened = createCategoryAudienceController(f.category, f.deps);
    stops.push(() => reopened.dispose());
    await reopened.refresh();
    expect(reopened.getSnapshot().uncertain).toBe(true);
    expect(f.saveCategory).toHaveBeenCalledTimes(2);
    expect(await reopened.change('friends')).toBe(false);
    expect(f.saveCategory).toHaveBeenCalledTimes(2);
    const blocked = code === 'request-expired' || code === 'idempotency-conflict';
    expect(await reopened.retry()).toBe(!blocked);
    expect(f.saveCategory).toHaveBeenCalledTimes(blocked ? 2 : 3);
    if (blocked) expect(f.recovery.list()).toHaveLength(1);
    else expect(f.saveCategory.mock.calls[2]).toEqual(f.saveCategory.mock.calls[0]);
  });

  it('최초 제출의 명백한 rate limit 거절은 미확정 효과로 남기지 않는다', async () => {
    const f = await fixture();
    await f.controller.refresh();
    f.saveCategory.mockRejectedValueOnce({ code: 'rate-limited' });
    expect(await f.controller.change('public')).toBe(false);
    expect(f.recovery.list()).toHaveLength(0);
    expect(f.controller.getSnapshot().uncertain).toBe(false);
  });
});
