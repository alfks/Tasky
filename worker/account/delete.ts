// `POST /api/account/delete` — 계정 삭제(docs/specs/sync.md §6, ADR-0019).
//
// **네 문장(`deleted_users` INSERT · `entities` DELETE · `devices` DELETE · `users` DELETE)을 한
// `db.batch()` 로 묶는다 — D1 의 `batch()` 는 단일 트랜잭션이다.** 예전엔 이 넷이 각각 독립
// `await` 라 중간에 하나가 실패하면(네트워크 끊김·D1 일시 오류) 부분 삭제 상태로 남았고, 그 사용자가
// 같은 구글 계정으로 재로그인하면 지워지다 만 `entities`/`devices` 행이 그대로 "부활"했다. 배치로
// 묶으면 넷 다 적용되거나 전부 롤백되므로 그 사고가 구조적으로 불가능해진다.
//
// 배치가 곧 트랜잭션이라 **문장 순서가 더는 "다른 기기가 중간 상태를 볼 수 있는가"를 좌우하지
// 않는다** — 트랜잭션 격리가 그 몫을 대신한다(예전 주석의 "1) deleted_users 를 먼저 적어야 중간에
// 다른 기기가 놓치지 않는다"는 이유는 더 이상 성립하지 않는다, 원자성이 순서 보장을 대체했다).
//
// **`sessions` 는 이 배치에 넣지 않는다** — 요청을 보낸 기기 자신의 세션(`sid`)만 따로 지운다.
// 다른 기기의 세션 행은 그대로 남아, 다음 요청에서 `session.ts` 가 sub → deleted_users 조회로
// 410 을 돌려주며 **그 자리에서** 그 세션 행을 지운다(지연 정리). 계정 삭제 시점에 모든 세션을
// 한꺼번에 지우면 다른 기기는 sub 조차 알아낼 수 없는 평범한 401 만 받아 "삭제됨" 을 구분할 방법이
// 사라진다 — 이건 여전히 ADR-0019 의 핵심 결정이다. (재가입 시점의 세션 폐기는 `auth/handlers.ts
// #handleCallback` 몫 — 삭제 창 동안 요청을 한 번도 안 보낸 세션이 재가입으로 되살아나는 것은
// 거기서 막는다.)
import { clearSessionCookie } from '../auth/cookies';
import { destroySession } from '../auth/session';

import type { Env } from '../env';

export async function handleAccountDelete(
  env: Env,
  sub: string,
  sid: string,
  now: string,
): Promise<Response> {
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO deleted_users (sub, deleted_at) VALUES (?, ?) ON CONFLICT(sub) DO UPDATE SET deleted_at = excluded.deleted_at',
    ).bind(sub, now),
    env.DB.prepare('DELETE FROM entities WHERE sub = ?').bind(sub),
    env.DB.prepare('DELETE FROM devices WHERE sub = ?').bind(sub),
    env.DB.prepare('DELETE FROM users WHERE sub = ?').bind(sub),
  ]);
  await destroySession(env, sid);
  return new Response(null, { status: 204, headers: { 'Set-Cookie': clearSessionCookie() } });
}
