import { isInviteToken } from '@/domain/social/input';

export const INVITE_STORAGE_KEY = 'tasky.social.invite.v1';
const INVITE_LIFETIME = 24 * 60 * 60 * 1000;

/** 토큰은 로그인 왕복 뒤 확인 화면에만 제공한다. 만료와 손상은 즉시 지운다. */
export function pendingInviteToken(): string | null {
  try {
    const encoded = sessionStorage.getItem(INVITE_STORAGE_KEY);
    if (encoded === null) return null;
    const value: unknown = JSON.parse(encoded);
    if (
      typeof value !== 'object' ||
      value === null ||
      !('token' in value) ||
      !('savedAt' in value) ||
      !isInviteToken(value.token) ||
      typeof value.savedAt !== 'number' ||
      value.savedAt > Date.now() ||
      Date.now() - value.savedAt >= INVITE_LIFETIME
    ) {
      clearPendingInvite();
      return null;
    }
    return value.token;
  } catch {
    clearPendingInvite();
    return null;
  }
}

/** 사용·취소·로그아웃·계정 변경에서 로그인 왕복용 원문을 제거한다. */
export function clearPendingInvite(): void {
  try {
    sessionStorage.removeItem(INVITE_STORAGE_KEY);
  } catch {
    /* 저장이 차단된 탭에는 원문도 없다. */
  }
}
