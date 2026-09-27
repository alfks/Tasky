import { preProfileSubject } from './limits';
import { sql } from '../db/sql';

import type { SessionOk } from '../auth/session';

/** P3-03 calls this as the account-delete batch entry point. Sessions remain for 410. */
export async function deleteAccountProjection(
  db: D1Database,
  session: SessionOk,
  secret: string,
  nowMs: number,
): Promise<boolean> {
  const nonce = crypto.randomUUID();
  const nowIso = new Date(nowMs).toISOString();
  const pre = await preProfileSubject(secret, session.sub);
  const marker = () =>
    db.prepare(sql`SELECT 1 FROM deleted_users d
    WHERE d.sub = ? AND d.execution_nonce = ?`);
  const results = await db.batch([
    db
      .prepare(
        sql`INSERT INTO deleted_users(sub,deleted_at,execution_nonce)
      SELECT u.sub,?,? FROM users u JOIN sessions s ON s.sub = u.sub
      WHERE u.sub = ? AND s.sid = ? AND s.expires_at > ?
        AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)
      ON CONFLICT(sub) DO NOTHING`,
      )
      .bind(nowIso, nonce, session.sub, session.sid, nowIso),
    db
      .prepare(
        sql`DELETE FROM social_reactions WHERE
      (reactor IN (SELECT id FROM social_profiles WHERE sub = ?)
        OR post_id IN (SELECT post.id FROM social_posts post
          JOIN social_profiles p ON p.id = post.author WHERE p.sub = ?))
      AND EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = ? AND d.execution_nonce = ?)`,
      )
      .bind(session.sub, session.sub, session.sub, nonce),
    db
      .prepare(
        sql`DELETE FROM social_posts WHERE author IN
      (SELECT id FROM social_profiles WHERE sub = ?)
      AND EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = ? AND d.execution_nonce = ?)`,
      )
      .bind(session.sub, session.sub, nonce),
    db
      .prepare(
        sql`DELETE FROM social_pairs WHERE
      (lo IN (SELECT id FROM social_profiles WHERE sub = ?)
       OR hi IN (SELECT id FROM social_profiles WHERE sub = ?))
      AND EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = ? AND d.execution_nonce = ?)`,
      )
      .bind(session.sub, session.sub, session.sub, nonce),
    db
      .prepare(
        sql`DELETE FROM social_blocks WHERE
      (blocker IN (SELECT id FROM social_profiles WHERE sub = ?)
       OR blocked IN (SELECT id FROM social_profiles WHERE sub = ?))
      AND EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = ? AND d.execution_nonce = ?)`,
      )
      .bind(session.sub, session.sub, session.sub, nonce),
    db
      .prepare(
        sql`DELETE FROM social_invites WHERE
      (owner IN (SELECT id FROM social_profiles WHERE sub = ?)
       OR used_by IN (SELECT id FROM social_profiles WHERE sub = ?))
      AND EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = ? AND d.execution_nonce = ?)`,
      )
      .bind(session.sub, session.sub, session.sub, nonce),
    db
      .prepare(
        sql`DELETE FROM social_commands WHERE actor IN
      (SELECT id FROM social_profiles WHERE sub = ?)
      AND EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = ? AND d.execution_nonce = ?)`,
      )
      .bind(session.sub, session.sub, nonce),
    db
      .prepare(
        sql`DELETE FROM social_limits WHERE
      (subject = ? OR subject IN (SELECT 'p:' || id FROM social_profiles WHERE sub = ?))
      AND EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = ? AND d.execution_nonce = ?)`,
      )
      .bind(pre, session.sub, session.sub, nonce),
    db
      .prepare(
        sql`DELETE FROM social_profiles WHERE sub = ?
      AND EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = ? AND d.execution_nonce = ?)`,
      )
      .bind(session.sub, session.sub, nonce),
    db
      .prepare(
        sql`DELETE FROM entities WHERE sub = ?
      AND EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = ? AND d.execution_nonce = ?)`,
      )
      .bind(session.sub, session.sub, nonce),
    db
      .prepare(
        sql`DELETE FROM devices WHERE sub = ?
      AND EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = ? AND d.execution_nonce = ?)`,
      )
      .bind(session.sub, session.sub, nonce),
    db
      .prepare(
        sql`DELETE FROM users WHERE sub = ?
      AND EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = ? AND d.execution_nonce = ?)`,
      )
      .bind(session.sub, session.sub, nonce),
    marker().bind(session.sub, nonce),
  ]);
  return results[0].meta.changes === 1 && results[12].results.length === 1;
}
