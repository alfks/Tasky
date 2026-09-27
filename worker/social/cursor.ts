/** Opaque relation-list cursor. Feed tuple cursors are a later, separate scope. */
export type ListScope =
  'friends' | 'requests:incoming' | 'requests:outgoing' | 'invites' | 'blocks';

export type ListCursor = {
  v: 1;
  actorId: string;
  scope: ListScope;
  upper: null;
  last: string;
  expiresAt: number;
};

const PREFIX = new TextEncoder().encode('tasky:social-cursor:v1\0');
const TTL_MS = 900_000;
const MAX_LENGTH = 2048;
const PROFILE_ID = /^[0-9a-f]{32}$/u;
const INVITE_ID = /^[0-9a-f]{64}$/u;
const ENCODED = /^[A-Za-z0-9_-]+$/u;
const KEYS = ['actorId', 'expiresAt', 'last', 'scope', 'upper', 'v'];
const SCOPES: readonly ListScope[] = [
  'friends',
  'requests:incoming',
  'requests:outgoing',
  'invites',
  'blocks',
];

function b64url(bytes: Uint8Array): string {
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=/gu, '');
}

function fromB64url(encoded: string): Uint8Array | null {
  if (!ENCODED.test(encoded) || encoded.length % 4 === 1) return null;
  try {
    const padded =
      encoded.replace(/-/gu, '+').replace(/_/gu, '/') + '='.repeat((4 - (encoded.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    return b64url(bytes) === encoded ? bytes : null;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function signedBytes(payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(PREFIX.length + payload.length);
  bytes.set(PREFIX);
  bytes.set(payload, PREFIX.length);
  return bytes;
}

function validShape(
  value: unknown,
  actorId: string,
  scope: ListScope,
  nowMs: number,
): value is ListCursor {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const dto = value as Record<string, unknown>;
  const keys = Object.keys(dto).sort();
  if (keys.length !== KEYS.length || keys.some((key, i) => key !== KEYS[i])) return false;
  const idPattern = scope === 'invites' ? INVITE_ID : PROFILE_ID;
  return (
    dto.v === 1 &&
    dto.actorId === actorId &&
    PROFILE_ID.test(actorId) &&
    dto.scope === scope &&
    SCOPES.includes(scope) &&
    dto.upper === null &&
    typeof dto.last === 'string' &&
    idPattern.test(dto.last) &&
    typeof dto.expiresAt === 'number' &&
    Number.isSafeInteger(dto.expiresAt) &&
    dto.expiresAt > nowMs &&
    dto.expiresAt <= nowMs + TTL_MS
  );
}

export async function encodeListCursor(
  secret: string,
  actorId: string,
  scope: ListScope,
  last: string,
  nowMs: number,
  expiresAt = nowMs + TTL_MS,
): Promise<string> {
  const payload: ListCursor = { v: 1, actorId, scope, upper: null, last, expiresAt };
  if (!Number.isSafeInteger(nowMs) || !validShape(payload, actorId, scope, nowMs))
    throw new Error('Invalid cursor data');
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const mac = new Uint8Array(
    await crypto.subtle.sign('HMAC', await hmacKey(secret), signedBytes(bytes)),
  );
  const encoded = `${b64url(bytes)}.${b64url(mac)}`;
  if (encoded.length > MAX_LENGTH) throw new Error('Invalid cursor length');
  return encoded;
}

export async function decodeListCursor(
  secret: string,
  raw: unknown,
  actorId: string,
  scope: ListScope,
  nowMs: number,
): Promise<ListCursor | null> {
  if (
    typeof raw !== 'string' ||
    raw.length > MAX_LENGTH ||
    raw.split('.').length !== 2 ||
    !Number.isSafeInteger(nowMs)
  )
    return null;
  const [body, sig] = raw.split('.');
  const payload = fromB64url(body);
  const mac = fromB64url(sig);
  if (!payload || !mac || mac.length !== 32) return null;
  try {
    const verified = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      mac,
      signedBytes(payload),
    );
    if (!verified) return null;
    const value: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(payload),
    );
    return validShape(value, actorId, scope, nowMs) ? value : null;
  } catch {
    return null;
  }
}
