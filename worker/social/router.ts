import { requireSession, type SessionOk } from '../auth/session';
import type { SocialErrorCode } from '@/domain/social/social';
import type { Env } from '../env';
import {
  actorFailure,
  createSocialActor,
  currentAccount,
  currentProfile,
  type SocialActor,
} from './actor';
import { socialError, socialJson, readSocialBody, validOrigin, type Handled } from './http';
import { handleInvite } from './invite-handler';
import { limitSubject, reserveLimit } from './limits';
import { effectiveSocialMode, routeAllowed, socialRoute, type Route } from './policy';
import { handleProfile } from './profile-handler';
import { readSocialList } from './reads';
import { handleRelation } from './relation-handler';

async function spend(actor: SocialActor, env: Env, route: Route): Promise<null | SocialErrorCode> {
  const subject = await limitSubject(actor, env.SESSION_SECRET, route.subject);
  if (subject === null) return actorFailure(actor);
  if (await reserveLimit(actor, subject, route.bucket)) return null;
  if (!(await currentAccount(actor))) return actorFailure(actor);
  if (route.subject === 'profile' && !(await currentProfile(actor))) return actorFailure(actor);
  return 'rate-limited';
}

async function dispatch(
  actor: SocialActor,
  env: Env,
  route: Route,
  url: URL,
  body: unknown,
  key: string | null,
  mode: 'off' | 'read-only' | 'enabled',
): Promise<Handled> {
  if (route.method === 'GET' && route.path !== '/api/social/me') {
    const result = await readSocialList(actor, route.path, url, env.SESSION_SECRET);
    return result.ok ? { ok: true, value: { data: result.value } } : result;
  }
  if (route.path === '/api/social/me' || route.path.startsWith('/api/social/profile'))
    return handleProfile(actor, route.path, body, key, mode);
  if (route.path.startsWith('/api/social/invites'))
    return handleInvite(actor, route.path, body, key, env.SESSION_SECRET);
  return handleRelation(actor, route.path, body, key);
}

export async function handleSocialRequest(
  request: Request,
  env: Env,
  now: string,
): Promise<Response> {
  const nowMs = new Date(now).getTime();
  const url = new URL(request.url);
  const route = socialRoute(request.method, url.pathname);
  if (!route) return socialError('unavailable', nowMs);
  if (route.method === 'POST' && !validOrigin(request)) return socialError('csrf', nowMs);
  let verified: SessionOk | undefined;
  try {
    const session = await requireSession(request, env, now);
    if (!session.ok)
      return socialError(session.status === 410 ? 'account-deleted' : 'unauthorized', nowMs);
    verified = session;
    return await handleAuthenticated(request, env, nowMs, url, route, session);
  } catch {
    return socialError('temporary', nowMs, verified);
  }
}

async function handleAuthenticated(
  request: Request,
  env: Env,
  nowMs: number,
  url: URL,
  route: Route,
  session: SessionOk,
): Promise<Response> {
  const mode = effectiveSocialMode(env, session.sub);
  if (!routeAllowed(mode, route.minMode)) return socialError('social-disabled', nowMs, session);
  const actor = await createSocialActor(env.DB, session, nowMs);
  let body: unknown = undefined;
  if (route.method === 'POST') {
    const parsed = await readSocialBody(request);
    if (!parsed.ok) {
      const admission = await spend(actor, env, route);
      return admission
        ? socialError(admission, nowMs, session)
        : socialError('validation', nowMs, session, parsed.status);
    }
    body = parsed.body;
  }
  if (!route.primitiveAdmission) {
    const admission = await spend(actor, env, route);
    if (admission) return socialError(admission, nowMs, session);
  }
  const outcome = await dispatch(
    actor,
    env,
    route,
    url,
    body,
    request.headers.get('Idempotency-Key'),
    mode,
  );
  if (!outcome.ok)
    return socialError(
      outcome.code,
      nowMs,
      session,
      route.method === 'GET' && outcome.code === 'validation' ? 400 : undefined,
    );
  return socialJson(outcome.value.data, nowMs, outcome.value.status, session);
}
