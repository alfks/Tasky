import type { SocialErrorCode } from '@/domain/social/social';

import { clearSessionCookie, setSessionCookie } from '../auth/cookies';
import type { SessionOk } from '../auth/session';
import type { SocialOutcome } from './actor';

const statuses: Record<SocialErrorCode, number> = {
  unauthorized: 401,
  'account-deleted': 410,
  csrf: 403,
  unavailable: 404,
  conflict: 409,
  'request-pending': 409,
  'idempotency-conflict': 409,
  'request-expired': 409,
  validation: 422,
  'limit-reached': 422,
  'rate-limited': 429,
  'social-disabled': 503,
  temporary: 503,
};

export type Handled = SocialOutcome<{ data: unknown; status?: number }>;

export function handled<T>(outcome: SocialOutcome<T>, status = 200): Handled {
  return outcome.ok ? { ok: true, value: { data: outcome.value, status } } : outcome;
}

export function socialJson(
  data: unknown,
  nowMs: number,
  status = 200,
  session?: SessionOk,
  clear = false,
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'private, no-store',
    Vary: 'Cookie',
  });
  if (clear) headers.set('Set-Cookie', clearSessionCookie());
  else if (session?.refreshedCookie)
    headers.set('Set-Cookie', setSessionCookie(session.refreshedCookie));
  return new Response(JSON.stringify({ data, serverTime: nowMs }), { status, headers });
}

export function socialError(
  code: SocialErrorCode,
  nowMs: number,
  session?: SessionOk,
  status = statuses[code],
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'private, no-store',
    Vary: 'Cookie',
  });
  if (code === 'account-deleted') headers.set('Set-Cookie', clearSessionCookie());
  else if (session?.refreshedCookie)
    headers.set('Set-Cookie', setSessionCookie(session.refreshedCookie));
  return new Response(JSON.stringify({ error: { code }, serverTime: nowMs }), { status, headers });
}

export function validOrigin(request: Request): boolean {
  return (
    request.headers.get('X-Tasky') === '1' &&
    request.headers.get('Origin') === new URL(request.url).origin
  );
}

export type ParsedBody = { ok: true; body: unknown } | { ok: false; status: 400 | 413 | 415 };

/** Read at most 8193 bytes; never buffer an attacker-controlled full stream. */
export async function readSocialBody(request: Request): Promise<ParsedBody> {
  if (
    request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
  )
    return { ok: false, status: 415 };
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, status: 400 };
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 8192) {
        await reader.cancel();
        return { ok: false, status: 413 };
      }
      chunks.push(part.value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      ok: true,
      body: JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(body)),
    };
  } catch {
    return { ok: false, status: 400 };
  } finally {
    reader.releaseLock();
  }
}
