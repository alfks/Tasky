import { parsePostIdsInput } from '@/domain/social/command-input';
import { isSocialId } from '@/domain/social/input';

import { actorFailure, createSocialActor, currentAccount } from './actor';
import { socialError, socialJson } from './http';
import { limitSubject, reserveLimit } from './limits';
import { effectiveSocialMode, publicSocialMode, socialPolicySubs } from './policy';
import { readPublicCategories, readPublicFeed } from './public-feed-read';
import { readPublicPost, validatePublicPosts, type PublicContext } from './public-read';
import { SESSION_COOKIE } from '../auth/cookies';
import { requireSession, type SessionOk } from '../auth/session';

import type { Env } from '../env';

function route(path: string): boolean {
  return (
    [
      '/api/social/public/categories',
      '/api/social/public/feed',
      '/api/social/public/posts/validate',
    ].includes(path) || /^\/api\/social\/public\/posts\/[0-9a-f]{32}$/u.test(path)
  );
}

/** Cookie presence is distinct from anonymous access: invalid credentials never fall back. */
function hasSessionCookie(request: Request): boolean {
  return (request.headers.get('Cookie') ?? '')
    .split(';')
    .some((part) => part.trim().split('=')[0] === SESSION_COOKIE);
}

async function dispatch(context: PublicContext, url: URL, secret: string) {
  if (url.pathname === '/api/social/public/categories')
    return readPublicCategories(context, url, secret);
  if (url.pathname === '/api/social/public/feed') return readPublicFeed(context, url, secret);
  if (url.pathname === '/api/social/public/posts/validate') {
    const keys = [...url.searchParams.keys()];
    if (keys.length !== 1 || keys[0] !== 'ids')
      return { ok: false as const, code: 'validation' as const };
    const parsed = parsePostIdsInput({ ids: (url.searchParams.get('ids') ?? '').split(',') });
    return parsed.ok ? validatePublicPosts(context, parsed.value.ids) : parsed;
  }
  if (url.searchParams.size !== 0) return { ok: false as const, code: 'validation' as const };
  const id = url.pathname.slice('/api/social/public/posts/'.length);
  return isSocialId(id)
    ? readPublicPost(context, id)
    : { ok: false as const, code: 'unavailable' as const };
}

/** Anonymous reads gather no visitor identity; trusted edge/global admission is an activation gate. */
export async function handlePublicRequest(
  request: Request,
  env: Env,
  now: string,
): Promise<Response> {
  const nowMs = new Date(now).getTime();
  const url = new URL(request.url);
  if (request.method !== 'GET' || !route(url.pathname)) return socialError('unavailable', nowMs);
  let verified: SessionOk | undefined;
  try {
    let actor = null;
    if (hasSessionCookie(request)) {
      const session = await requireSession(request, env, now);
      if (!session.ok)
        return socialError(session.status === 410 ? 'account-deleted' : 'unauthorized', nowMs);
      verified = session;
      if (effectiveSocialMode(env, session.sub) === 'off')
        return socialError('social-disabled', nowMs, session);
      actor = await createSocialActor(env.DB, session, nowMs, socialPolicySubs(env));
      const subject = await limitSubject(actor, env.SESSION_SECRET, 'pre');
      if (!subject || !(await reserveLimit(actor, subject, 'read')))
        return socialError(
          (await currentAccount(actor)) ? 'rate-limited' : await actorFailure(actor),
          nowMs,
          session,
        );
    }
    if (publicSocialMode(env) === 'off') return socialError('social-disabled', nowMs, verified);
    const context: PublicContext = { db: env.DB, actor, policySubs: socialPolicySubs(env), nowMs };
    const result = await dispatch(context, url, env.SESSION_SECRET);
    if (actor && !(await currentAccount(actor)))
      return socialError(await actorFailure(actor), nowMs, verified);
    return result.ok
      ? socialJson(result.value, nowMs, 200, verified)
      : socialError(result.code, nowMs, verified, result.code === 'validation' ? 400 : undefined);
  } catch {
    return socialError(
      hasSessionCookie(request) && !verified ? 'unauthorized' : 'temporary',
      nowMs,
      verified,
    );
  }
}
