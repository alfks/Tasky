import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { captureSocialReturn } from '@/features/shell/components/SocialWorkspace';
import { makeCategory } from '@/test/fixtures/category';

const category = makeCategory({ socialCategoryId: 'remote-category', socialCategoryVersion: 1 });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function setup() {
  vi.resetModules();
  const loading = deferred<void>();
  const capture = vi.fn(captureSocialReturn);
  vi.doMock('@/features/shell/components/SocialWorkspace', async () => {
    await loading.promise;
    return { captureSocialReturn: capture };
  });
  vi.doMock('@/features/social', async () => {
    const lifecycle = await import('@/features/social/session-lifecycle');
    return { onSocialInvalidation: lifecycle.onSocialInvalidation };
  });
  const { useShellSocial } = await import('@/features/shell/hooks/useShellSocial');
  const { invalidateSocialSession } = await import('@/features/social/session-lifecycle');
  const closeReports = vi.fn();
  const loadError = vi.fn();
  const hook = renderHook(() => useShellSocial(closeReports, loadError));
  const release = async () => {
    await act(async () => {
      loading.resolve();
      await loading.promise;
    });
  };
  return { ...hook, release, capture, closeReports, loadError, invalidateSocialSession };
}
beforeEach(() => {
  sessionStorage.clear();
  history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.doUnmock('@/features/shell/components/SocialWorkspace');
  vi.doUnmock('@/features/social');
});

