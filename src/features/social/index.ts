// 공개 진입은 작은 세션 경계만 포함한다. 화면·스토어는 후속 UI가 지연 로드한다.
export {
  acquireSocialSession,
  activateSocialSession,
  attachSocialClient,
  captureSocialDispatch,
  configureSocialVerifier,
  deactivateSocialSession,
  invalidateSocialSession,
  isSocialSessionActive,
  onSocialInvalidation,
  onSocialReady,
  recheckSocialSession,
} from '@/features/social/session-lifecycle';
export type {
  SocialInvalidation,
  SocialSessionClient,
  SocialSessionScope,
} from '@/features/social/session-lifecycle';

/** 친구 화면을 연 순간에만 온라인 UI를 읽는다. */
export function loadSocialScreen() {
  return import('@/features/social/components/SocialScreen');
}
/** 공개 경로에서만 익명 읽기 화면을 읽는다. */
export function loadPublicScreen() {
  return import('@/features/social/components/PublicScreen');
}
export type {
  CompletedSocialChoice,
  SocialScreenProps,
} from '@/features/social/components/SocialScreen';
