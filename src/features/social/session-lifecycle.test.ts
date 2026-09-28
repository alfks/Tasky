import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  activateSocialSession,
  attachSocialClient,
  captureSocialDispatch,
  configureSocialVerifier,
  deactivateSocialSession,
  invalidateSocialSession,
  isSocialSessionActive,
  resetSocialSessionForTest,
} from '@/features/social/session-lifecycle';

function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('미설정');
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('소셜 세션 경계', () => {
  beforeEach(resetSocialSessionForTest);

  it('최초 blocked이며 닫힌 동안 신원 확인을 호출하지 않는다', async () => {
    const verify = vi.fn(async () => 'opaque');
    configureSocialVerifier(verify);
    expect(captureSocialDispatch()()).toBe(false);
    expect(verify).not.toHaveBeenCalled();
    expect(isSocialSessionActive()).toBe(false);
  });

  it('명시 활성화만 신원을 확인하고 닫으면 이전 세대 호출을 거절한다', async () => {
    const verify = vi.fn(async () => 'opaque');
    configureSocialVerifier(verify);
    const scope = await activateSocialSession();
    expect(scope).toMatchObject({ token: 'opaque' });
    const canDispatch = captureSocialDispatch();
    expect(canDispatch()).toBe(true);
    deactivateSocialSession();
    expect(canDispatch()).toBe(false);
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('늦은 신원 확인 성공을 세션 변경 뒤 버린다', async () => {
    const pending = deferred<string | null>();
    configureSocialVerifier(() => pending.promise);
    const activation = activateSocialSession();
    invalidateSocialSession('account');
    pending.resolve('old-account');
    await expect(activation).resolves.toBeNull();
    expect(captureSocialDispatch()()).toBe(false);
  });

  it('권한 철회를 로드된 클라이언트에 동기로 전달하고 다음 검증 전까지 차단한다', async () => {
    configureSocialVerifier(async () => 'opaque');
    await activateSocialSession();
    const invalidate = vi.fn();
    const detach = attachSocialClient({ invalidate });
    invalidateSocialSession('revoked');
    expect(invalidate).toHaveBeenCalledWith('revoked');
    expect(captureSocialDispatch()()).toBe(false);
    detach();
    invalidateSocialSession('offline');
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('Provider 해제는 재등록된 verifier를 지우지 않는다', async () => {
    const oldCleanup = configureSocialVerifier(async () => 'old');
    configureSocialVerifier(async () => 'new');
    oldCleanup();
    await expect(activateSocialSession()).resolves.toMatchObject({ token: 'new' });
  });
});
