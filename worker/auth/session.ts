// 세션 발급·검증(SYNC_DESIGN.md §②-4). `sessions` 테이블 조회는 **여기서만** 한다 — `worker/db/**`
// 밖에 두는 이유는 이 조회가 구조적으로 `sub` 없이 시작하기 때문이다(`sid` → `sub` 를 알아내는
// 바로 그 조회): `check-worker-sql.sh`(worker/db/** 전용, sub=? 강제)의 예외로 다루지 않고 애초에
// 그 대상 밖에 두는 편이 "sub 없이 시작하는 조회가 존재한다" 는 사실을 더 정직하게 드러낸다.
//
// **삭제된 계정 판정(ADR-0019)**: 세션 조회가 성공했는데 그 `sub` 가 `deleted_users` 에 있으면,
// 평범한 401 이 아니라 **410 + `reason: 'account-deleted'`** 를 돌려주고 그 자리에서 이 세션 행을
// 지운다(지연 정리) — 그래야 계정을 삭제한 기기가 아닌 **다른** 기기가 다음 요청에서 "왜 로그아웃
// 됐는지" 를 구분해 안내 다이얼로그를 띄울 수 있다(계정 삭제 시점에는 다른 기기의 세션 행을 건드리지
// 않는다, worker/account/delete.ts).
import { parseCookies, SESSION_COOKIE } from './cookies';
import { randomToken, signValue, verifySignedValue } from './hmac';

import type { Env } from '../env';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일(sync.md §8)
const SLIDING_REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 만료 7일 미만이면 갱신

export type SessionOk = {
  ok: true;
  sub: string;
  sid: string;
  expiresAt: string;
  refreshedCookie?: string;
};
export type SessionFail =
  { ok: false; status: 401 } | { ok: false; status: 410; reason: 'account-deleted' };
export type SessionResult = SessionOk | SessionFail;

function addMs(iso: string, ms: number): string {
  return new Date(new Date(iso).getTime() + ms).toISOString();
}

/** 로그인 성공 시 세션 행을 만들고 `Set-Cookie` 값을 돌려준다. */
export async function createSession(
  env: Env,
  sub: string,
  now: string,
): Promise<{ signedSid: string }> {
  const sid = randomToken();
  const expiresAt = addMs(now, SESSION_TTL_MS);
  await env.DB.prepare(
    'INSERT INTO sessions (sid, sub, created_at, expires_at) VALUES (?, ?, ?, ?)',
  )
    .bind(sid, sub, now, expiresAt)
    .run();
  const signed = await signValue(sid, env.SESSION_SECRET);
  return { signedSid: signed };
}

/** 요청의 세션 쿠키를 검증하고 `sub` 를 돌려준다. 슬라이딩 갱신이 일어나면 `refreshedCookie` 를 함께 준다. */
export async function requireSession(
  request: Request,
  env: Env,
  now: string,
): Promise<SessionResult> {
  const cookies = parseCookies(request.headers.get('Cookie'));
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return { ok: false, status: 401 };
  // 서명 검증이 D1 조회보다 먼저 — 위조 쿠키로 D1 을 두드리지 않는다.
  const sid = await verifySignedValue(raw, env.SESSION_SECRET);
  if (!sid) return { ok: false, status: 401 };

  const row = await env.DB.prepare('SELECT sub, expires_at FROM sessions WHERE sid = ?')
    .bind(sid)
    .first<{ sub: string; expires_at: string }>();
  if (!row) return { ok: false, status: 401 };
  if (row.expires_at <= now) {
    await env.DB.prepare('DELETE FROM sessions WHERE sid = ?').bind(sid).run();
    return { ok: false, status: 401 };
  }

  const deleted = await env.DB.prepare('SELECT 1 FROM deleted_users WHERE sub = ?')
    .bind(row.sub)
    .first();
  if (deleted) {
    await env.DB.prepare('DELETE FROM sessions WHERE sid = ?').bind(sid).run();
    return { ok: false, status: 410, reason: 'account-deleted' };
  }

  let refreshedCookie: string | undefined;
  let expiresAt = row.expires_at;
  if (new Date(row.expires_at).getTime() - new Date(now).getTime() < SLIDING_REFRESH_THRESHOLD_MS) {
    expiresAt = addMs(now, SESSION_TTL_MS);
    await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE sid = ?')
      .bind(expiresAt, sid)
      .run();
    refreshedCookie = await signValue(sid, env.SESSION_SECRET);
  }

  return { ok: true, sub: row.sub, sid, expiresAt, refreshedCookie };
}

/** 로그아웃 — 자기 `sid` 행만 지운다(다른 기기 유지). */
export async function destroySession(env: Env, sid: string): Promise<void> {
  await env.DB.prepare('DELETE FROM sessions WHERE sid = ?').bind(sid).run();
}
