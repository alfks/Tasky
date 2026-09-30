import type { SocialMode } from '@/domain/social/social';

import { saveCategory } from './category-command';
import { readCategory, readMyCategories } from './category-read';
import { revokeCategory } from './category-revoke';
import { handled, type Handled } from './http';

import type { SocialActor } from './actor';

export async function handleCategory(
  actor: SocialActor,
  path: string,
  url: URL,
  body: unknown,
  key: string | null,
  secret: string,
  mode: SocialMode,
): Promise<Handled> {
  if (path === '/api/social/categories/mine')
    return handled(await readMyCategories(actor, url, secret));
  if (path === '/api/social/categories/revoke')
    return handled(await revokeCategory(actor, key, body));
  if (path === '/api/social/categories') return handled(await saveCategory(actor, key, body, mode));
  if (url.searchParams.size !== 0) return { ok: false, code: 'validation' };
  return handled(
    await readCategory(actor, path.slice('/api/social/categories/'.length), mode === 'off'),
  );
}
