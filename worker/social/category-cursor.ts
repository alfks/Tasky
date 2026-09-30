import { isSocialId } from '@/domain/social/input';

import type { FeedTuple } from './cursor';

const TTL = 900_000;
const CONTEXT = new TextEncoder().encode('tasky:projection-cursor:v1');
export type ProjectionCursor = {
  v: 1;
  viewer: string;
  scope: string;
  last: string | FeedTuple;
  upper: FeedTuple | null;
  expiresAt: number;
};

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=/gu, '');
}

function decode(raw: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(raw) || raw.length % 4 === 1) return null;
  try {
    const padded =
      raw.replace(/-/gu, '+').replace(/_/gu, '/') + '='.repeat((4 - (raw.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    return encode(bytes) === raw ? bytes : null;
  } catch {
    return null;
  }
}

async function key(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`tasky:projection-cursor:key:v1\0${secret}`),
  );
  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function tuple(value: unknown): value is FeedTuple {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const fields = value as Record<string, unknown>;
  return (
    Object.keys(fields).sort().join(',') === 'createdAt,id' &&
    isSocialId(fields.id) &&
    Number.isSafeInteger(fields.createdAt) &&
    Number(fields.createdAt) >= 0
  );
}

function valid(
  value: unknown,
  viewer: string,
  scope: string,
  nowMs: number,
): value is ProjectionCursor {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const fields = value as Record<string, unknown>;
  if (Object.keys(fields).sort().join(',') !== 'expiresAt,last,scope,upper,v,viewer') return false;
  if (
    fields.v !== 1 ||
    fields.viewer !== viewer ||
    fields.scope !== scope ||
    !Number.isSafeInteger(fields.expiresAt) ||
    Number(fields.expiresAt) <= nowMs ||
    Number(fields.expiresAt) > nowMs + TTL
  )
    return false;
  if (typeof fields.last === 'string') return isSocialId(fields.last) && fields.upper === null;
  return (
    tuple(fields.last) &&
    tuple(fields.upper) &&
    (fields.last.createdAt < fields.upper.createdAt ||
      (fields.last.createdAt === fields.upper.createdAt && fields.last.id <= fields.upper.id))
  );
}

/** Sparse pages encrypt internal seek IDs so revoked/blocked membership cannot disclose them. */
export async function encodeProjectionCursor(
  secret: string,
  viewer: string,
  scope: string,
  last: string | FeedTuple,
  upper: FeedTuple | null,
  nowMs: number,
  expiresAt = nowMs + TTL,
): Promise<string> {
  const value: ProjectionCursor = { v: 1, viewer, scope, last, upper, expiresAt };
  if (!Number.isSafeInteger(nowMs) || !valid(value, viewer, scope, nowMs))
    throw new Error('Invalid cursor');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: CONTEXT },
      await key(secret),
      new TextEncoder().encode(JSON.stringify(value)),
    ),
  );
  const bytes = new Uint8Array(iv.length + encrypted.length);
  bytes.set(iv);
  bytes.set(encrypted, iv.length);
  return encode(bytes);
}

/** Verify audience, filter, shape and original expiry before touching listing SQL. */
export async function decodeProjectionCursor(
  secret: string,
  raw: unknown,
  viewer: string,
  scope: string,
  nowMs: number,
): Promise<ProjectionCursor | null> {
  if (typeof raw !== 'string' || raw.length > 2048 || !Number.isSafeInteger(nowMs)) return null;
  const bytes = decode(raw);
  if (!bytes || bytes.length < 29) return null;
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: CONTEXT },
      await key(secret),
      bytes.slice(12),
    );
    const value: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(plaintext),
    );
    return valid(value, viewer, scope, nowMs) ? value : null;
  } catch {
    return null;
  }
}
