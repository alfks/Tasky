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
].map(([method, path, minMode, bucket, subject, primitiveAdmission]) => ({
  method,
  path: `/api/social${path}`,
  minMode,
  bucket,
  subject,
  primitiveAdmission,
})) as Route[];

export function socialRoute(method: string, path: string): Route | null {
  return routes.find((route) => route.method === method && route.path === path) ?? null;
}

export function effectiveSocialMode(env: Env, sub: string): SocialMode {
  if (env.SOCIAL_MODE !== 'enabled' && env.SOCIAL_MODE !== 'read-only') return 'off';
  try {
    const parsed: unknown = JSON.parse(env.SOCIAL_ALLOWLIST ?? '');
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      !parsed.every(
        (item) =>
          typeof item === 'string' && item.length > 0 && item !== '*' && !item.includes('@'),
      )
    )
      return 'off';
    return parsed.includes(sub) ? env.SOCIAL_MODE : 'off';
  } catch {
    return 'off';
  }
}

export function routeAllowed(mode: SocialMode, required: SocialMode): boolean {
  return (
    required === 'off' || mode === 'enabled' || (required === 'read-only' && mode === 'read-only')
  );
}

export const SOCIAL_ROUTES = routes;
