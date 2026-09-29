// 프로필(이름·한 줄 소개·사진) 규칙 (profile.md R1·R2·R5·R7·R9·R10, ADR-0023).
//
// **상한 상수는 이 파일에만 리터럴로 있다**(ADR-0023 규칙 2) — 클라이언트 검증·백업 복원·동기화 풀·
// Worker 푸시(`validate-rows.ts#readSettings`)가 전부 여기서 import 한다. 값 자체를 다듬는(R1·R2)
// 유일한 자리는 `setProfile`(클라이언트 쓰기 경로, R7)이고, 읽기 경로(R8)는 다듬은 값으로 **검사만**
// 하고 받은 값을 그대로 저장한다 — 그 검사가 아래 `isAcceptable*` 이다.
//
// 표시용 다듬기·첫 글자·폴백(R9·R10)도 **같은 파일**이다. 파일을 둘로 가르면 사이드바 카드(진입)가
// 표시 함수만 쓰고 검증은 지연 청크만 써서 이 모듈이 두 지연 청크(편집 대화상자·validate-rows)만의
// 공유 청크가 되는데, 그 순간 rolldown 이 대화상자와 진입이 나눠 쓰는 `Dialog` 까지 진입에서 떼어
// 진입 폐포가 약 1.2 KB 커졌다(실측 2026-09-29 — 검증 코드 0.55 KB 를 진입에 두는 쪽이 더 싸다).
import { DomainError } from '@/domain/errors';
import { touch, type MetaDeps, type Persistable } from '@/domain/meta';
import type { Settings } from '@/domain/theme/settings';

/** 이름 최대 길이 — 다듬은 뒤 코드 포인트 수 (R1). */
export const PROFILE_NAME_MAX_LENGTH = 20;
/** 한 줄 소개 최대 길이 (R2). */
export const PROFILE_BIO_MAX_LENGTH = 60;
/** 사진 데이터 URL 의 최대 **문자열 길이**(≈ 이진 12 KB). 상한이자 R6 품질 하강의 문턱이다 (R5). */
export const PROFILE_AVATAR_MAX_CHARS = 16_384;
/**
 * 저장을 허용하는 사진 형식 둘(WebP·JPEG 데이터 URL)과 base64 문자 집합 (R4·R5). 다른 접두는 읽기
 * 경로에서 필드째 버린다(R8). 길이는 `PROFILE_AVATAR_MAX_CHARS` 가 따로 본다.
 */
