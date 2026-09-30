// 규칙 = 테스트명 (profile.md R1·R2·R5·R7, ADR-0023 규칙 2·4).
import { describe, expect, it } from 'vitest';

import { DomainError } from '@/domain/errors';
import {
  isAcceptableProfileAvatar,
  isAcceptableProfileBio,
  isAcceptableProfileName,
  isValidProfileAvatar,
  PROFILE_AVATAR_MAX_CHARS,
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_NAME_MAX_LENGTH,
  PROFILE_TEXT_RAW_MAX_LENGTH,
  setProfile,
  validateProfileAvatar,
  validateProfileBio,
  validateProfileName,
  normalizeProfileText,
  profileCharCount,
  profileDisplayBio,
  profileDisplayName,
  profileInitial,
} from '@/domain/profile/profile.rules';

import { fixedDeps } from '@/test/fixtures/deps';
import { makeSettings } from '@/test/fixtures/settings';

const LATER = '2026-03-01T00:00:00.000Z';
const deps = fixedDeps({ now: LATER });

/** R5 형식을 만족하는 `n` 글자짜리 데이터 URL. base64 본문 길이는 4 의 배수로 맞춘다. */
function avatarOfLength(total: number, prefix = 'data:image/webp;base64,'): string {
  const body = total - prefix.length;
  return prefix + 'A'.repeat(body - (body % 4)) + '='.repeat(body % 4);
}

describe('normalizeProfileText — R1 다듬기', () => {
  it('줄바꿈 네 종류를 공백으로 바꾸고 앞뒤 공백을 제거한다', () => {
    expect(normalizeProfileText('  밀\r\n리\u2028\u2029 ')).toBe('밀 리');
  });

  it('연속 공백은 하나로 접는다', () => {
    expect(normalizeProfileText('오늘도   한 칸씩')).toBe('오늘도 한 칸씩');
  });

  it('코드 포인트로 센다 — 이모지 한 글자는 1', () => {
    expect(profileCharCount('😀a')).toBe(2);
  });
});

describe('validateProfileName — R1 경계', () => {
  it('비우면 미설정(undefined)이고 오류가 아니다 (0자·공백만)', () => {
    expect(validateProfileName('')).toBeUndefined();
    expect(validateProfileName('   \n ')).toBeUndefined();
  });

  it('1자·20자는 통과하고 다듬은 값을 돌려준다', () => {
    expect(validateProfileName(' 밀 ')).toBe('밀');
    expect(validateProfileName('가'.repeat(PROFILE_NAME_MAX_LENGTH))).toHaveLength(20);
  });

  it('21자는 PROFILE_NAME_TOO_LONG 으로 던진다 (다듬은 뒤 기준 — 앞뒤 공백은 안 센다)', () => {
    expect(() => validateProfileName('가'.repeat(21))).toThrow(DomainError);
    expect(() => validateProfileName('가'.repeat(21))).toThrow('이름은 20자까지 쓸 수 있어요');
    expect(validateProfileName(`  ${'가'.repeat(20)}  `)).toHaveLength(20);
  });

  it('이모지 20개는 코드 포인트 20자라 통과한다(UTF-16 로는 40)', () => {
    const emoji = '😀'.repeat(20);
    expect(emoji.length).toBe(40);
    expect(validateProfileName(emoji)).toBe(emoji);
  });
});

describe('validateProfileBio — R2 경계', () => {
  it('0자는 미설정, 60자는 통과, 61자는 PROFILE_BIO_TOO_LONG', () => {
    expect(validateProfileBio('')).toBeUndefined();
    expect(validateProfileBio('나'.repeat(PROFILE_BIO_MAX_LENGTH))).toHaveLength(60);
    expect(() => validateProfileBio('나'.repeat(61))).toThrow('소개는 60자까지 쓸 수 있어요');
  });

  it('줄바꿈이 섞여 들어와도 한 줄로 다듬는다', () => {
    expect(validateProfileBio('오늘도\n한 칸씩')).toBe('오늘도 한 칸씩');
  });
});

describe('isValidProfileAvatar — R5 접두·문자 집합·길이', () => {
  it('webp·jpeg 데이터 URL 만 받는다', () => {
    expect(isValidProfileAvatar('data:image/webp;base64,AAAA')).toBe(true);
    expect(isValidProfileAvatar('data:image/jpeg;base64,AAAA')).toBe(true);
    expect(isValidProfileAvatar('data:image/png;base64,AAAA')).toBe(false);
    expect(isValidProfileAvatar('https://example.com/a.webp')).toBe(false);
  });

  it('base64 문자 집합 밖의 문자·빈 본문은 거부한다', () => {
    expect(isValidProfileAvatar('data:image/webp;base64,AA A')).toBe(false);
    expect(isValidProfileAvatar('data:image/webp;base64,<script>')).toBe(false);
    expect(isValidProfileAvatar('data:image/webp;base64,')).toBe(false);
  });

  it('16,384자는 통과하고 16,385자는 거부한다', () => {
    expect(isValidProfileAvatar(avatarOfLength(PROFILE_AVATAR_MAX_CHARS))).toBe(true);
    expect(isValidProfileAvatar(avatarOfLength(PROFILE_AVATAR_MAX_CHARS + 1))).toBe(false);
  });

  it('validateProfileAvatar 는 같은 판정으로 던진다', () => {
    expect(() => validateProfileAvatar('data:image/gif;base64,AAAA')).toThrow(
      '사진을 줄이지 못했어요. 다른 사진을 골라 주세요',
    );
    expect(validateProfileAvatar('data:image/jpeg;base64,AAAA')).toBe(
      'data:image/jpeg;base64,AAAA',
    );
  });
});

