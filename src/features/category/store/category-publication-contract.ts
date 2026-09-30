import type { Category } from '@/domain/category/category';
import type {
  SocialCategoryInput,
  SocialCategoryView,
  SocialErrorCode,
} from '@/domain/social/social';

import type { SocialRepository } from '@/repositories/social-repository';

import type { PublicationRecovery } from '@/features/category/store/category-publication-recovery';

export type PublicationDependencies = {
  repository: () => SocialRepository;
  capture: () => () => boolean;
  online: () => boolean;
  persist: (
    canonical: SocialCategoryView | null,
    original?: Category,
    allowed?: () => boolean,
  ) => Promise<boolean>;
  recovery?: PublicationRecovery;
  key?: () => string;
  onSessionFailure?: PublicationSessionFailure;
  subscribeReady?: (listener: () => void) => () => void;
  subscribeInvalidation?: (listener: (reason: string) => void) => () => void;
};
export type PublicationSessionFailure = (code: 'unauthorized' | 'account-deleted') => void;
class PublicationError extends Error {
  constructor(readonly code: SocialErrorCode) {
    super(code);
  }
}
export function publicationError(code: SocialErrorCode): Error & { code: SocialErrorCode } {
  return new PublicationError(code);
}
export function publicationErrorCode(error: unknown): SocialErrorCode {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
  switch (code) {
    case 'unauthorized':
    case 'account-deleted':
    case 'conflict':
    case 'request-pending':
    case 'request-expired':
    case 'idempotency-conflict':
    case 'social-disabled':
    case 'validation':
    case 'unavailable':
    case 'limit-reached':
    case 'rate-limited':
    case 'csrf':
      return code;
    default:
      return 'temporary';
  }
}

/** 읽을 수 있는 타인의 projection과 소유자 관리 projection을 구분한다. */
export async function readOwnedCategory(
  repository: SocialRepository,
  id: string,
  allowed: () => boolean,
) {
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < 20; page += 1) {
    const response = await repository.categories({ limit: 50, ...(cursor ? { cursor } : {}) });
    if (!allowed()) return undefined;
    const owned = response.data.items.find((item) => item.id === id);
    if (owned !== undefined) return owned;
    if (response.data.nextCursor === null) return null;
    if (seen.has(response.data.nextCursor)) throw publicationError('temporary');
    seen.add(response.data.nextCursor);
    cursor = response.data.nextCursor;
  }
  throw publicationError('temporary');
}
export function samePublicationIntent(
  left: Pick<SocialCategoryInput, 'visibility' | 'name' | 'color' | 'emoji'>,
  right: Pick<SocialCategoryInput, 'visibility' | 'name' | 'color' | 'emoji'>,
): boolean {
  return (
    left.visibility === right.visibility &&
    left.name === right.name &&
    left.color === right.color &&
    left.emoji === right.emoji
  );
}

export function publicationOriginMatches(local: Category | undefined, original: Category): boolean {
  return (
    local !== undefined &&
    local.deletedAt === undefined &&
    local.socialCategoryId === original.socialCategoryId &&
    local.socialCategoryVersion === original.socialCategoryVersion &&
    local.visibility === original.visibility &&
    local.name === original.name &&
    local.color === original.color &&
    local.emoji === original.emoji
  );
}

/** 늦은 오류가 새 계정의 세션을 무효화하지 않도록 관측 승인부터 확인한다. */
export function reportPublicationError(
  error: unknown,
  allowed: () => boolean,
  notify?: PublicationSessionFailure,
): SocialErrorCode {
  const code = publicationErrorCode(error);
  if (allowed() && (code === 'unauthorized' || code === 'account-deleted')) notify?.(code);
  return code;
}

/** 성공한 자기 연결 표식 쓰기만 다음 개인 CAS 기준으로 반영한다. */
export function publicationOriginAfterConfirmation(
  original: Category,
  canonical: SocialCategoryView | null,
): Category {
  const { socialCategoryId: _id, socialCategoryVersion: _version, ...rest } = original;
  return canonical === null
    ? { ...rest, visibility: 'private' }
    : {
        ...rest,
        visibility: canonical.visibility,
        socialCategoryId: canonical.id,
        socialCategoryVersion: canonical.version,
      };
}
