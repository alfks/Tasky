import { isSocialId, parsePageInput } from '@/domain/social/input';
import type { PageInput, PublicPageInput } from '@/domain/social/social';

import { categoryReadable, categoryView } from '@/repositories/memory/social/categories';
import { keyPage } from '@/repositories/memory/social/cursor';
import {
  answer,
  fail,
  requireSession,
  type MemorySocialState,
} from '@/repositories/memory/social/model';
import { postReadable, postView } from '@/repositories/memory/social/posts';
import type { PublicSocialRepository } from '@/repositories/social-repository';

function viewer(state: MemorySocialState, sub?: string): string | null {
  if (state.mode === 'off') return fail('social-disabled', state.now());
  if (sub === undefined) return null;
  requireSession(state, sub);
  return state.profiles.get(sub)?.id ?? null;
}

function validPage(state: MemorySocialState, input?: PageInput) {
  const parsed = parsePageInput(input ?? {});
  return parsed.ok ? parsed.value : fail('validation', state.now());
}

/** 본문은 탭 메모리에만 있고 public 읽기도 현재 canonical ACL로 판정한다. */
export function createMemoryPublicRepository(
  state: MemorySocialState,
  sub?: string,
): PublicSocialRepository {
  return {
    feed: async (input?: PublicPageInput) => {
      const self = viewer(state, sub);
      const page = validPage(
        state,
        input === undefined ? undefined : { cursor: input.cursor, limit: input.limit },
      );
      if (input?.categoryId !== undefined && !isSocialId(input.categoryId))
        return fail('validation', state.now());
      const posts = [...state.posts.values()]
        .filter(
          (post) =>
            post.category !== undefined &&
            state.categories.get(post.category.id)?.visibility === 'public' &&
            !state.categories.get(post.category.id)?.deleted &&
            (input?.categoryId === undefined || post.category.id === input.categoryId) &&
            postReadable(state, self, post),
        )
        .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
        .map((post) => postView(state, self, post));
      return answer(
        state,
        keyPage(
          state,
          self ?? 'anonymous',
          `public:feed:${input?.categoryId ?? ''}`,
          posts,
          page,
          (post) => `${String(post.createdAt).padStart(16, '0')}:${post.id}`,
          'desc',
        ),
      );
    },
    categories: async (input) => {
      const self = viewer(state, sub);
      const categories = [...state.categories.values()]
        .filter(
          (category) =>
            category.visibility === 'public' &&
            !category.deleted &&
            categoryReadable(state, category.id, self),
        )
        .map((category) => categoryView(state, category.id, null));
      return answer(
        state,
        keyPage(
          state,
          self ?? 'anonymous',
          'public:categories',
          categories,
          validPage(state, input),
          (category) => category.id,
        ),
      );
    },
    post: async ({ id }) => {
      const self = viewer(state, sub);
      const post = state.posts.get(id);
      if (
        post === undefined ||
        post.category === undefined ||
        state.categories.get(post.category.id)?.visibility !== 'public' ||
        state.categories.get(post.category.id)?.deleted ||
        !postReadable(state, self, post)
      )
        return fail('unavailable', state.now());
      return answer(state, postView(state, self, post));
    },
    validatePosts: async ({ ids }) => {
      const self = viewer(state, sub);
      if (ids.length > 50 || new Set(ids).size !== ids.length || !ids.every(isSocialId))
        return fail('validation', state.now());
      return answer(state, {
        allowedIds: ids.filter((id) => {
          const post = state.posts.get(id);
          if (post?.category === undefined) return false;
          const category = state.categories.get(post.category.id);
          return (
            category?.visibility === 'public' &&
            !category.deleted &&
            postReadable(state, self, post)
          );
        }),
      });
    },
  };
}
