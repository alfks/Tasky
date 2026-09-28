import { describe, expect, it } from 'vitest';

import { SOCIAL_ROUTES, effectiveSocialMode, routeAllowed, socialRoute } from './policy';

import type { Env } from '../env';

const env = (mode: string | undefined, allowlist: string | undefined) =>
  ({ SOCIAL_MODE: mode, SOCIAL_ALLOWLIST: allowlist }) as Env;

describe('social fail-closed policy', () => {
  it('정확한 22경로와 mode 우선순위를 고정한다', () => {
    expect(SOCIAL_ROUTES).toHaveLength(22);
    expect(new Set(SOCIAL_ROUTES.map((route) => `${route.method} ${route.path}`)).size).toBe(22);
    expect(socialRoute('DELETE', '/api/social/me')).toBeNull();
    expect(socialRoute('GET', '/api/social/invites/preview')).toBeNull();
    for (const route of SOCIAL_ROUTES) {
      expect(routeAllowed('off', route.minMode)).toBe(route.minMode === 'off');
      expect(routeAllowed('enabled', route.minMode)).toBe(true);
      expect(routeAllowed('read-only', route.minMode)).toBe(route.minMode !== 'enabled');
    }
    expect(socialRoute('POST', '/api/social/requests/accept')?.minMode).toBe('enabled');
    expect(socialRoute('POST', '/api/social/invites/preview')?.minMode).toBe('read-only');
    expect(socialRoute('POST', '/api/social/invites/revoke')?.minMode).toBe('off');
    expect(socialRoute('GET', '/api/social/feed')?.minMode).toBe('read-only');
    expect(socialRoute('GET', '/api/social/posts/mine')?.minMode).toBe('off');
    expect(socialRoute('POST', '/api/social/reactions/set')?.bucket).toBe('write');
  });

  it('누락·잘못된 설정, wildcard, 이메일을 off로 닫는다', () => {
    for (const settings of [
      env(undefined, undefined),
      env('bad', '["a"]'),
      env('enabled', undefined),
      env('enabled', '[]'),
      env('enabled', '["*"]'),
      env('enabled', '["a@example.com"]'),
      env('enabled', '{"a":true}'),
    ]) {
      expect(effectiveSocialMode(settings, 'a')).toBe('off');
    }
    expect(effectiveSocialMode(env('read-only', '["a"]'), 'a')).toBe('read-only');
    expect(effectiveSocialMode(env('enabled', '["a"]'), 'b')).toBe('off');
  });
});
