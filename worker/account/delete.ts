// POST /api/account/delete: social + personal 삭제는 deletion.ts의 단일 nonce latch 배치.
// 성공 뒤 현재 sid만 폐기한다. 다른 기기는 다음 요청에서 marker를 보고 410 지연 정리된다.
import { clearSessionCookie } from '../auth/cookies';
import { destroySession, type SessionOk } from '../auth/session';
import { actorFailure, createSocialActor } from '../social/actor';
import { deleteAccountProjection } from '../social/deletion';

import type { Env } from '../env';

export async function handleAccountDelete(
  env: Env,
  session: SessionOk,
  now: string,
): Promise<Response> {
  const nowMs = new Date(now).getTime();
  const applied = await deleteAccountProjection(env.DB, session, env.SESSION_SECRET, nowMs);
  if (!applied) {
    const code = await actorFailure(await createSocialActor(env.DB, session, nowMs));
    return new Response(JSON.stringify({ error: code }), {
      status: code === 'account-deleted' ? 410 : 401,
      headers: {
        'Content-Type': 'application/json',
        ...(code === 'account-deleted' ? { 'Set-Cookie': clearSessionCookie() } : {}),
      },
    });
  }
  await destroySession(env, session.sid);
  return new Response(null, { status: 204, headers: { 'Set-Cookie': clearSessionCookie() } });
}