describe('isAcceptable* — R8 읽기 경로의 관용(다듬은 값으로 판정, 값은 안 바꾼다)', () => {
  it('앞뒤 공백 있는 20자 이름은 받아들이고, 다듬어도 21자면 거부한다', () => {
    expect(isAcceptableProfileName(`  ${'가'.repeat(20)}  `)).toBe(true);
    expect(isAcceptableProfileName('가'.repeat(21))).toBe(false);
  });

  it('다듬기 전 원시 길이가 1,000자를 넘으면 다듬어서 짧아도 무효 — 공백으로 부풀린 값(리뷰 A-m1)', () => {
    expect(isAcceptableProfileName(`${' '.repeat(2_000)}밀리`)).toBe(false);
    expect(isAcceptableProfileBio(' '.repeat(PROFILE_TEXT_RAW_MAX_LENGTH))).toBe(true);
    expect(isAcceptableProfileBio(' '.repeat(PROFILE_TEXT_RAW_MAX_LENGTH + 1))).toBe(false);
  });

  it('공백만 있는 소개(" ")는 다듬으면 0자라 유효하다', () => {
    expect(isAcceptableProfileBio(' ')).toBe(true);
    expect(isAcceptableProfileBio('나'.repeat(61))).toBe(false);
  });

  it('문자열이 아니면 셋 다 거부한다', () => {
    expect(isAcceptableProfileName(3)).toBe(false);
    expect(isAcceptableProfileBio(null)).toBe(false);
    expect(isAcceptableProfileAvatar({})).toBe(false);
    expect(isAcceptableProfileAvatar('data:image/webp;base64,AAAA')).toBe(true);
  });
});

describe('setProfile — R7 (ADR-0023 규칙 4)', () => {
  it('세 필드만 바꾸고 touch 한다 — 다른 필드(강조색·시드)는 그대로다', () => {
    const settings = makeSettings({ accentColor: '#FF8FA3', seededAt: '2026-01-15T00:00:00.000Z' });
    const next = setProfile(
      settings,
      { name: ' 밀리 ', bio: '오늘도\n한 칸씩', avatar: 'data:image/webp;base64,AAAA' },
      deps,
    );
    expect(next).toMatchObject({
      accentColor: '#FF8FA3',
      seededAt: '2026-01-15T00:00:00.000Z',
      profileName: '밀리',
      profileBio: '오늘도 한 칸씩',
      profileAvatar: 'data:image/webp;base64,AAAA',
      profileVersion: 1,
      rev: settings.rev + 1,
      updatedAt: LATER,
    });
  });

  it('비운 이름·소개·지운 사진은 필드를 제거한다 (null·빈 문자열을 저장하지 않는다)', () => {
    const settings = makeSettings({
      profileName: '밀리',
      profileBio: '소개',
      profileAvatar: 'data:image/webp;base64,AAAA',
    });
    const next = setProfile(settings, { name: '  ', bio: '', avatar: undefined }, deps);
    expect('profileName' in next).toBe(false);
    expect('profileBio' in next).toBe(false);
    expect('profileAvatar' in next).toBe(false);
    expect(next.profileVersion).toBe(1);
    expect(next.rev).toBe(settings.rev + 1);
  });

  it('빈 문자열 사진도 "지운다" 로 읽는다', () => {
    const next = setProfile(
      makeSettings({ profileAvatar: 'data:image/webp;base64,AAAA' }),
      { name: '', bio: '', avatar: '' },
      deps,
    );
    expect('profileAvatar' in next).toBe(false);
  });

  it('상한을 넘는 값은 저장 전에 던진다 (R1·R2·R5)', () => {
    expect(() =>
      setProfile(makeSettings(), { name: '가'.repeat(21), bio: '', avatar: undefined }, deps),
    ).toThrow(DomainError);
    expect(() =>
      setProfile(makeSettings(), { name: '', bio: '', avatar: 'data:image/png;base64,AAAA' }, deps),
    ).toThrow('사진을 줄이지 못했어요. 다른 사진을 골라 주세요');
  });
});

describe('표시 (R9·R10)', () => {
  it('첫 글자는 첫 그래핌 — ZWJ 가족 이모지도 하나, 라틴 소문자는 대문자로', () => {
    expect(profileInitial('밀리')).toBe('밀');
    expect(profileInitial('millie')).toBe('M');
    expect(profileInitial('👨‍👩‍👧 가족')).toBe('👨‍👩‍👧');
    expect(profileInitial('')).toBe('');
  });

  it('이름 미설정이면 이메일 @ 앞부분, 그것도 없으면 "나"', () => {
    expect(profileDisplayName(undefined, 'millie@example.com')).toBe('millie');
    expect(profileDisplayName('  ', 'millie@example.com')).toBe('millie');
    expect(profileDisplayName(undefined, null)).toBe('나');
    expect(profileDisplayName(undefined, '@example.com')).toBe('나');
  });

  it('저장값에 앞뒤 공백이 있어도(R8 그대로 저장) 표시할 때 다듬는다', () => {
    expect(profileDisplayName('  밀리 ', null)).toBe('밀리');
    expect(profileDisplayBio('  ')).toBeUndefined();
    expect(profileDisplayBio(' 오늘도 한 칸씩\n')).toBe('오늘도 한 칸씩');
  });
});
