import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  activateSocialSession,
  acquireSocialSession,
  attachSocialClient,
  captureSocialDispatch,
  configureSocialVerifier,
  deactivateSocialSession,
  invalidateSocialSession,
  isSocialSessionActive,
  recheckSocialSession,
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

describe('중첩 소셜 세션 소유권', () => {
  beforeEach(resetSocialSessionForTest);

  it('범위 창을 닫아도 기존 친구 화면의 승인과 콘텐츠 세대를 유지한다', async () => {
    const verify = vi.fn(async () => 'verified');
    configureSocialVerifier(verify);
    const feedScope = await activateSocialSession();
    const allowed = captureSocialDispatch();
    const acquisition = await acquireSocialSession();
    expect(acquisition?.scope).toBe(feedScope);
    acquisition?.release();
    acquisition?.release();
    expect(allowed()).toBe(true);
    expect(verify).toHaveBeenCalledTimes(1);
    deactivateSocialSession();
    expect(allowed()).toBe(false);
  });

  it('기존 피드 해제는 범위 창의 소유권을 끊지 않는다', async () => {
    configureSocialVerifier(async () => 'verified');
    const acquired = await acquireSocialSession();
    await activateSocialSession();
    const allowed = captureSocialDispatch();
    deactivateSocialSession();
    expect(allowed()).toBe(true);
    acquired?.release();
    expect(allowed()).toBe(false);
    expect(isSocialSessionActive()).toBe(false);
  });

  it('동시에 연 범위 창은 신원 왕복을 공유하고 마지막 해제까지 승인한다', async () => {
    const pending = deferred<string | null>();
    const verify = vi.fn(() => pending.promise);
    configureSocialVerifier(verify);
    const first = acquireSocialSession();
    const second = acquireSocialSession();
    pending.resolve('verified');
    const [a, b] = await Promise.all([first, second]);
    expect(a?.scope).toBe(b?.scope);
    expect(verify).toHaveBeenCalledTimes(1);
    a?.release();
    expect(captureSocialDispatch()()).toBe(true);
    b?.release();
    expect(captureSocialDispatch()()).toBe(false);
  });

  it('이전 창의 늦은 해제가 새 창의 소유권과 계정 승인을 끊지 않는다', async () => {
    configureSocialVerifier(async () => 'first');
    const first = await acquireSocialSession();
    invalidateSocialSession('account');
    configureSocialVerifier(async () => 'second');
    const second = await acquireSocialSession();
    first?.release();
    expect(second?.scope.token).toBe('second');
    expect(captureSocialDispatch()()).toBe(true);
    second?.release();
    expect(captureSocialDispatch()()).toBe(false);
  });
});

it('Provider 재확인은 범위 창만 있을 때 남는 피드 소유권을 만들지 않는다', async () => {
  resetSocialSessionForTest();
  configureSocialVerifier(async () => 'verified');
  const acquired = await acquireSocialSession();
  invalidateSocialSession('hidden');
  await recheckSocialSession();
  expect(captureSocialDispatch()()).toBe(true);
  acquired?.release();
  expect(isSocialSessionActive()).toBe(false);
  expect(await recheckSocialSession()).toBeNull();
});
