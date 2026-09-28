// 조립 지점의 **배선**을 고정한다 (ADR-0006 규칙 6 · TECH_PLAN §5 규칙 4).
//
// 이 파일이 지키는 것은 하나다: `Providers` 가 주입 직후 **`openIndexedDb()` 를 부른다**.
// 그 호출이 없으면 Dexie 의 지연 오픈 때문에 스키마 업그레이드 실패가 아무 조회에서나 raw Dexie
// 에러로 터지고, `RepositoryError('SCHEMA_UPGRADE_FAILED')` 는 **실전에서 발생할 수 없다**
// (`query.ts` 와 `migration.test.ts` 가 아무리 초록이어도 소용없다 — PR #34 리뷰 라운드 1 Major 12).
// 배선만 하고 테스트가 없으면 다음 리팩터에서 조용히 사라지므로 여기서 호출 자체를 단언한다.
//
// infra 모듈을 통째로 모킹한다: 이 테스트의 관심은 Dexie 가 아니라 **조립 지점이 무엇을 부르는가** 다.
// `providers.tsx` 는 모듈 스코프에서 주입을 시작하므로 매 테스트마다 모듈 레지스트리를 리셋한다.
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RepositoryErrorCode } from '@/repositories/repository-error';

/**
 * `vi.resetModules()` 뒤에 **다시 import 되는** 에러 모듈에서 이 테스트가 쓰는 부분만.
 * 값(클래스)을 정적으로 import 하면 리셋 이전 세대의 클래스라 `instanceof` 가 어긋난다
 * (아래 `mountProviders` 주석).
 */
type RepositoryErrors = {
  RepositoryError: new (code: RepositoryErrorCode, detail?: string) => Error;
};

const createIndexedDbRepositories = vi.fn(() => ({}) as never);
const openIndexedDb = vi.fn(() => Promise.resolve());
const createHttpSyncTransport = vi.fn(() => ({}) as never);
const createHttpSocialRepository = vi.fn(() => ({}) as never);
const socialIdentity = vi.fn(async () => ({
  sub: 'social-user',
  email: 'a@example.com',
  expiresAt: '2027-01-01T00:00:00.000Z',
}));

vi.mock('@/infra/indexeddb/repositories', () => ({ createIndexedDbRepositories, openIndexedDb }));
vi.mock('@/infra/sync/http-transport', () => ({ createHttpSyncTransport }));
vi.mock('@/infra/social/http-repository', () => ({ createHttpSocialRepository }));
vi.mock('@/repositories/container', () => ({
  setRepositories: vi.fn(),
  setSyncTransport: vi.fn(),
  setSocialRepository: vi.fn(),
  getRepositories: () => ({ sync: { getState: async () => ({ userSub: 'social-user' }) } }),
  getSyncTransport: () => ({ me: socialIdentity }),
}));

/**
 * 모듈 스코프 주입을 다시 실행시킨다 — import 는 리셋 **뒤에** 해야 한다.
 *
 * 실패 주입도 여기서 받는다: `vi.resetModules()` 뒤에는 `RepositoryError` **클래스 자체가 새 객체**라,
 * 리셋 전에 만든 인스턴스는 providers 가 보는 `isRepositoryError` 를 통과하지 못한다(실측 — 처음에
 * 그렇게 짰다가 스키마 문구 대신 일반 문구가 떴다). 그래서 같은 세대의 모듈에서 꺼내 만든다.
 */
async function mountProviders(fail?: (errors: RepositoryErrors) => unknown): Promise<void> {
  vi.resetModules();
  const { onSocialInvalidation } = await import('@/features/social');
  let bridgeReady = false;
  const stopReady = onSocialInvalidation((reason) => {
    if (reason === 'provider') bridgeReady = true;
  });
  try {
    if (fail !== undefined) {
      const errors = await import('@/repositories/repository-error');
      const error = fail(errors);
      openIndexedDb.mockImplementation(() => Promise.reject(error));
    }
    const { Providers } = await import('@/app/providers');
    render(<Providers>본문</Providers>);
    if (fail === undefined) await waitFor(() => expect(bridgeReady).toBe(true));
  } finally {
    stopReady();
  }
}

