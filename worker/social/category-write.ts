import type { SocialCategoryInput } from '@/domain/social/social';

import {
  categoryCommandResult,
  categoryInsert,
  categoryReceipt,
  categoryTombstone,
  categoryUpdate,
  categoryVerify,
} from './category-statements';

import type { SocialActor } from './actor';

/** The canonical CAS, receipt, projection and trigger-maintained hints commit together. */
export async function commitCategory(
  actor: SocialActor,
  key: string,
  hash: string,
  nonce: string,
  id: string,
  input: SocialCategoryInput | { expectedVersion: number },
  create: boolean,
) {
  if (actor.profileId === null) throw new Error('Profile required');
  const { profileId: me, sub, sid, nowIso, nowMs } = actor;
  const revoke = !('name' in input);
  const effect = revoke
    ? categoryTombstone(actor).bind(
        me,
        sub,
        sid,
        nowIso,
        id,
        nowMs,
        input.expectedVersion,
        key,
        nonce,
      )
    : create
      ? categoryInsert(actor).bind(
          me,
          sub,
          sid,
          nowIso,
          id,
          input.name,
          input.color,
          input.emoji ?? null,
          input.visibility,
          nowMs,
          key,
          nonce,
        )
      : categoryUpdate(actor).bind(
          me,
          sub,
          sid,
          nowIso,
          id,
          input.name,
          input.color,
          input.emoji ?? null,
          input.visibility,
          nowMs,
          key,
          nonce,
          input.expectedVersion,
        );
  return actor.db.batch([
    categoryReceipt(actor).bind(
      me,
      key,
      hash,
      nonce,
      id,
      create ? 1 : 0,
      input.expectedVersion,
      nowMs,
      sub,
      sid,
      nowIso,
      revoke ? 1 : 0,
    ),
    effect,
    categoryVerify(actor).bind(me, key, nonce, sub, sid, nowIso),
    categoryCommandResult(actor).bind(me, key, sub, sid, nowIso),
  ]);
}
