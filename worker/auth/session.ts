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

/**
 * 로그인(구글 콜백 `handlers.ts#handleCallback`·로컬 스텁 `stub.ts#handleStubLogin` 공통,
 * ADR-0020) — 조건부 세션 전량 폐기 → 만료 세션 청소 → `deleted_users` 표식 삭제 → `users`
 * upsert 를 한 `db.batch()`(D1 단일 트랜잭션, `worker/account/delete.ts` 선례)로 묶은 뒤 새 세션을
 * 발급한다. **`sessions` 를 `sub` 단위로 지우는 문장은 이 함수와 (있다면) `destroyOtherSessions`
 * 두 곳뿐이어야 한다** — 다른 곳에 새로 생기면 ADR-0020 "지켜야 할 규칙" 위반이다.
 *
 * **세션 전량 폐기는 무조건이 아니다.** `DELETE FROM sessions WHERE sub = ? AND EXISTS (SELECT 1
 * FROM deleted_users WHERE deleted_users.sub = ?)` — 판정(`EXISTS`)과 삭제를 **한 문장**에 둔다.
 * **안쪽 `sub` 를 반드시 `deleted_users.sub` 로 한정한다**(리뷰 Finding 2) — SQLite 는 이름 해석을
 * 안쪽 스코프부터 찾는데, 안쪽에 한정 없는 `sub` 를 두면 오늘은 `deleted_users.sub` 로 풀려도
 * 그 컬럼명이 바뀌는 순간 조용히 바깥(`sessions.sub`)으로 다시 묶여 "이 sub 에 `deleted_users`
 * 행이 하나라도 있으면 무조건 전량 폐기"로 되돌아간다 — 정확히 이 함수가 고치러 온 버그다.
 * `deleted_users` 에 이 `sub` 행이 없으면(평범한 재로그인) 이 문장은 0행에 맞아 다른 기기의 세션을 건드리지
 * 않는다 — SYNC_DESIGN.md §②-3 이 원래 적어 둔 "세션은 기기마다 따로 산다" 는 설계 그대로다.
 * 폐기가 실제로 실행되는 유일한 경우는 "계정을 삭제했다가 같은 구글 계정으로 재가입"하는
 * 순간이다: 그 경우엔 여전히 **삭제 창 동안 요청을 한 번도 안 보낸 세션(탈취된 쿠키 포함)이
 * 재가입으로 되살아나는 것**을 막아야 하므로, `deleted_users` 표식을 지우기 **전에** 그 sub 의
 * `sessions` 를 먼저 지운다(ADR-0020 §3 보조정리: 재가입 직전 그 sub 의 세션은 전부 삭제 이전에
 * 만들어진 것이다 — `sessions` 행을 만드는 코드는 이 함수뿐이고, 표식이 생긴 뒤 첫 `signIn` 이 곧
 * 재가입이다). 판정과 삭제를 한 문장에 두는 이유는 `db.batch()` 안에서는 "조회해 보고 분기"가
 * 불가능하고, 두 문장으로 나누면 트랜잭션 밖에서 TOCTOU 가 생기기 때문이다 — 동시 재가입 레이스는
 * 그래서 두 번째 시도가 0행(이미 지워짐)에 맞아 안전하게 무해해진다.
 *
 * 만료 세션 청소(`expires_at <= ?`)는 폐기가 0행으로 끝나는 평범한 로그인에서도 그 sub 의 죽은
 * 행을 치워 테이블이 자라는 것만 막는다(안전에는 관여하지 않는다). `users` upsert 를 이 batch
 * **안, 표식 삭제 뒤**로 옮긴 것은 옛 코드(upsert 가 batch 밖 첫 문장)에 있던 잠재 경합 — 계정
 * 삭제와 재가입이 교차하면 `users` 행 없이 세션만 발급돼 `entities` FK 위반이 반복되는 상태 —
 * 를 함께 닫는다(ADR-0020 §3 "변형들", 이번 변경이 만든 문제는 아니다).
 */
