import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TOKEN_A = 'a'.repeat(64);
const TOKEN_B = 'b'.repeat(64);
const STORAGE_KEY = 'tasky.social.invite.v1';
const NOW = 1_780_000_000_000;

type EarlyWindow = Window & {
  __taskyIncomingInvite?: { token: string; expiresAt: number };
  __taskyInvalidInvite?: boolean;
};

function early(token: string): void {
  (window as EarlyWindow).__taskyIncomingInvite = { token, expiresAt: NOW + 60_000 };
}

async function bootstrap() {
  return import('@/features/social/lib/invite-bootstrap');
}

describe('초대 bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    window.sessionStorage.clear();
    delete (window as EarlyWindow).__taskyIncomingInvite;
    delete (window as EarlyWindow).__taskyInvalidInvite;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('URL 초대를 탭 메모리에서 한 번 받고 StrictMode 재호출에도 같은 안내를 유지한다', async () => {
    early(TOKEN_A);
    const { consumeInviteAfterReady } = await bootstrap();

    expect((window as EarlyWindow).__taskyIncomingInvite).toBeUndefined();
    expect(consumeInviteAfterReady()).toEqual({ kind: 'invite', token: TOKEN_A });
    expect(consumeInviteAfterReady()).toEqual({ kind: 'invite', token: TOKEN_A });
    expect(window.sessionStorage.length).toBe(0);
  });

  it('로그인 버튼의 명시 클릭 전에는 저장하지 않고 왕복 뒤 읽기 전에 키를 제거한다', async () => {
    early(TOKEN_A);
    const first = await bootstrap();
    expect(window.sessionStorage.length).toBe(0);
    expect(first.prepareInviteLogin()).toBe(true);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toContain(TOKEN_A);

    vi.resetModules(); // 실제 OAuth 왕복의 새 문서
    const second = await bootstrap();
    expect(second.consumeInviteAfterReady()).toEqual({ kind: 'invite', token: TOKEN_A });
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(second.consumeInviteAfterReady()).toEqual({ kind: 'invite', token: TOKEN_A });
  });

  it('새 URL 초대가 이전 저장 초대보다 우선하며 이전 키도 없앤다', async () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ token: TOKEN_A, expiresAt: NOW + 60_000 }),
    );
    early(TOKEN_B);
    const { consumeInviteAfterReady } = await bootstrap();

    expect(consumeInviteAfterReady()).toEqual({ kind: 'invite', token: TOKEN_B });
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('잘못된 URL·만료된 저장값은 원문을 돌려주지 않고 안내만 반환한다', async () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ token: TOKEN_A, expiresAt: NOW - 1 }),
    );
    (window as EarlyWindow).__taskyInvalidInvite = true;
    const { consumeInviteAfterReady } = await bootstrap();

    expect(consumeInviteAfterReady()).toEqual({ kind: 'invalid' });
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('새 URL 초대가 잘못됐으면 이전 탭 토큰을 OAuth 이전에 제거한다', async () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ token: TOKEN_A, expiresAt: NOW + 60_000 }),
    );
    (window as EarlyWindow).__taskyInvalidInvite = true;
    const first = await bootstrap();
    expect(first.prepareInviteLogin()).toBe(true);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();

    vi.resetModules();
    const second = await bootstrap();
    expect(second.consumeInviteAfterReady()).toBeNull();
  });

  it('잘못된 새 URL에서 이전 저장값을 지울 수 없으면 OAuth 이동을 막는다', async () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ token: TOKEN_A, expiresAt: NOW + 60_000 }),
    );
    (window as EarlyWindow).__taskyInvalidInvite = true;
    const { prepareInviteLogin } = await bootstrap();
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(prepareInviteLogin()).toBe(false);
  });

  it('잘못된 저장값의 문법·TTL을 검증하고 즉시 버린다', async () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ token: TOKEN_A.toUpperCase(), expiresAt: NOW + 60_000 }),
    );
    const { consumeInviteAfterReady } = await bootstrap();

    expect(consumeInviteAfterReady()).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('저장 차단은 로그인 이동 실패로 돌려주고 초대 없이 진행할 때 키를 버린다', async () => {
    early(TOKEN_A);
    const { prepareInviteLogin } = await bootstrap();
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    expect(prepareInviteLogin()).toBe(false);
    write.mockRestore();
    expect(prepareInviteLogin(true)).toBe(true);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('삭제 실패 시 같은 키를 무효값으로 덮어 새 문서에서 이전 초대를 복원하지 않는다', async () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ token: TOKEN_A, expiresAt: NOW + 60_000 }),
    );
    const first = await bootstrap();
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(first.prepareInviteLogin(true)).toBe(true);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe('null');

    vi.restoreAllMocks();
    vi.resetModules();
    expect((await bootstrap()).consumeInviteAfterReady()).toBeNull();
  });

  it('삭제와 덮어쓰기가 모두 실패하면 skip을 막고 회복 후 일반 로그인에서 잔존값을 지운다', async () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ token: TOKEN_A, expiresAt: NOW + 60_000 }),
    );
    const first = await bootstrap();
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(first.prepareInviteLogin(true)).toBe(false);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toContain(TOKEN_A);

    remove.mockRestore();
    write.mockRestore();
    expect(first.prepareInviteLogin()).toBe(true);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    vi.resetModules();
    expect((await bootstrap()).consumeInviteAfterReady()).toBeNull();
  });

  it('로그아웃/계정 교체의 삭제 실패 후 일반 로그인도 오래된 키 제거 전에는 이동하지 않는다', async () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ token: TOKEN_A, expiresAt: NOW + 60_000 }),
    );
    const first = await bootstrap();
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(first.clearPendingInvite()).toBe(false);
    expect(first.prepareInviteLogin()).toBe(false);
    remove.mockRestore();
    write.mockRestore();
    expect(first.prepareInviteLogin()).toBe(true);
    vi.resetModules();
    expect((await bootstrap()).consumeInviteAfterReady()).toBeNull();
  });

  it('새 URL B가 우선이어도 이전 저장 A를 지울 수 없으면 둘 다 표시하지 않는다', async () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ token: TOKEN_A, expiresAt: NOW + 60_000 }),
    );
    early(TOKEN_B);
    const first = await bootstrap();
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(first.consumeInviteAfterReady()).toBeNull();
    expect(first.prepareInviteLogin(true)).toBe(false);
  });
});
