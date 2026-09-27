import type { PageInput, PostInput } from '@/domain/social/social';

export type Validation<T> = { ok: true; value: T } | { ok: false; code: 'validation' };
const INVALID: Validation<never> = { ok: false, code: 'validation' };
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/u;
const SOCIAL_ID = /^[0-9a-f]{32}$/u;
const INVITE_TOKEN = /^[0-9a-f]{64}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

/** 공개 id는 서버가 생성한 128비트 난수의 소문자 hex 표기만 받는다. */
export function isSocialId(value: unknown): value is string {
  return typeof value === 'string' && SOCIAL_ID.test(value);
}

/** 원문은 256비트 난수의 소문자 hex이며 URL query나 로그에 넣지 않는다. */
export function isInviteToken(value: unknown): value is string {
  return typeof value === 'string' && INVITE_TOKEN.test(value);
}

export function parseNickname(value: unknown): Validation<string> {
  if (typeof value !== 'string' || CONTROL.test(value)) return INVALID;
  const normalized = value.trim().normalize('NFC');
  const count = [...normalized].length;
  if (count < 1 || count > 20) return INVALID;
  return { ok: true, value: normalized };
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function isHappenedOn(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1970 || year > 2099 || month < 1 || month > 12) return false;
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

/** 공유 명령은 text와 happenedOn만 수락한다. 원본 id 등은 초과 필드로 거절된다. */
export function parsePostInput(value: unknown): Validation<PostInput> {
  if (!isRecord(value) || !hasOnlyKeys(value, ['text', 'happenedOn'])) return INVALID;
  if (typeof value.text !== 'string' || CONTROL.test(value.text)) return INVALID;
  const text = value.text.trim();
  if ([...text].length < 1 || [...text].length > 280 || !isHappenedOn(value.happenedOn)) {
    return INVALID;
  }
  return { ok: true, value: { text, happenedOn: value.happenedOn } };
}

export function parsePageInput(value: unknown): Validation<PageInput> {
  if (!isRecord(value) || !hasOnlyKeys(value, ['cursor', 'limit'])) return INVALID;
  const { cursor, limit } = value;
  if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length === 0)) return INVALID;
  if (
    limit !== undefined &&
    (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 50)
  ) {
    return INVALID;
  }
  return {
    ok: true,
    value: { ...(cursor === undefined ? {} : { cursor }), limit: Number(limit ?? 20) },
  };
}
