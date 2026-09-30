import type { PostView, ProfileView, SocialErrorCode, SocialMode } from '@/domain/social/social';

export type FeedView = 'friends' | 'public' | 'mine';
export type FeedSnapshot = {
  phase: 'blocked' | 'loading' | 'ready' | 'error';
  view: FeedView;
  mode: SocialMode | null;
  profile: ProfileView | null;
  items: readonly PostView[];
  canShow: boolean;
  cursorStack: readonly (string | null)[];
  pageIndex: number;
  nextCursor: string | null;
  firstHeadId: string | null;
  hasNew: boolean;
  leaseUntil: number;
  error: SocialErrorCode | null;
};
export function uniquePosts(items: readonly PostView[]): PostView[] {
  const seen = new Set<string>();
  return items.filter((post) => {
    if (seen.has(post.id)) return false;
    seen.add(post.id);
    return true;
  });
}

const ERROR_CODES: readonly SocialErrorCode[] = [
  'unauthorized',
  'account-deleted',
  'csrf',
  'unavailable',
  'conflict',
  'request-pending',
  'idempotency-conflict',
  'request-expired',
  'validation',
  'limit-reached',
  'rate-limited',
  'social-disabled',
  'temporary',
];

export function socialErrorCode(value: unknown): SocialErrorCode {
  if (typeof value === 'object' && value !== null && 'code' in value) {
    const code = value.code;
    if (typeof code === 'string' && ERROR_CODES.includes(code as SocialErrorCode)) {
      return code as SocialErrorCode;
    }
  }
  return 'temporary';
}
