import { handled, type Handled } from './http';
import { createPost } from './post-command';
import { deletePost } from './post-delete';
import { validatePosts } from './validate-posts';

import type { SocialActor } from './actor';

export async function handlePost(
  actor: SocialActor,
  path: string,
  body: unknown,
  key: string | null,
): Promise<Handled> {
  if (path === '/api/social/posts/validate') return handled(await validatePosts(actor, body));
  if (path === '/api/social/posts/delete') return handled(await deletePost(actor, key, body));
  const created = await createPost(actor, key, body);
  return handled(
    created.ok ? { ok: true, value: { id: created.value.id } } : created,
    created.ok && created.value.didApply ? 201 : 200,
  );
}
