import { useCallback, useEffect, useRef, useState } from 'react';

import { parseNickname } from '@/domain/social/input';
import type { FriendView, InviteCreated, RequestView } from '@/domain/social/social';

import { getSocialRepository } from '@/repositories/container';
import type { SocialRepository } from '@/repositories/social-repository';

import { relationErrorMessage } from '@/features/social/hooks/relation-error-message';
import {
  appendRelationPage,
  EMPTY_RELATIONS,
  readRelationPage,
  type RelationKind,
  type RelationsSnapshot,
} from '@/features/social/hooks/relation-pages';
import { captureSocialDispatch, onSocialInvalidation } from '@/features/social/session-lifecycle';
import { useSocialStore } from '@/features/social/store/social-store';

export type { RelationsSnapshot } from '@/features/social/hooks/relation-pages';

/** 모든 응답은 진입 시점의 세대가 아직 살아 있을 때만 UI에 적용한다. */
export function useSocialRelations(enabled: boolean) {
  const [data, setData] = useState<RelationsSnapshot>(EMPTY_RELATIONS);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<InviteCreated | null>(null);
  const [preview, setPreview] = useState<{ nickname: string; expiresAt: number } | null>(null);
  const [previewPhase, setPreviewPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const generation = useRef(0);
  const busyRef = useRef(false);
  const keyFor = useSocialStore((state) => state.keyFor);
  const forgetKey = useSocialStore((state) => state.forgetKey);
  const refreshFeed = useSocialStore((state) => state.refresh);

  useEffect(
    () =>
      onSocialInvalidation(() => {
        generation.current += 1;
        busyRef.current = false;
        setBusy(false);
        setData(EMPTY_RELATIONS);
        setCreatedInvite(null);
        setPreview(null);
        setPreviewPhase('idle');
        setPhase('idle');
        setError(null);
      }),
    [],
  );

  const load = useCallback(async () => {
    if (!enabled) return;
    const current = ++generation.current;
    const allowed = captureSocialDispatch();
    setPhase('loading');
    setError(null);
    try {
      const repo = getSocialRepository();
      const me = (await repo.me()).data;
      if (!allowed() || generation.current !== current) return;
      if (me.profile === null) {
        setData({ ...EMPTY_RELATIONS, me });
        setPhase('ready');
        return;
      }
      const [friends, incoming, outgoing, invites, blocks] = await Promise.all([
        repo.friends(),
        repo.requests('incoming'),
        repo.requests('outgoing'),
        repo.invites(),
        repo.blocks(),
      ]);
      if (!allowed() || generation.current !== current) return;
      setData({
        me,
        friends: friends.data.items,
        incoming: incoming.data.items,
        outgoing: outgoing.data.items,
        invites: invites.data.items,
        blocks: blocks.data.items,
        next: {
          friends: friends.data.nextCursor,
          incoming: incoming.data.nextCursor,
          outgoing: outgoing.data.nextCursor,
          invites: invites.data.nextCursor,
          blocks: blocks.data.nextCursor,
        },
      });
      setPhase('ready');
    } catch (cause) {
      if (!allowed() || generation.current !== current) return;
      setData(EMPTY_RELATIONS);
      setError(relationErrorMessage(cause));
      setPhase('error');
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  const loadMore = async (kind: RelationKind): Promise<void> => {
    const cursor = data.next[kind];
    if (cursor === null || busyRef.current || phase !== 'ready') return;
    const current = generation.current;
    const allowed = captureSocialDispatch();
    if (!allowed()) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const page = await readRelationPage(getSocialRepository(), kind, cursor);
      if (!allowed() || generation.current !== current) return;
      setData((previous) => appendRelationPage(previous, kind, page));
    } catch (cause) {
      if (allowed() && generation.current === current) setError(relationErrorMessage(cause));
    } finally {
      if (allowed() && generation.current === current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };

  const command = useCallback(
    async <T>(
      operation: string,
      run: (repo: SocialRepository, key: string) => Promise<{ data: T }>,
    ): Promise<T | null> => {
      if (busyRef.current) return null;
      const current = generation.current;
      const allowed = captureSocialDispatch();
      if (!allowed()) return null;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      const key = keyFor(operation);
      try {
        const result = await run(getSocialRepository(), key);
        if (!allowed() || generation.current !== current) return null;
        forgetKey(operation);
        return result.data;
      } catch (cause) {
        if (allowed() && generation.current === current) {
          const message = relationErrorMessage(cause);
          const code =
            typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : null;
          if (code === 'conflict' || code === 'request-pending' || code === 'request-expired') {
            // CAS 실패 뒤 오래된 행을 다시 누르지 않도록 먼저 최신 목록을 가져온다.
            busyRef.current = false;
            setBusy(false);
            await load();
            if (allowed() && generation.current === current + 1) setError(message);
          } else setError(message);
        }
        return null;
      } finally {
        if (allowed() && generation.current === current) {
          busyRef.current = false;
          setBusy(false);
        }
      }
    },
    [forgetKey, keyFor, load],
  );

  const createProfile = async (nickname: string): Promise<boolean> => {
    const parsed = parseNickname(nickname);
    if (!parsed.ok) {
      setError('별명은 1~20자로 입력해 주세요.');
      return false;
    }
    const result = await command(`profile:create:${parsed.value}`, (repo) =>
      repo.createProfile({ nickname: parsed.value }),
    );
    if (result === null) return false;
    await load();
    await refreshFeed();
    return true;
  };

  const rename = async (nickname: string): Promise<boolean> => {
    const profile = data.me?.profile;
    const parsed = parseNickname(nickname);
    if (profile === null || profile === undefined || !parsed.ok) {
      setError('별명은 1~20자로 입력해 주세요.');
      return false;
    }
    const operation = `profile:rename:${profile.version}:${parsed.value}`;
    const result = await command(operation, (repo, key) =>
      repo.renameProfile({ nickname: parsed.value, expectedVersion: profile.version }, { key }),
    );
    if (result === null) return false;
    await load();
    return true;
  };

  const invite = async (): Promise<void> => {
    const result = await command('invite:create', (repo, key) => repo.createInvite({ key }));
    if (result === null) return;
    setCreatedInvite(result);
    await load();
  };

  const revokeInvite = async (inviteId: string): Promise<boolean> => {
    const result = await command(`invite:revoke:${inviteId}`, (repo, key) =>
      repo.revokeInvite({ inviteId }, { key }),
    );
    if (result === null) return false;
    setCreatedInvite(null);
    await load();
    return true;
  };

  const request = async (token: string): Promise<boolean> => {
    const result = await command(`request:send:${token}`, (repo, key) =>
      repo.sendRequest({ token }, { key }),
    );
    if (result === null) return false;
    await load();
    return true;
  };

  const previewInvite = useCallback(async (token: string): Promise<void> => {
    const current = generation.current;
    const allowed = captureSocialDispatch();
    if (!allowed()) return;
    setPreview(null);
    setPreviewPhase('loading');
    try {
      const response = await getSocialRepository().previewInvite({ token });
      if (!allowed() || generation.current !== current) return;
      setPreview(response.data);
      setPreviewPhase('ready');
    } catch {
      if (!allowed() || generation.current !== current) return;
      setPreviewPhase('error');
      setError('사용할 수 없는 초대예요. 새 초대를 부탁해 주세요.');
    }
  }, []);

  const changeRequest = async (
    kind: 'accept' | 'decline' | 'cancel',
    item: RequestView,
  ): Promise<boolean> => {
    const input = { peerId: item.peer.id, expectedVersion: item.pairVersion };
    const operation = `request:${kind}:${input.peerId}:${input.expectedVersion}`;
    const result = await command(operation, (repo, key) => {
      if (kind === 'accept') return repo.acceptRequest(input, { key });
      if (kind === 'decline') return repo.declineRequest(input, { key });
      return repo.cancelRequest(input, { key });
    });
    if (result === null) return false;
    await load();
    await refreshFeed();
    return true;
  };

  const removeFriend = async (friend: FriendView): Promise<boolean> => {
    const input = { peerId: friend.id, expectedVersion: friend.pairVersion };
    const result = await command(`friend:remove:${friend.id}:${friend.pairVersion}`, (repo, key) =>
      repo.removeFriend(input, { key }),
    );
    if (result === null) return false;
    await refreshFeed();
    await load();
    return true;
  };

  const block = async (
    peerId: string,
    blocked: boolean,
    expectedVersion?: number,
  ): Promise<boolean> => {
    const input = {
      peerId,
      blocked,
      ...(expectedVersion === undefined ? {} : { expectedVersion }),
    };
    const result = await command(
      `block:${peerId}:${blocked}:${expectedVersion ?? ''}`,
      (repo, key) => repo.setBlock(input, { key }),
    );
    if (result === null) return false;
    await refreshFeed();
    await load();
    return true;
  };

  return {
    data,
    phase,
    error,
    busy,
    createdInvite,
    preview,
    previewPhase,
    load,
    loadMore,
    createProfile,
    rename,
    invite,
    revokeInvite,
    request,
    previewInvite,
    changeRequest,
    removeFriend,
    block,
  };
}
