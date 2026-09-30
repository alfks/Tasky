import type { PageInput } from '@/domain/social/social';

import type { SocialRepository } from '@/repositories/social-repository';

import { ownerCategory } from '@/infra/social/category-decode';
import {
  allowed,
  block,
  field,
  flag,
  friend,
  invite,
  inviteCreated,
  me,
  page,
  pair,
  post,
  preview,
  profile,
  profileVersion,
  reaction,
  request,
  sentRequest,
} from '@/infra/social/decode';
import { createSocialRequest } from '@/infra/social/request';

function pageQuery(input?: PageInput): Readonly<Record<string, string | number | undefined>> {
  return { cursor: input?.cursor, limit: input?.limit };
}

/** 서버의 공개 DTO만 돌려주며 쿠키·초대 원문을 URL이나 영속 저장소에 기록하지 않는다. */
export function createHttpSocialRepository(transport: typeof fetch = fetch): SocialRepository {
  const send = createSocialRequest(transport);
  return {
    me: () => send('/me', me),
    categories: (input) =>
      send('/categories/mine', (value) => page(value, ownerCategory), { query: pageQuery(input) }),
    category: ({ id }) => send(`/categories/${id}`, ownerCategory),
    saveCategory: (input, { key }) =>
      send('/categories', ownerCategory, { method: 'POST', body: input, key }),
    revokeCategory: (input, { key }) =>
      send('/categories/revoke', ownerCategory, { method: 'POST', body: input, key }),
    createProfile: (input) => send('/profile', profile, { method: 'POST', body: input }),
    renameProfile: (input, { key }) =>
      send('/profile/name', profileVersion, {
        method: 'POST',
        body: input,
        key,
      }),
    friends: (input) =>
      send('/friends', (value) => page(value, friend), {
        query: pageQuery(input),
      }),
    requests: (direction, input) =>
      send('/requests', (value) => page(value, request), {
        query: { direction, ...pageQuery(input) },
      }),
    createInvite: ({ key }) =>
      send('/invites', inviteCreated, {
        method: 'POST',
        body: {},
        key,
      }),
    invites: (input) =>
      send('/invites', (value) => page(value, invite), {
        query: pageQuery(input),
      }),
    revokeInvite: (input, { key }) =>
      send('/invites/revoke', (value) => flag(value, 'revoked'), {
        method: 'POST',
        body: input,
        key,
      }),
    previewInvite: (input) =>
      send('/invites/preview', preview, {
        method: 'POST',
        body: input,
      }),
    sendRequest: (input, { key }) =>
      send('/requests', sentRequest, {
        method: 'POST',
        body: input,
        key,
      }),
    acceptRequest: (input, { key }) =>
      send('/requests/accept', pair, {
        method: 'POST',
        body: input,
        key,
      }),
    declineRequest: (input, { key }) =>
      send('/requests/decline', pair, {
        method: 'POST',
        body: input,
        key,
      }),
    cancelRequest: (input, { key }) =>
      send('/requests/cancel', pair, {
        method: 'POST',
        body: input,
        key,
      }),
    removeFriend: (input, { key }) =>
      send('/friends/remove', pair, {
        method: 'POST',
        body: input,
        key,
      }),
    blocks: (input) =>
      send('/blocks', (value) => page(value, friend), {
        query: pageQuery(input),
      }),
    setBlock: (input, { key }) =>
      send('/blocks/set', block, {
        method: 'POST',
        body: input,
        key,
      }),
    feed: (input) =>
      send('/feed', (value) => page(value, post), {
        query: pageQuery(input),
      }),
    validatePosts: (input) =>
      send('/posts/validate', allowed, {
        method: 'POST',
        body: input,
      }),
    myPosts: (input) =>
      send('/posts/mine', (value) => page(value, post), {
        query: pageQuery(input),
      }),
    createPost: (input, { key }) =>
      send('/posts', (value) => field(value, 'id'), {
        method: 'POST',
        body: input,
        key,
      }),
    deletePost: (input, { key }) =>
      send('/posts/delete', (value) => flag(value, 'deleted'), {
        method: 'POST',
        body: input,
        key,
      }),
    setReaction: (input, { key }) =>
      send('/reactions/set', reaction, {
        method: 'POST',
        body: input,
        key,
      }),
  };
}
