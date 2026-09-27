import type { SocialMode } from '@/domain/social/social';

export type SocialOperation =
  | 'create'
  | 'rename-profile'
  | 'preview-invite'
  | 'read-shared'
  | 'read-own'
  | 'withdraw'
  | 'delete-account';

/** mode는 서버에서 매 요청 확인한다. 시범 allowlist는 별도 서버 actor 검사다. */
export function modeAllows(mode: SocialMode, operation: SocialOperation): boolean {
  if (operation === 'read-own' || operation === 'withdraw' || operation === 'delete-account') {
    return true;
  }
  if (mode === 'off') return false;
  if (operation === 'create' || operation === 'rename-profile') return mode === 'enabled';
  return true;
}
