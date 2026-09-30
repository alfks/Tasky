import type { SocialMode } from '@/domain/social/social';

import type { Env } from '../env';
import type { LimitBucket } from './limits';

export type Route = {
  method: 'GET' | 'POST';
  path: string;
  minMode: SocialMode;
  bucket: LimitBucket;
  subject: 'pre' | 'profile';
  primitiveAdmission: boolean;
};

const routes: readonly Route[] = [
  ['GET', '/me', 'off', 'read', 'pre', false],
  ['POST', '/profile', 'enabled', 'write', 'pre', false],
  ['POST', '/profile/name', 'enabled', 'write', 'profile', true],
  ['GET', '/friends', 'off', 'read', 'profile', false],
  ['GET', '/requests', 'off', 'read', 'profile', false],
  ['POST', '/invites', 'enabled', 'write', 'profile', true],
  ['GET', '/invites', 'off', 'read', 'profile', false],
  ['POST', '/invites/revoke', 'off', 'revoke', 'profile', true],
  ['POST', '/invites/preview', 'read-only', 'preview', 'pre', true],
  ['POST', '/requests', 'enabled', 'write', 'profile', true],
  ['POST', '/requests/accept', 'enabled', 'write', 'profile', true],
  ['POST', '/requests/decline', 'off', 'revoke', 'profile', true],
  ['POST', '/requests/cancel', 'off', 'revoke', 'profile', true],
  ['POST', '/friends/remove', 'off', 'revoke', 'profile', true],
  ['GET', '/blocks', 'off', 'read', 'profile', false],
  ['POST', '/blocks/set', 'off', 'revoke', 'profile', true],
  ['GET', '/categories/mine', 'off', 'read', 'profile', false],
  ['POST', '/categories', 'off', 'write', 'profile', true],
  ['POST', '/categories/revoke', 'off', 'revoke', 'profile', true],
  ['GET', '/feed', 'read-only', 'read', 'profile', false],
  ['POST', '/posts/validate', 'off', 'read', 'profile', false],
  ['GET', '/posts/mine', 'off', 'read', 'profile', false],
  ['POST', '/posts', 'enabled', 'write', 'profile', true],
  ['POST', '/posts/delete', 'off', 'revoke', 'profile', true],
  // Transport failures use write; a parsed active:false switches to revoke in the primitive.
  ['POST', '/reactions/set', 'off', 'write', 'profile', true],
].map(([method, path, minMode, bucket, subject, primitiveAdmission]) => ({
  method,
  path: `/api/social${path}`,
  minMode,
  bucket,
  subject,
  primitiveAdmission,
})) as Route[];

export function socialRoute(method: string, path: string): Route | null {
  const exact = routes.find((route) => route.method === method && route.path === path);
  if (exact) return exact;
  if (method === 'GET' && /^\/api\/social\/categories\/[0-9a-f]{32}$/u.test(path))
    return {
      method: 'GET',
      path,
      minMode: 'off',
      bucket: 'read',
      subject: 'profile',
      primitiveAdmission: false,
    };
  return null;
}

/** Malformed or absent trusted configuration never exposes publication authors. */
export function socialPolicySubs(env: Env): readonly string[] {
  try {
    const value: unknown = JSON.parse(env.SOCIAL_ALLOWLIST ?? '');
    return Array.isArray(value) &&
      value.length > 0 &&
      value.every(
        (item) =>
          typeof item === 'string' && item.length > 0 && item !== '*' && !item.includes('@'),
      )
      ? value
      : [];
  } catch {
    return [];
  }
}

export function publicSocialMode(env: Env): SocialMode {
  return (env.SOCIAL_MODE === 'enabled' || env.SOCIAL_MODE === 'read-only') &&
    socialPolicySubs(env).length > 0
    ? env.SOCIAL_MODE
    : 'off';
}

export function effectiveSocialMode(env: Env, sub: string): SocialMode {
  return socialPolicySubs(env).includes(sub) ? publicSocialMode(env) : 'off';
}

export function routeAllowed(mode: SocialMode, required: SocialMode): boolean {
  return (
    required === 'off' || mode === 'enabled' || (required === 'read-only' && mode === 'read-only')
  );
}

export const SOCIAL_ROUTES = routes;
