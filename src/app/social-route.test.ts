import { describe, expect, it } from 'vitest';

import { isPublicRoute } from '@/app/social-route';

describe('공개 진입 경계', () => {
  it('정확한 공개 경로만 개인 인증 게이트를 건너뛴다', () => {
    expect(isPublicRoute('/public')).toBe(true);
    expect(isPublicRoute('/public/')).toBe(true);
    for (const path of ['/', '/public/private', '/api/social/public/feed', '/publicity'])
      expect(isPublicRoute(path)).toBe(false);
  });
});
