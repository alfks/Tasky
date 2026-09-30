import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isTransportError } from '@/repositories/sync-transport';

import { createHttpSyncTransport } from '@/infra/sync/http-transport';

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createHttpSyncTransport', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('me(): 200 이면 세션 정보를 돌려준다', async () => {
    const session = { sub: 's', email: 'a@example.com', expiresAt: '2099-01-01T00:00:00.000Z' };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, session));

    const result = await createHttpSyncTransport().me();

    expect(result).toEqual(session);
    expect(fetch).toHaveBeenCalledWith(
      '/api/me',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('me(): 401 이면 null 을 돌려준다(정상 분기)', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

    expect(await createHttpSyncTransport().me()).toBeNull();
  });

  it('me(): 410 이면 TransportError(account-deleted) — 401 과 구분한다(ADR-0019)', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(410, { error: 'account-deleted' }));

    await expect(createHttpSyncTransport().me()).rejects.toSatisfy(
      (error: unknown) => isTransportError(error) && error.kind === 'account-deleted',
    );
  });

  it('me(): fetch 가 던지면 TransportError(offline)', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('network'));

    await expect(createHttpSyncTransport().me()).rejects.toSatisfy(
      (error: unknown) => isTransportError(error) && error.kind === 'offline',
    );
  });

  it('sync(): 401 이면 TransportError(unauthorized)', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

    await expect(
      createHttpSyncTransport().sync({ protocol: 1, deviceId: 'd', cursor: 0, changes: [] }),
    ).rejects.toSatisfy(
      (error: unknown) => isTransportError(error) && error.kind === 'unauthorized',
    );
  });

  it('sync(): 410 이면 TransportError(account-deleted)', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(410, { error: 'account-deleted' }));

    await expect(
      createHttpSyncTransport().sync({ protocol: 1, deviceId: 'd', cursor: 0, changes: [] }),
    ).rejects.toSatisfy(
      (error: unknown) => isTransportError(error) && error.kind === 'account-deleted',
    );
  });

  it('sync(): 5xx 면 TransportError(server)', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(500));

    await expect(
      createHttpSyncTransport().sync({ protocol: 1, deviceId: 'd', cursor: 0, changes: [] }),
    ).rejects.toSatisfy((error: unknown) => isTransportError(error) && error.kind === 'server');
  });

  it('sync(): 200 이면 본문을 그대로 돌려주고 CSRF 헤더를 싣는다', async () => {
    const body = { cursor: 1, applied: [], rejected: [], pulled: [], more: false, gcFloor: 0 };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

    const result = await createHttpSyncTransport().sync({
      protocol: 1,
      deviceId: 'd',
      cursor: 0,
      changes: [],
    });

    expect(result).toEqual(body);
    expect(fetch).toHaveBeenCalledWith(
      '/api/sync',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Tasky': '1', 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          protocol: 1,
          deviceId: 'd',
          cursor: 0,
          changes: [],
          settingsProfileVersion: 1,
        }),
      }),
    );
  });

  it('logout(): 200 이면 성공, 5xx 면 던진다', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200));
    await expect(createHttpSyncTransport().logout()).resolves.toBeUndefined();

    vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
    await expect(createHttpSyncTransport().logout()).rejects.toSatisfy(
      (error: unknown) => isTransportError(error) && error.kind === 'server',
    );
  });

  it('deleteAccount(): 200 이면 성공, 401 이면 unauthorized', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200));
    await expect(createHttpSyncTransport().deleteAccount()).resolves.toBeUndefined();

    vi.mocked(fetch).mockResolvedValue(jsonResponse(401));
    await expect(createHttpSyncTransport().deleteAccount()).rejects.toSatisfy(
      (error: unknown) => isTransportError(error) && error.kind === 'unauthorized',
    );
  });

  it('logoutOthers(): 204 면 성공, CSRF 헤더를 싣는다', async () => {
    // 204(No Content) 는 본문을 가질 수 없다(Response 생성자 제약) — jsonResponse 헬퍼를 안 쓴다.
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    await expect(createHttpSyncTransport().logoutOthers()).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      '/auth/logout-others',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Tasky': '1' }),
      }),
    );
  });

  it('logoutOthers(): 401 이면 unauthorized, 5xx 면 server', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(401));
    await expect(createHttpSyncTransport().logoutOthers()).rejects.toSatisfy(
      (error: unknown) => isTransportError(error) && error.kind === 'unauthorized',
    );

    vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
    await expect(createHttpSyncTransport().logoutOthers()).rejects.toSatisfy(
      (error: unknown) => isTransportError(error) && error.kind === 'server',
    );
  });
});
