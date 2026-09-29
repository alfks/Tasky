// 순수 부분만 (profile.md R4·R6 — 인코더 주입). 실변환은 e2e `profile.spec.ts`.
import { describe, expect, it, vi } from 'vitest';

import { PROFILE_AVATAR_MAX_CHARS } from '@/domain/profile/profile.rules';

import {
  coverCrop,
  encodeAvatar,
  MAX_ENCODE_ATTEMPTS,
  type AvatarEncoder,
} from '@/features/profile/lib/avatar-encode';

/** 길이 `n` 의 결과를 내는 인코더. `mime` 을 그대로 접두에 쓴다(지원되는 브라우저 흉내). */
function encoderOf(length: (mime: string, quality: number) => number): AvatarEncoder {
  return (mime, quality) => `data:${mime};base64,${'A'.repeat(length(mime, quality))}`;
}

describe('coverCrop — 짧은 변 기준 정사각 가운데 (R4)', () => {
  it('가로가 길면 좌우를 잘라낸다', () => {
    expect(coverCrop(300, 100)).toEqual({ sx: 100, sy: 0, size: 100 });
  });
  it('세로가 길면 위아래를 잘라낸다', () => {
    expect(coverCrop(100, 250)).toEqual({ sx: 0, sy: 75, size: 100 });
  });
  it('정사각은 그대로, 홀수 차이는 내림', () => {
    expect(coverCrop(96, 96)).toEqual({ sx: 0, sy: 0, size: 96 });
    expect(coverCrop(101, 100)).toEqual({ sx: 0, sy: 0, size: 100 });
  });
});

describe('encodeAvatar — R4 형식 선택', () => {
  it('WebP 를 0.82 로 먼저 시도하고 상한 안이면 그대로 쓴다', () => {
    const encode = vi.fn(encoderOf(() => 100));
    const result = encodeAvatar(encode);
    expect(result).toEqual({
      ok: true,
      dataUrl: expect.stringMatching(/^data:image\/webp;base64,/),
    });
    expect(encode).toHaveBeenCalledTimes(1);
    expect(encode).toHaveBeenCalledWith('image/webp', 0.82);
  });

  it('WebP 결과의 MIME 이 webp 가 아니면(미지원) JPEG 0.80 으로 다시 인코딩한다', () => {
    const encode = vi.fn<AvatarEncoder>((mime, quality) =>
      mime === 'image/webp' ? 'data:image/png;base64,AAAA' : `data:${mime};base64,${quality}`,
    );
    const result = encodeAvatar(encode);
    expect(result).toEqual({ ok: true, dataUrl: 'data:image/jpeg;base64,0.8' });
    expect(encode.mock.calls).toEqual([
      ['image/webp', 0.82],
      ['image/jpeg', 0.8],
    ]);
  });
});

describe('encodeAvatar — R6 품질 하강 루프', () => {
  it('상한을 넘으면 0.15 씩 내리고, 들어오는 순간 멈춘다', () => {
    // 0.52 에서 처음으로 상한 안에 들어온다.
    const encode = vi.fn(
      encoderOf((_mime, quality) => (quality <= 0.52 ? 10 : PROFILE_AVATAR_MAX_CHARS + 1)),
    );
    const result = encodeAvatar(encode);
    expect(result.ok).toBe(true);
    expect(encode.mock.calls.map(([, q]) => q)).toEqual([0.82, 0.67, 0.52]);
  });

  it('WebP 는 정확히 5회(0.82 → 0.67 → 0.52 → 0.37 → 0.22) 뒤 too-large — 0.07 은 시도하지 않는다', () => {
    const encode = vi.fn(encoderOf(() => PROFILE_AVATAR_MAX_CHARS + 1));
    expect(encodeAvatar(encode)).toEqual({ ok: false, reason: 'too-large' });
    expect(encode).toHaveBeenCalledTimes(MAX_ENCODE_ATTEMPTS);
    expect(encode.mock.calls.map(([, q]) => q)).toEqual([0.82, 0.67, 0.52, 0.37, 0.22]);
  });

  it('JPEG 폴백은 0.80 → 0.65 → 0.50 → 0.35 → 0.20 다섯 번(0.20 은 하한 이상이라 시도한다) 뒤 too-large', () => {
    const encode = vi.fn<AvatarEncoder>((mime) =>
      mime === 'image/webp'
        ? 'data:image/png;base64,AAAA'
        : `data:image/jpeg;base64,${'A'.repeat(PROFILE_AVATAR_MAX_CHARS + 1)}`,
    );
    expect(encodeAvatar(encode)).toEqual({ ok: false, reason: 'too-large' });
    const jpegQualities = encode.mock.calls.filter(([m]) => m === 'image/jpeg').map(([, q]) => q);
    expect(jpegQualities).toEqual([0.8, 0.65, 0.5, 0.35, 0.2]);
  });

  it('상한은 profile.rules 의 상수 하나다 — 정확히 16,384자는 통과, 16,385자는 하강', () => {
    const exact = vi.fn(
      encoderOf(() => PROFILE_AVATAR_MAX_CHARS - 'data:image/webp;base64,'.length),
    );
    expect(encodeAvatar(exact).ok).toBe(true);
    expect(exact).toHaveBeenCalledTimes(1);
    const over = vi.fn(
      encoderOf(() => PROFILE_AVATAR_MAX_CHARS - 'data:image/webp;base64,'.length + 1),
    );
    encodeAvatar(over);
    expect(over.mock.calls.length).toBeGreaterThan(1);
  });
});
