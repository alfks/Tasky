// `POST /api/account/delete` — 계정 삭제(docs/specs/sync.md §6, ADR-0019).
//
// **순서가 정확성의 전부다**:
// 1) `deleted_users` 에 먼저 적는다 — 그래야 이 문장 이후 어느 시점에 다른 기기가 세션 조회를
//    하더라도(session.ts#requireSession) "삭제됨" 을 놓치지 않는다(기록이 삭제 자체보다 먼저 존재).
// 2) `entities`·`devices` 를 명시 DELETE 한다(worker/db/entities.ts#deleteAllForUser — `PRAGMA
//    foreign_keys` 가 꺼져 있어도 결과가 같도록 CASCADE 에 기대지 않는다, ADR-0019).
// 3) `users` 행을 지운다. **`sessions` 는 여기서 지우지 않는다** — 요청을 보낸 기기 자신의 세션
//    (`sid`)만 지운다. 다른 기기의 세션 행은 그대로 남아, 다음 요청에서 `session.ts` 가 sub →
//    deleted_users 조회로 410 을 돌려주며 **그 자리에서** 그 세션 행을 지운다(지연 정리). 계정
//    삭제 시점에 모든 세션을 한꺼번에 지우면 다른 기기는 sub 조차 알아낼 수 없는 평범한 401 만
//    받아 "삭제됨" 을 구분할 방법이 사라진다 — 이 순서 자체가 ADR-0019 의 핵심 결정이다.
import { clearSessionCookie } from '../auth/cookies';
import { destroySession } from '../auth/session';
import { deleteAllForUser } from '../db/entities';

import type { Env } from '../env';

export async function handleAccountDelete(
  env: Env,
  sub: string,
  sid: string,
  now: string,
): Promise<Response> {
  await env.DB.prepare(
    'INSERT INTO deleted_users (sub, deleted_at) VALUES (?, ?) ON CONFLICT(sub) DO UPDATE SET deleted_at = excluded.deleted_at',
  )
    .bind(sub, now)
    .run();
  await deleteAllForUser(env.DB, sub);
  await env.DB.prepare('DELETE FROM users WHERE sub = ?').bind(sub).run();
  await destroySession(env, sid);
  return new Response(null, { status: 204, headers: { 'Set-Cookie': clearSessionCookie() } });
}
