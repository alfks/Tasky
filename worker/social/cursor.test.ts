import { describe, expect, it } from 'vitest';

import { decodeFeedCursor, decodeListCursor, encodeFeedCursor, encodeListCursor } from './cursor';

const SECRET = 'cursor-secret';
const NOW = 1_800_000_000_000;
const A = 'a'.padStart(32, '0');
const B = 'b'.padStart(32, '0');
const INVITE = 'c'.repeat(64);

function b64url(bytes: Uint8Array): string {
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=/gu, '');
}

/** Valid MAC over deliberately invalid shape isolates decoder validation from tampering. */
async function forge(payload: unknown): Promise<string> {
  const body = new TextEncoder().encode(JSON.stringify(payload));
  const prefix = new TextEncoder().encode('tasky:social-cursor:v1\0');
  const input = new Uint8Array(prefix.length + body.length);
  input.set(prefix);
  input.set(body, prefix.length);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, input));
  return `${b64url(body)}.${b64url(mac)}`;
}

const valid = {
  v: 1,
  actorId: A,
  scope: 'friends',
  upper: null,
  last: B,
  expiresAt: NOW + 900_000,
};

describe('signed relation-list cursor', () => {
  it('정상 chain은 actor/scope에 묶이고 15분 기한을 연장하지 않는다', async () => {
    const first = await encodeListCursor(SECRET, A, 'friends', B, NOW);
    expect(first).not.toContain(B);
    const decoded = await decodeListCursor(SECRET, first, A, 'friends', NOW + 100);
    expect(decoded).toEqual(valid);
    const next = await encodeListCursor(SECRET, A, 'friends', B, NOW + 100, decoded!.expiresAt);
    expect((await decodeListCursor(SECRET, next, A, 'friends', NOW + 899_999))?.expiresAt).toBe(
      NOW + 900_000,
    );
    expect(await decodeListCursor(SECRET, next, A, 'friends', NOW + 900_000)).toBeNull();
    await expect(encodeListCursor(SECRET, A, 'friends', B, NOW, NOW + 900_001)).rejects.toThrow();
    expect(await decodeListCursor(SECRET, first, B, 'friends', NOW)).toBeNull();
    expect(await decodeListCursor(SECRET, first, A, 'blocks', NOW)).toBeNull();
  });

  it('변조·원시 ID·길이 초과·비정규 인코딩을 모두 validation으로 합친다', async () => {
    const cursor = await encodeListCursor(SECRET, A, 'friends', B, NOW);
    const [body, mac] = cursor.split('.');
    for (const raw of [
      B,
      `${cursor}x`,
      `${body}x.${mac}`,
      `${body}.${mac}=`,
      'x'.repeat(2049),
      `${cursor}.extra`,
    ]) {
      expect(await decodeListCursor(SECRET, raw, A, 'friends', NOW)).toBeNull();
    }
    expect(await decodeListCursor('different-secret', cursor, A, 'friends', NOW)).toBeNull();
  });

  it('유효 MAC이라도 version·필드·upper·기한 형식이 틀리면 거절한다', async () => {
    for (const payload of [
      { ...valid, v: 2 },
      { ...valid, extra: 1 },
      { ...valid, upper: B },
      { ...valid, last: INVITE },
      { ...valid, expiresAt: NOW + 900_001 },
      { ...valid, expiresAt: NOW + 0.5 },
      { ...valid, scope: 'unknown' },
    ]) {
      expect(await decodeListCursor(SECRET, await forge(payload), A, 'friends', NOW)).toBeNull();
    }
  });

  it('incoming/outgoing과 invite hash 길이를 서로 분리한다', async () => {
    const incoming = await encodeListCursor(SECRET, A, 'requests:incoming', B, NOW);
    expect(await decodeListCursor(SECRET, incoming, A, 'requests:outgoing', NOW)).toBeNull();
    const invite = await encodeListCursor(SECRET, A, 'invites', INVITE, NOW);
    expect((await decodeListCursor(SECRET, invite, A, 'invites', NOW))?.last).toBe(INVITE);
    await expect(encodeListCursor(SECRET, A, 'invites', B, NOW)).rejects.toThrow();
    await expect(encodeListCursor(SECRET, A, 'friends', INVITE, NOW)).rejects.toThrow();
  });
});

describe('signed feed tuple cursor', () => {
  const upper = { createdAt: NOW, id: B };
  const last = { createdAt: NOW - 1, id: A };

  it('actor·scope와 첫 페이지 기한에 묶이고 관리 목록과 분리된다', async () => {
    const first = await encodeFeedCursor(SECRET, A, 'feed', upper, last, NOW);
    expect(first).not.toContain(B);
    const decoded = await decodeFeedCursor(SECRET, first, A, 'feed', NOW + 100);
    expect(decoded).toEqual({
      v: 1,
      actorId: A,
      scope: 'feed',
      upper,
      last,
      expiresAt: NOW + 900_000,
    });
    const next = await encodeFeedCursor(
      SECRET,
      A,
      'feed',
      upper,
      { createdAt: NOW - 2, id: B },
      NOW + 100,
      decoded!.expiresAt,
    );
    expect((await decodeFeedCursor(SECRET, next, A, 'feed', NOW + 899_999))?.expiresAt).toBe(
      NOW + 900_000,
    );
    expect(await decodeFeedCursor(SECRET, next, A, 'feed', NOW + 900_000)).toBeNull();
    expect(await decodeFeedCursor(SECRET, first, B, 'feed', NOW)).toBeNull();
    expect(await decodeFeedCursor(SECRET, first, A, 'posts:mine', NOW)).toBeNull();
    expect(await decodeListCursor(SECRET, first, A, 'friends', NOW)).toBeNull();
  });

  it('서명됐어도 tuple 역전·초과필드·시간 범위가 잘못되면 거절한다', async () => {
    const validFeed = { v: 1, actorId: A, scope: 'feed', upper, last, expiresAt: NOW + 900_000 };
    for (const payload of [
      { ...validFeed, last: { createdAt: NOW + 1, id: A } },
      { ...validFeed, last: { createdAt: NOW, id: 'f'.repeat(32) } },
      { ...validFeed, upper: { createdAt: NOW, id: 'not-an-id' } },
      { ...validFeed, upper: { ...upper, extra: 1 } },
      { ...validFeed, expiresAt: NOW + 900_001 },
    ])
      expect(await decodeFeedCursor(SECRET, await forge(payload), A, 'feed', NOW)).toBeNull();
    const first = await encodeFeedCursor(SECRET, A, 'feed', upper, last, NOW);
    expect(await decodeFeedCursor('other-secret', first, A, 'feed', NOW)).toBeNull();
    await expect(encodeFeedCursor(SECRET, A, 'feed', last, upper, NOW)).rejects.toThrow();
  });
});