export const PROFILE_AVATAR_PATTERN = /^data:image\/(?:webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/u;

/** 이름·소개 공통: 다듬어서 비면 `undefined`(미설정 — 오류가 아니다), 상한 초과면 `code` 로 던진다. */
function validateText(
  raw: string,
  max: number,
  code: 'PROFILE_NAME_TOO_LONG' | 'PROFILE_BIO_TOO_LONG',
): string | undefined {
  const text = normalizeProfileText(raw);
  if (text.length === 0) return undefined;
  const count = profileCharCount(text);
  if (count > max) throw new DomainError(code, String(count));
  return text;
}

/** 다듬은 이름을 돌려준다. 비면 `undefined`, 20자 초과면 던진다 (R1). */
export function validateProfileName(raw: string): string | undefined {
  return validateText(raw, PROFILE_NAME_MAX_LENGTH, 'PROFILE_NAME_TOO_LONG');
}

/** 다듬은 소개를 돌려준다. 비면 `undefined`, 60자 초과면 던진다 (R2). */
export function validateProfileBio(raw: string): string | undefined {
  return validateText(raw, PROFILE_BIO_MAX_LENGTH, 'PROFILE_BIO_TOO_LONG');
}

/** 접두·base64 문자 집합·길이 셋 다 본다 (R5). 빈 본문도 거부한다. */
export function isValidProfileAvatar(value: string): boolean {
  return value.length <= PROFILE_AVATAR_MAX_CHARS && PROFILE_AVATAR_PATTERN.test(value);
}

/** R5 를 어기면 던진다 — 저장 직전의 마지막 관문(ADR-0023 규칙 5). */
export function validateProfileAvatar(value: string): string {
  if (!isValidProfileAvatar(value)) {
    throw new DomainError('PROFILE_AVATAR_INVALID');
  }
  return value;
}

/**
 * 읽기 경로의 관용 판정 (R8): 다듬은 값이 상한 안이면 받아들인다. 빈 값·공백만 있는 값도 유효하다
 * (다듬으면 0자). 문자열이 아니면 거부. `validate-rows.ts` 가 필드 단위로 버릴지 정할 때 쓴다.
 */
export function isAcceptableProfileName(value: unknown): value is string {
  return withinLimit(value, PROFILE_NAME_MAX_LENGTH);
}

/** `isAcceptableProfileName` 의 소개판 (R8). */
export function isAcceptableProfileBio(value: unknown): value is string {
  return withinLimit(value, PROFILE_BIO_MAX_LENGTH);
}

function withinLimit(value: unknown, max: number): value is string {
  return typeof value === 'string' && profileCharCount(normalizeProfileText(value)) <= max;
}

/** 사진은 다듬을 것이 없다 — 형식 그대로 R5 (R8). */
export function isAcceptableProfileAvatar(value: unknown): value is string {
  return typeof value === 'string' && isValidProfileAvatar(value);
}

/** 편집 대화상자가 넘기는 값. `undefined`·빈 문자열은 "지운다"(필드 제거, R7). */
export type ProfileInput = {
  name: string;
  bio: string;
  avatar: string | undefined;
};

/**
 * 설정 행 위에 프로필 세 필드만 바꿔 쓴다 (R7). 호출부는 **저장소에서 새로 읽은** 행을 넘겨야
 * 한다(ADR-0023 규칙 4 — 캐시된 옛 행이면 다른 기기·테마 스토어가 바꾼 강조색을 덮어쓴다).
 * 비운 필드는 `null`·빈 문자열이 아니라 **제거**한다.
 */
export function setProfile(
  settings: Settings,
  input: ProfileInput,
  deps: MetaDeps,
): Persistable<Settings> {
  const name = validateProfileName(input.name);
  const bio = validateProfileBio(input.bio);
  const avatar =
    input.avatar === undefined || input.avatar.length === 0
      ? undefined
      : validateProfileAvatar(input.avatar);
  const { profileName: _n, profileBio: _b, profileAvatar: _a, ...rest } = settings;
  const next: Settings = {
    ...rest,
    ...(name === undefined ? {} : { profileName: name }),
    ...(bio === undefined ? {} : { profileBio: bio }),
    ...(avatar === undefined ? {} : { profileAvatar: avatar }),
  };
  return touch(next, deps.now());
}

/** 줄바꿈(`\r`·`\n`·U+2028·U+2029)은 공백으로, 연속 공백은 하나로, 앞뒤 공백 제거 (R1·R2). */
export function normalizeProfileText(raw: string): string {
  return raw
    .replace(/[\r\n\u2028\u2029]+/gu, ' ')
    .replace(/\s{2,}/gu, ' ')
    .trim();
}

/** 코드 유닛이 아니라 코드 포인트로 센다 — todo.md 제목과 같은 셈법 (R1). */
export function profileCharCount(value: string): number {
  return [...value].length;
}

let segmenter: Intl.Segmenter | undefined;

/**
 * 표시 이름의 첫 글자 — 사진이 없을 때 강조색 원에 넣는다 (R9). 첫 **그래핌**이고(가족 이모지 같은
 * ZWJ 조합이 한 글자), `Intl.Segmenter` 가 없으면 첫 코드 포인트다. 빈 문자열이면 빈 문자열.
 */
export function profileInitial(name: string): string {
  if (name.length === 0) return '';
  if (typeof Intl === 'undefined' || !('Segmenter' in Intl)) {
    return [...name][0] ?? '';
  }
  segmenter ??= new Intl.Segmenter('ko', { granularity: 'grapheme' });
  const first = segmenter.segment(name)[Symbol.iterator]().next();
  return first.done ? '' : first.value.segment;
}

/**
 * 카드에 보일 이름 (R10). 저장값은 받은 그대로일 수 있으므로(R8 — 앞뒤 공백이 남은 이름) 여기서
 * 다듬어 보이고, 비어 있으면 로그인 이메일의 `@` 앞부분, 그것도 없으면 "나".
 */
export function profileDisplayName(name: string | undefined, email: string | null): string {
  const trimmed = name === undefined ? '' : normalizeProfileText(name);
  if (trimmed.length > 0) return trimmed;
  const local = email === null ? '' : (email.split('@')[0]?.trim() ?? '');
  return local.length > 0 ? local : '나';
}

/** 카드에 보일 소개 (R10). 다듬어서 비면 `undefined` — 호출부가 자리표시 문구를 낸다. */
export function profileDisplayBio(bio: string | undefined): string | undefined {
  if (bio === undefined) return undefined;
  const trimmed = normalizeProfileText(bio);
  return trimmed.length === 0 ? undefined : trimmed;
}