describe('셸 소셜의 동기 확인 큐와 지연 화면 경계', () => {
  it('계정 변경은 확인을 동기로 취소하고 늦은 화면 열기를 버린다', async () => {
    const f = await setup();
    let pending!: Promise<boolean>;
    act(() => {
      pending = f.result.current.bridge.beforeRemove(category);
      f.result.current.openSocial();
    });
    expect(f.result.current.request?.kind).toBe('remove');
    act(() => f.invalidateSocialSession('account'));
    await expect(pending).resolves.toBe(false);
    await f.release();
    expect(f.capture).not.toHaveBeenCalled();
    expect(f.closeReports).not.toHaveBeenCalled();
    expect(f.result.current.request).toBeNull();
  });

  it('언마운트도 청크를 기다리지 않고 취소하며 늦은 DOM 접근을 버린다', async () => {
    const f = await setup();
    let pending!: Promise<boolean>;
    act(() => {
      pending = f.result.current.bridge.beforeRemove(category);
      f.result.current.openSocial();
    });
    f.unmount();
    await expect(pending).resolves.toBe(false);
    await f.release();
    expect(f.capture).not.toHaveBeenCalled();
    expect(f.closeReports).not.toHaveBeenCalled();
  });

  it('두 번째 요청은 첫 요청을 즉시 취소하고 최신 원문만 표시한다', async () => {
    const f = await setup();
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = f.result.current.bridge.beforeRemove(category);
    });
    act(() => {
      second = f.result.current.bridge.beforeMetadataChange(category, {
        name: '새 이름',
        color: category.color,
      });
    });
    await expect(first).resolves.toBe(false);
    expect(f.result.current.request?.metadata?.name).toBe('새 이름');
    act(() => f.result.current.request?.resolve(true));
    await expect(second).resolves.toBe(true);
    expect(f.capture).not.toHaveBeenCalled();
    await f.release();
  });

  it('같은 호출 스택에서 확인 후 자체 권한 무효화가 성공을 취소하지 않는다', async () => {
    const f = await setup();
    let pending!: Promise<boolean>;
    act(() => {
      pending = f.result.current.bridge.beforeRemove(category);
    });
    act(() => {
      f.result.current.request?.resolve(true);
      f.invalidateSocialSession('revoked');
    });
    await expect(pending).resolves.toBe(true);
    expect(f.result.current.request).toBeNull();
    await f.release();
  });

  it('로그아웃이 먼저면 과거 확인은 새 계정 요청을 승인하지 않는다', async () => {
    const f = await setup();
    let old!: Promise<boolean>;
    act(() => {
      old = f.result.current.bridge.beforeRemove(category);
    });
    const previous = f.result.current.request;
    act(() => f.invalidateSocialSession('auth'));
    await expect(old).resolves.toBe(false);
    let next!: Promise<boolean>;
    act(() => {
      next = f.result.current.bridge.beforeRemove(category);
    });
    const latest = f.result.current.request;
    expect(latest?.key).not.toBe(previous?.key);
    act(() => previous?.resolve(true));
    expect(f.result.current.request).toBe(latest);
    act(() => latest?.resolve(true));
    await expect(next).resolves.toBe(true);
    await f.release();
  });

  it('같은 카테고리의 이전 창이 새 확인을 닫거나 승인하지 않는다', async () => {
    const f = await setup();
    let first!: Promise<boolean>;
    act(() => {
      first = f.result.current.bridge.beforeRemove(category);
    });
    const previous = f.result.current.request;
    let next!: Promise<boolean>;
    act(() => {
      next = f.result.current.bridge.beforeRemove(category);
    });
    await expect(first).resolves.toBe(false);
    const latest = f.result.current.request;
    expect(latest?.key).not.toBe(previous?.key);
    act(() => previous?.resolve(true));
    expect(f.result.current.request).toBe(latest);
    act(() => latest?.resolve());
    await expect(next).resolves.toBe(false);
    await f.release();
  });

  it('화면 로드 실패 뒤 새 클릭으로 다시 시도하고 중복 클릭은 한 번만 열린다', async () => {
    const f = await setup();
    f.capture.mockImplementationOnce(() => {
      throw new Error('초기화 실패');
    });
    act(() => f.result.current.openSocial());
    await f.release();
    expect(f.loadError).toHaveBeenCalledTimes(1);
    await act(async () => {
      f.result.current.openSocial();
      f.result.current.openSocial();
    });
    expect(f.result.current.socialOpen).toBe(true);
    expect(f.closeReports).toHaveBeenCalledTimes(1);
  });

  it('보관한 초대는 먼저 열리며 청크 없이도 뒤로 가기가 닫힌다', async () => {
    sessionStorage.setItem('tasky.social.invite.v1', JSON.stringify({ savedAt: Date.now() }));
    const f = await setup();
    expect(f.result.current.socialOpen).toBe(true);
    act(() => f.result.current.returnFromSocial());
    expect(f.result.current.socialOpen).toBe(false);
    expect(f.capture).not.toHaveBeenCalled();
    await f.release();
  });

  it('공개 초기 진입과 확인 요청이 서로의 화면 상태를 덮어쓰지 않는다', async () => {
    history.replaceState(null, '', '/?social=public');
    const f = await setup();
    expect(f.result.current.initialPublic).toBe(true);
    let pending!: Promise<boolean>;
    act(() => {
      pending = f.result.current.bridge.beforeRemove(category);
    });
    expect(f.result.current.socialOpen).toBe(true);
    act(() => f.result.current.request?.resolve());
    await expect(pending).resolves.toBe(false);
    expect(f.result.current.socialOpen).toBe(true);
    await f.release();
  });

  it('만료 초대와 저장 차단은 개인 화면에서 시작한다', async () => {
    sessionStorage.setItem(
      'tasky.social.invite.v1',
      JSON.stringify({ savedAt: Date.now() - 86400001 }),
    );
    const f = await setup();
    expect(f.result.current.socialOpen).toBe(false);
    f.unmount();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('차단');
    });
    const second = await setup();
    expect(second.result.current.socialOpen).toBe(false);
    await f.release();
    await second.release();
  });

  it('과거 복귀 RAF는 계정 변경 뒤 개인 화면을 포커스하지 않는다', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const main = document.createElement('main');
    main.id = 'shell-main';
    main.tabIndex = -1;
    document.body.append(main);
    const focus = vi.spyOn(main, 'focus');
    const f = await setup();
    act(() => {
      f.result.current.returnFromSocial();
      f.invalidateSocialSession('account');
    });
    frames[0]?.(0);
    expect(focus).not.toHaveBeenCalled();
    main.remove();
    await f.release();
  });
});

it('DOM 재배치 뒤 같은 스크롤 영역과 살아 있는 진입 버튼으로 복귀한다', () => {
  const opener = document.createElement('button');
  const region = document.createElement('section');
  region.dataset.shellScrollRegion = 'day';
  region.scrollTop = 87;
  document.body.append(opener, region);
  const restore = captureSocialReturn(opener);
  region.remove();
  const replacement = region.cloneNode() as HTMLElement;
  document.body.prepend(replacement);
  restore();
  expect(replacement.scrollTop).toBe(87);
  expect(document.activeElement).toBe(opener);
  opener.remove();
  replacement.remove();
});
