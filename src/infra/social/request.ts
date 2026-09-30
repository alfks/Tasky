import type { SocialErrorCode, SocialResponse } from '@/domain/social/social';

import type { SocialRepositoryFailure } from '@/repositories/social-repository';

import { SocialProtocolError } from '@/infra/social/protocol-error';

const CODES: readonly SocialErrorCode[] = [
  'unauthorized',
  'account-deleted',
  'csrf',
  'unavailable',
  'conflict',
  'request-pending',
  'idempotency-conflict',
  'request-expired',
  'validation',
  'limit-reached',
  'rate-limited',
  'social-disabled',
  'temporary',
];

type Transport = typeof fetch;
export type RequestOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
  key?: string;
  query?: Readonly<Record<string, string | number | undefined>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function codeOf(value: unknown): SocialErrorCode | null {
  return typeof value === 'string' && CODES.includes(value as SocialErrorCode)
    ? (value as SocialErrorCode)
    : null;
}

function timeOf(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : Date.now();
}

export class SocialRequestError extends Error implements SocialRepositoryFailure {
  readonly code: SocialErrorCode;
  readonly serverTime: number;
  readonly retryAfter?: number;

  constructor(code: SocialErrorCode, serverTime: number, retryAfter?: number) {
    super(code);
    this.name = 'SocialRequestError';
    this.code = code;
    this.serverTime = serverTime;
    this.retryAfter = retryAfter;
  }
}

function errorOf(response: Response, value: unknown): SocialRequestError {
  const record = isRecord(value) ? value : null;
  const error = record !== null && isRecord(record.error) ? record.error : null;
  const known = error !== null && Object.keys(error).length === 1 ? codeOf(error.code) : null;
  const status = response.status;
  const permitted: Partial<Record<number, readonly SocialErrorCode[]>> = {
    403: ['csrf'],
    404: ['unavailable'],
    409: ['conflict', 'request-pending', 'idempotency-conflict', 'request-expired'],
    422: ['validation', 'limit-reached'],
    429: ['rate-limited'],
    503: ['social-disabled', 'temporary'],
  };
  const code =
    status === 401
      ? 'unauthorized'
      : status === 410
        ? 'account-deleted'
        : known !== null && permitted[status]?.includes(known)
          ? known
          : 'temporary';
  const retry = Number(response.headers.get('Retry-After'));
  return new SocialRequestError(
    code,
    timeOf(record?.serverTime),
    Number.isFinite(retry) && retry > 0 ? retry : undefined,
  );
}

function urlFor(path: string, query: RequestOptions['query']): string {
  const url = new URL(`/api/social${path}`, location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return `${url.pathname}${url.search}`;
}

/** 응답 본문이 불명확해도 명령을 자동 재시도하지 않는다. 호출자가 같은 key와 body를 보존한다. */
export function createSocialRequest(transport: Transport = fetch) {
  return async function request<T>(
    path: string,
    decode: (value: unknown) => T,
    options: RequestOptions = {},
  ): Promise<SocialResponse<T>> {
    const method = options.method ?? 'GET';
    const headers: Record<string, string> = { 'X-Tasky': '1' };
    if (method === 'POST') headers['Content-Type'] = 'application/json';
    if (options.key !== undefined) headers['Idempotency-Key'] = options.key;
    let response: Response;
    try {
      response = await transport(urlFor(path, options.query), {
        method,
        headers,
        credentials: 'include',
        cache: 'no-store',
        ...(method === 'POST' ? { body: JSON.stringify(options.body ?? {}) } : {}),
      });
    } catch {
      throw new SocialRequestError('temporary', Date.now());
    }
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw errorOf(response, null);
    }
    if (!response.ok) throw errorOf(response, value);
    if (
      !isRecord(value) ||
      Object.keys(value).length !== 2 ||
      !('data' in value) ||
      typeof value.serverTime !== 'number' ||
      !Number.isSafeInteger(value.serverTime)
    ) {
      throw new SocialRequestError('temporary', Date.now());
    }
    try {
      return { data: decode(value.data), serverTime: value.serverTime };
    } catch (error) {
      if (error instanceof SocialProtocolError) {
        throw new SocialRequestError('temporary', value.serverTime);
      }
      throw error;
    }
  };
}
