// 공개 진입은 작은 세션 경계만 포함한다. 화면·스토어는 후속 UI가 지연 로드한다.
export {
  activateSocialSession,
  attachSocialClient,
  captureSocialDispatch,
  configureSocialVerifier,
  deactivateSocialSession,
  invalidateSocialSession,
  isSocialSessionActive,
  onSocialInvalidation,
} from '@/features/social/session-lifecycle';
export type {
  SocialInvalidation,
  SocialSessionClient,
  SocialSessionScope,
} from '@/features/social/session-lifecycle';
export {
  clearPendingInvite,
  consumeInviteAfterReady,
  prepareInviteLogin,
} from '@/features/social/lib/invite-bootstrap';
export type { InviteBootstrap } from '@/features/social/lib/invite-bootstrap';
export { useSocialShell } from '@/features/social/hooks/useSocialShell';
