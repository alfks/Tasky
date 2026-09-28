import type { SocialRepository } from '@/repositories/social-repository';

export type FeedClock = {
  now: () => number;
  schedule: (run: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

/** 현재 페이지의 모든 ID를 검증한다. deadline 뒤 결과는 호출자가 폐기한다. */
export async function validatePage(
  repository: SocialRepository,
  ids: readonly string[],
  clock: FeedClock,
): Promise<ReadonlySet<string>> {
  let deadline: unknown;
  const expired = new Promise<never>((_, reject) => {
    deadline = clock.schedule(() => reject(new Error('검증 시간이 지났습니다.')), 5_000);
  });
  try {
    const response = await Promise.race([repository.validatePosts({ ids }), expired]);
    return new Set(response.data.allowedIds);
  } finally {
    if (deadline !== undefined) clock.clear(deadline);
  }
}
