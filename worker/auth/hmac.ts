// HMAC-SHA256 서명 — 세션 쿠키·OAuth state 쿠키가 공유하는 서명 원시함수(SYNC_DESIGN.md §②-4).
// 라이브러리 0(WebCrypto `crypto.subtle`) — Worker 런타임 전역이라 의존성을 더하지 않는다.
// 쿠키 값 모양: `<payload>.<sig>` — payload 는 임의 문자열(세션은 `sid`, OAuth state 는 state 문자열
// 자체), sig 는 base64url(HMAC-SHA256(secret, payload)).

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return toBase64Url(sig);
}

/** `payload.sig` 형태로 직렬화한다. */
export async function signValue(payload: string, secret: string): Promise<string> {
  return `${payload}.${await sign(payload, secret)}`;
}

/**
 * `payload.sig` 를 검증한다 — **상수 시간 비교**(`crypto.subtle.verify`, 타이밍 공격 방지). 서명이
 * 맞으면 payload 를, 아니면 `null` 을 돌려준다. 서명 검증이 **D1 조회보다 먼저** 오는 것이 호출부
 * 계약이다(위조 쿠키로 D1 을 두드리지 않는다, SYNC_DESIGN.md §②-4).
 */
export async function verifySignedValue(value: string, secret: string): Promise<string | null> {
  const dot = value.lastIndexOf('.');
  if (dot === -1) return null;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!payload || !sig) return null;
  const key = await importKey(secret);
  const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const given = fromBase64Url(sig);
  if (given === null || given.byteLength !== expected.byteLength) return null;
  const ok = await crypto.subtle.verify('HMAC', key, given, new TextEncoder().encode(payload));
  return ok ? payload : null;
}

function fromBase64Url(value: string): ArrayBuffer | null {
  try {
    const padded = value
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  } catch {
    return null;
  }
}

/** 256비트 난수 → base64url. 세션 `sid`·PKCE `code_verifier`·OAuth `state` 가 공유하는 생성기. */
export function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return toBase64Url(arr.buffer);
}