export async function signIn(
  env: Env,
  identity: { sub: string; email: string },
  now: string,
): Promise<{ signedSid: string }> {
  await env.DB.batch([
    env.DB.prepare(
      'DELETE FROM sessions WHERE sub = ? AND EXISTS (SELECT 1 FROM deleted_users WHERE deleted_users.sub = ?)',
    ).bind(identity.sub, identity.sub),
    env.DB.prepare('DELETE FROM sessions WHERE sub = ? AND expires_at <= ?').bind(
      identity.sub,
      now,
    ),
    env.DB.prepare('DELETE FROM deleted_users WHERE sub = ?').bind(identity.sub),
    env.DB.prepare(
      'INSERT INTO users (sub, email, created_at) VALUES (?, ?, ?) ON CONFLICT(sub) DO UPDATE SET email = excluded.email',
    ).bind(identity.sub, identity.email, now),
  ]);
  return createSession(env, identity.sub, now);
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

  // **리뷰 Finding 3**: `sub`·`expires_at`·"삭제된 계정인가" 를 한 문장으로 합쳤다(옛 판은 두
  // `SELECT` 로 나뉘어 있어, `signIn` 의 batch 커밋 도중 — 세션 행은 아직 있고 `deleted_users`
  // 표식은 이미 지워진 그 찰나 — 두 조회가 걸치면 재가입 직후 딱 한 요청이 `ok: true` 를 보는
  // 좁은 창이 있었다). 한 문장이면 D1 이 그 순간의 스냅샷 하나로 두 값을 함께 읽어 그 창이
  // 없어지고, 왕복도 하나 준다. `EXISTS` 서브쿼리 안쪽은 `d.sub` 로 한정해 Finding 2 와 같은
  // 함정(안쪽 미한정 컬럼이 바깥 스코프로 되묶이는 것)을 처음부터 만들지 않는다.
  const row = await env.DB.prepare(
    'SELECT s.sub, s.expires_at, EXISTS(SELECT 1 FROM deleted_users d WHERE d.sub = s.sub) AS deleted FROM sessions s WHERE s.sid = ?',
  )
    .bind(sid)
    .first<{ sub: string; expires_at: string; deleted: number }>();
  if (!row) return { ok: false, status: 401 };
  if (row.expires_at <= now) {
    await env.DB.prepare('DELETE FROM sessions WHERE sid = ?').bind(sid).run();
    return { ok: false, status: 401 };
  }
  if (row.deleted) {
    // 지연 정리 — 이 세션 행을 지우는 것은 이 요청이 유일한 기회다(handlers.ts#sessionErrorResponse
    // jsdoc, 리뷰 Finding 1 참고).
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

/**
 * "다른 기기 모두 로그아웃"(`POST /auth/logout-others`, ADR-0020 §결정 5) — 호출자의 `sid` 는
 * 남기고 그 `sub` 의 나머지 `sessions` 행을 전부 지운다. **`sessions` 를 `sub` 단위로 지우는
 * 문장은 이 함수와 `signIn` 두 곳뿐이어야 한다**(ADR-0020 "지켜야 할 규칙" 1) — `sid <> ?` 조건이
 * 호출자 자신을 로그아웃시키는 것을 막는 유일한 장치이므로, 다른 곳에 비슷한 삭제문을 새로 두지
 * 않는다. 탈취된 세션이 슬라이딩 갱신으로 무기한 사는 문제(ADR-0020 §결과 "감수하는 점")에 대해
 * 사용자가 계정 삭제 없이 쓸 수 있는 명시적 취소 수단이다.
 */
export async function destroyOtherSessions(env: Env, sub: string, sid: string): Promise<void> {
  await env.DB.prepare('DELETE FROM sessions WHERE sub = ? AND sid <> ?').bind(sub, sid).run();
}
