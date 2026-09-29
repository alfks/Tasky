// 사진 파이프라인의 **순수 부분** (profile.md R4·R6) — 크롭 좌표와 품질 하강 루프. 인코더를 주입받아
// jsdom(캔버스 없음)에서 단위 테스트한다. 실변환(EXIF·캔버스·`toDataURL`)은 `avatar-image.ts` 와 e2e.
import { PROFILE_AVATAR_MAX_CHARS } from '@/domain/profile/profile.rules';

/** 결과 한 변 (R4). 표시는 40px 이지만 2배 화면에서 선명하도록 96 을 저장한다(R9). */
export const AVATAR_SIZE = 96;
export const WEBP_QUALITY = 0.82;
export const JPEG_QUALITY = 0.8;
/** R6: 상한을 넘으면 이만큼씩 내려 다시 인코딩한다. */
export const QUALITY_STEP = 0.15;
/** R6: 이 아래로 내려가야 하면 멈추고 오류. */
export const QUALITY_FLOOR = 0.2;
/** R6: 첫 인코딩을 포함해 최대 5회 시도(0.82 → 0.67 → 0.52 → 0.37 → 0.22). */
export const MAX_ENCODE_ATTEMPTS = 5;

export type AvatarMime = 'image/webp' | 'image/jpeg';

/**
 * `canvas.toDataURL(mime, quality)` 의 모양. 브라우저가 그 형식을 지원하지 않으면 **다른 MIME 의
 * 데이터 URL**(보통 `image/png`)을 돌려준다 — 그것이 R4 의 "WebP 미지원" 판정 신호다.
 */
export type AvatarEncoder = (mime: AvatarMime, quality: number) => string;

export type CoverCrop = { sx: number; sy: number; size: number };

/** 짧은 변 기준 정사각 가운데 크롭 (R4). 정수 좌표로 내린다 — 서브픽셀 크롭은 흐릿해진다. */
export function coverCrop(width: number, height: number): CoverCrop {
  const size = Math.max(1, Math.floor(Math.min(width, height)));
  return {
    sx: Math.floor((width - size) / 2),
    sy: Math.floor((height - size) / 2),
    size,
  };
}

export type EncodeResult = { ok: true; dataUrl: string } | { ok: false; reason: 'too-large' };

/** 부동소수 누적 오차(0.82 − 0.15×4 = 0.2199…)가 문턱 비교를 흔들지 않게 둘째 자리로 고정한다. */
function stepDown(quality: number): number {
  return Math.round((quality - QUALITY_STEP) * 100) / 100;
}

/**
 * WebP(0.82)로 먼저 인코딩하고, 결과 MIME 이 WebP 가 아니면 JPEG(0.80)로 다시 한다 (R4). 결과가
 * `maxChars` 를 넘으면 0.15 씩 내려 다시 인코딩하며(R6), 시도가 5회를 채우거나 품질이 0.20 아래로
 * 내려가야 하면 멈추고 `too-large` 다 — 무한 루프 없음(ADR-0023 규칙 5).
 */
export function encodeAvatar(
  encode: AvatarEncoder,
  maxChars: number = PROFILE_AVATAR_MAX_CHARS,
): EncodeResult {
  const probe = encode('image/webp', WEBP_QUALITY);
  const mime: AvatarMime = probe.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
  let quality = mime === 'image/webp' ? WEBP_QUALITY : JPEG_QUALITY;
  let dataUrl = mime === 'image/webp' ? probe : encode(mime, quality);

  for (let attempt = 1; ; attempt += 1) {
    if (dataUrl.length <= maxChars) return { ok: true, dataUrl };
    if (attempt >= MAX_ENCODE_ATTEMPTS) return { ok: false, reason: 'too-large' };
    quality = stepDown(quality);
    if (quality < QUALITY_FLOOR) return { ok: false, reason: 'too-large' };
    dataUrl = encode(mime, quality);
  }
}
