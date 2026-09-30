import { sql } from '../db/sql';

import type { SocialActor } from './actor';

export function categoryReceipt(actor: SocialActor) {
  return actor.db.prepare(sql`INSERT INTO social_commands(actor,key,request_hash,execution_nonce,
    result_code,resource_id,result_version,created_at)
  SELECT me.id,?2,?3,?4,CASE
    WHEN ?6 = 0 AND NOT EXISTS (SELECT 1 FROM social_categories c
      WHERE c.id = ?5 AND c.owner = me.id) THEN 'unavailable'
    WHEN ?6 = 0 AND EXISTS (SELECT 1 FROM social_categories c
      WHERE c.id = ?5 AND c.owner = me.id AND c.deleted_at IS NOT NULL) AND ?12 = 0
      THEN 'unavailable'
    WHEN ?6 = 0 AND NOT EXISTS (SELECT 1 FROM social_categories c
      WHERE c.id = ?5 AND c.owner = me.id AND c.version = ?7) THEN 'conflict'
    WHEN ?6 = 1 AND (SELECT COUNT(*) FROM social_categories c
      WHERE c.owner = me.id AND c.deleted_at IS NULL) >= 50 THEN 'limit-reached'
    ELSE 'ok' END,?5,?7+1,?8
  FROM social_profiles me JOIN users u ON u.sub = me.sub JOIN sessions s ON s.sub = u.sub
  WHERE me.id = ?1 AND me.sub = ?9 AND s.sid = ?10 AND s.expires_at > ?11
    AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)
  ON CONFLICT(actor,key) DO NOTHING`);
}

export function categoryInsert(actor: SocialActor) {
  return actor.db
    .prepare(sql`INSERT INTO social_categories(id,owner,name,color,emoji,visibility,version,updated_at)
  SELECT ?5,me.id,?6,?7,?8,?9,1,?10
  FROM social_profiles me JOIN users u ON u.sub = me.sub JOIN sessions s ON s.sub = u.sub
  WHERE me.id = ?1 AND me.sub = ?2 AND s.sid = ?3 AND s.expires_at > ?4
    AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)
    AND EXISTS (SELECT 1 FROM social_commands cmd WHERE cmd.actor = me.id
      AND cmd.key = ?11 AND cmd.execution_nonce = ?12 AND cmd.result_code = 'ok')`);
}

export function categoryUpdate(actor: SocialActor) {
  return actor.db.prepare(sql`UPDATE social_categories SET name = ?6,color = ?7,emoji = ?8,
    visibility = ?9,version = version + 1,updated_at = ?10
  WHERE id = ?5 AND owner = ?1 AND version = ?13 AND deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM social_profiles me JOIN users u ON u.sub = me.sub
      JOIN sessions s ON s.sub = u.sub WHERE me.id = ?1 AND me.sub = ?2
      AND s.sid = ?3 AND s.expires_at > ?4
      AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub))
    AND EXISTS (SELECT 1 FROM social_commands cmd WHERE cmd.actor = ?1
      AND cmd.key = ?11 AND cmd.execution_nonce = ?12 AND cmd.result_code = 'ok')`);
}

export function categoryTombstone(actor: SocialActor) {
  return actor.db.prepare(sql`UPDATE social_categories SET visibility = 'private',
    deleted_at = COALESCE(deleted_at,?6),version = version + 1,updated_at = ?6
  WHERE id = ?5 AND owner = ?1 AND version = ?7
    AND EXISTS (SELECT 1 FROM social_profiles me JOIN users u ON u.sub = me.sub
      JOIN sessions s ON s.sub = u.sub WHERE me.id = ?1 AND me.sub = ?2
      AND s.sid = ?3 AND s.expires_at > ?4
      AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub))
    AND EXISTS (SELECT 1 FROM social_commands cmd WHERE cmd.actor = ?1
      AND cmd.key = ?8 AND cmd.execution_nonce = ?9 AND cmd.result_code = 'ok')`);
}

export function categoryVerify(actor: SocialActor) {
  return actor.db.prepare(sql`UPDATE social_commands SET result_version = CASE
    WHEN EXISTS (SELECT 1 FROM social_categories c WHERE c.id = social_commands.resource_id
      AND c.owner = social_commands.actor AND c.version = social_commands.result_version
      AND ((c.visibility = 'public' AND c.deleted_at IS NULL AND EXISTS
        (SELECT 1 FROM social_public_categories hint WHERE hint.id = c.id)) OR
        ((c.visibility <> 'public' OR c.deleted_at IS NOT NULL) AND NOT EXISTS
          (SELECT 1 FROM social_public_categories hint WHERE hint.id = c.id)))
      AND NOT EXISTS (SELECT 1 FROM social_posts post WHERE post.category_id = c.id
        AND post.author = c.owner AND c.visibility = 'public' AND c.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM social_public_posts hint WHERE hint.id = post.id
          AND hint.category_id = c.id AND hint.created_at = post.created_at))
      AND NOT EXISTS (SELECT 1 FROM social_public_posts hint WHERE hint.category_id = c.id
        AND (c.visibility <> 'public' OR c.deleted_at IS NOT NULL))
      AND NOT EXISTS (SELECT 1 FROM social_posts post WHERE post.category_id = c.id
        AND post.author = c.owner AND c.visibility IN ('friends','public') AND c.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM social_friend_posts hint WHERE hint.id = post.id
          AND hint.author = post.author AND hint.category_id = c.id AND hint.created_at = post.created_at))
      AND NOT EXISTS (SELECT 1 FROM social_friend_posts hint WHERE hint.category_id = c.id
        AND (c.visibility = 'private' OR c.deleted_at IS NOT NULL)))
    THEN result_version ELSE -1 END
  WHERE actor = ?1 AND key = ?2 AND execution_nonce = ?3 AND result_code = 'ok'
    AND EXISTS (SELECT 1 FROM social_profiles me JOIN users u ON u.sub = me.sub
      JOIN sessions s ON s.sub = u.sub WHERE me.id = ?1 AND me.sub = ?4
      AND s.sid = ?5 AND s.expires_at > ?6
      AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub))`);
}

export function categoryCommandResult(actor: SocialActor) {
  return actor.db.prepare(sql`SELECT cmd.actor,cmd.key,cmd.request_hash,cmd.execution_nonce,
    cmd.result_code,cmd.resource_id,cmd.result_version FROM social_commands cmd
  JOIN social_profiles me ON me.id = cmd.actor JOIN users u ON u.sub = me.sub
  JOIN sessions s ON s.sub = u.sub WHERE cmd.actor = ?1 AND cmd.key = ?2
    AND me.sub = ?3 AND s.sid = ?4 AND s.expires_at > ?5
    AND NOT EXISTS (SELECT 1 FROM deleted_users d WHERE d.sub = u.sub)`);
}