beforeEach(() => {
  createIndexedDbRepositories.mockClear();
  openIndexedDb.mockClear();
  openIndexedDb.mockImplementation(() => Promise.resolve());
  socialIdentity.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Providers 의 저장소 배선', () => {
  it('주입 직후 openIndexedDb() 를 부른다 — 이 호출이 스키마 실패를 잡는 유일한 지점이다', async () => {
    await mountProviders();

    await waitFor(() => {
      expect(
        openIndexedDb,
        'openIndexedDb 가 불리지 않았다 — 지연 오픈으로 되돌아갔다',
      ).toHaveBeenCalledTimes(1);
    });
    expect(createIndexedDbRepositories).toHaveBeenCalledTimes(1);
    expect(createHttpSocialRepository).not.toHaveBeenCalled();
    expect(await screen.findByText('본문')).toBeInTheDocument();
  });

  it('오프라인 차단 중 로그인 종료도 별도 auth 철회로 전달한다', async () => {
    await mountProviders();
    await screen.findByText('본문');
    const { useSyncStore } = await import('@/features/sync');
    const { onSocialInvalidation } = await import('@/features/social');
    const reasons: string[] = [];
    const stop = onSocialInvalidation((reason) => reasons.push(reason));
    try {
      act(() => useSyncStore.setState({ phase: 'ready', online: true, email: 'a@example.com' }));
      reasons.length = 0;
      act(() => useSyncStore.setState({ online: false }));
      act(() => useSyncStore.setState({ phase: 'login' }));
      expect(reasons).toEqual(['offline', 'auth']);
      reasons.length = 0;
      act(() => useSyncStore.setState({ phase: 'ready', online: true, email: 'b@example.com' }));
      act(() => useSyncStore.setState({ email: 'c@example.com' }));
      expect(reasons).toEqual([]);
    } finally {
      stop();
    }
  });

  it('email 표시 변경은 신원 철회가 아니며 계정 전환 안내 해제 뒤 재검증한다', async () => {
    await mountProviders();
    await screen.findByText('본문');
    const { useSyncStore } = await import('@/features/sync');
    const { activateSocialSession, deactivateSocialSession, onSocialInvalidation } =
      await import('@/features/social');
    const reasons: string[] = [];
    const stop = onSocialInvalidation((reason) => reasons.push(reason));
    try {
      act(() => useSyncStore.setState({ phase: 'ready', online: true, email: 'a@example.com' }));
      await activateSocialSession();
      expect(socialIdentity).toHaveBeenCalledTimes(1);
      reasons.length = 0;
      act(() => useSyncStore.setState({ email: 'display@example.com' }));
      expect(reasons).toEqual([]);
      expect(socialIdentity).toHaveBeenCalledTimes(1);
      act(() => useSyncStore.setState({ accountSwitchedNotice: true }));
      expect(reasons).toContain('account');
      act(() => useSyncStore.setState({ accountSwitchedNotice: false, email: 'new@example.com' }));
      await waitFor(() => expect(socialIdentity).toHaveBeenCalledTimes(2));
    } finally {
      stop();
      deactivateSocialSession();
    }
  });

  it('스키마 업그레이드 실패는 본문 대신 "새로 저장할 수 없다" 안내를 띄운다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await mountProviders(
      ({ RepositoryError }) => new RepositoryError('SCHEMA_UPGRADE_FAILED', 'open 실패 name=Error'),
    );

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('새로 저장할 수 없어요');
    expect(alert.textContent).toContain('백업 내보내기');
    expect(screen.queryByText('본문')).not.toBeInTheDocument();
  });

  it('그 밖의 실패는 다른 문구다 — 두 경로가 같은 안내로 뭉개지지 않는다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await mountProviders(() => {
      const blocked = new Error('IndexedDB API missing');
      blocked.name = 'MissingAPIError';
      return blocked;
    });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('사생활 보호 모드');
    expect(alert.textContent, '스키마 실패 문구가 잘못 떴다').not.toContain('백업 내보내기');
  });
});
