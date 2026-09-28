import type { PostView, SocialErrorCode } from '@/domain/social/social';

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
