// 사진 파이프라인의 **브라우저 부분** (profile.md R3~R6) — 파일 검사 → 디코드(EXIF 방향 반영, 애니메이션은
// 첫 프레임) → 흰 배경 위 정사각 크롭 → 96px 캔버스 → `encodeAvatar`(순수 루프). 지연 청크 안에서만
// 쓴다(편집 대화상자). 오류는 코드로 돌려주고 문구 표는 아래 `AVATAR_ERROR_MESSAGES` 하나다.
import { AVATAR_SIZE, coverCrop, encodeAvatar } from '@/features/profile/lib/avatar-encode';

/** 원본 파일 상한 (R3). 문구는 "10MB 이하 이미지만" — backup R9 의 "20MB 이하" 와 같은 집 스타일. */
export const AVATAR_MAX_FILE_BYTES = 10 * 1024 * 1024;

export type AvatarError = 'not-image' | 'too-big' | 'decode' | 'too-large';

/** §2 문구 그대로. HEIC 처럼 브라우저가 못 여는 형식은 `decode` 로 떨어진다. */
export const AVATAR_ERROR_MESSAGES: Record<AvatarError, string> = {
  'not-image': '이미지 파일만 올릴 수 있어요',
  'too-big': '10MB 이하 이미지만 올릴 수 있어요',
  decode: '사진을 읽지 못했어요. 다른 사진을 골라 주세요',
  'too-large': '사진을 줄이지 못했어요. 다른 사진을 골라 주세요',
};

export type AvatarResult = { ok: true; dataUrl: string } | { ok: false; error: AvatarError };

/**
 * 파일 하나 → 저장 가능한 데이터 URL. 던지지 않는다 — 실패는 전부 `AvatarError` 로 돌아온다.
 * `createImageBitmap` 이 EXIF 회전을 적용하고(`imageOrientation: 'from-image'` — 사용자가 보는 방향,
 * R3) 애니메이션은 첫 프레임만 준다. 브라우저가 못 여는 형식(HEIC 등)은 여기서 던져 `decode` 가 된다.
 */
export async function readAvatarFile(file: File): Promise<AvatarResult> {
  // 확장자를 모르는 파일에 `type === ''` 을 주는 OS/선택기가 있다 — 그 경우는 디코드까지 가 보고 판정한다.
  if (file.type !== '' && !file.type.startsWith('image/')) return { ok: false, error: 'not-image' };
  if (file.size > AVATAR_MAX_FILE_BYTES) return { ok: false, error: 'too-big' };

  let decoded: ImageBitmap;
  try {
    decoded = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return { ok: false, error: 'decode' };
  }

  try {
    if (decoded.width === 0 || decoded.height === 0) return { ok: false, error: 'decode' };
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return { ok: false, error: 'decode' };
    // 투명 영역은 흰색으로 — JPEG 폴백에서 검게 변하지 않게 (R3).
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    ctx.imageSmoothingQuality = 'high';
    const crop = coverCrop(decoded.width, decoded.height);
    ctx.drawImage(decoded, crop.sx, crop.sy, crop.size, crop.size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    const result = encodeAvatar((mime, quality) => canvas.toDataURL(mime, quality));
    return result.ok ? { ok: true, dataUrl: result.dataUrl } : { ok: false, error: result.reason };
  } catch {
    return { ok: false, error: 'decode' };
  } finally {
    decoded.close();
  }
}
