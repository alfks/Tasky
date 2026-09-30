import type { Category } from '@/domain/category/category';
import type { CategoryVisibility } from '@/domain/category/visibility';
import type {
  ProfileView,
  SocialCategoryInput,
  SocialCategoryView,
  SocialErrorCode,
  SocialMode,
} from '@/domain/social/social';

import type { SocialRepository } from '@/repositories/social-repository';

export type CategoryAudienceSnapshot = {
  phase: 'checking' | 'ready' | 'saving' | 'error';
  confirmed: SocialCategoryView | null;
  mode: SocialMode | null;
  profile: ProfileView | null;
  error: SocialErrorCode | null;
};
export type CategoryAudienceMetadata = { name: string; color: string; emoji?: string };
export type CategoryAudienceDependencies = {
  repository: () => SocialRepository;
  capture: () => () => boolean;
  online: () => boolean;
  persist: (canonical: SocialCategoryView | null) => Promise<boolean>;
  key?: () => string;
  subscribeReady?: (listener: () => void) => () => void;
  subscribeInvalidation?: (listener: (reason: string) => void) => () => void;
};
type Pending =
  | { kind: 'save'; key: string; input: SocialCategoryInput }
  | { kind: 'revoke'; key: string; input: { id: string; expectedVersion: number } };
const INITIAL: CategoryAudienceSnapshot = {
  phase: 'checking',
  confirmed: null,
  mode: null,
  profile: null,
  error: null,
};

function codeOf(error: unknown): SocialErrorCode {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
  switch (code) {
    case 'unauthorized':
    case 'account-deleted':
    case 'conflict':
    case 'request-pending':
    case 'request-expired':
    case 'idempotency-conflict':
    case 'social-disabled':
    case 'validation':
    case 'unavailable':
    case 'limit-reached':
    case 'rate-limited':
    case 'csrf':
      return code;
    default:
      return 'temporary';
  }
}
function sameIntent(
  left: Pick<SocialCategoryInput, 'visibility' | 'name' | 'color' | 'emoji'>,
  right: Pick<SocialCategoryInput, 'visibility' | 'name' | 'color' | 'emoji'>,
): boolean {
  return (
    left.visibility === right.visibility &&
    left.name === right.name &&
    left.color === right.color &&
    left.emoji === right.emoji
  );
}

/** 별도 공개 조회가 아닌 소유자 관리 목록으로 복원된 연결의 소유권을 확인한다. */
export function createCategoryAudienceController(
  category: Category,
  deps: CategoryAudienceDependencies,
) {
  let state = INITIAL;
  let generation = 0;
  let disposed = false;
  let pending: Pending | null = null;
  let checked = false;
  let boundId = category.socialCategoryId;
  const listeners = new Set<() => void>();
  const key = deps.key ?? (() => `v1.${Date.now()}.${crypto.randomUUID().replaceAll('-', '')}`);
  const getSnapshot = () => state;
  function update(patch: Partial<CategoryAudienceSnapshot>): void {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }
  function current(captured: number, allowed: () => boolean): boolean {
    return !disposed && generation === captured && allowed() && deps.online();
  }
  function invalidate(reason: string): void {
    generation += 1;
    checked = false;
    const temporary = ['offline', 'hidden', 'recheck', 'activation'].includes(reason);
    if (!temporary) pending = null;
    update({ ...INITIAL, error: temporary ? 'temporary' : 'unauthorized' });
  }
  async function ownerProjection(allowed: () => boolean, captured: number) {
    if (boundId === undefined) return null;
    let cursor: string | undefined;
    const seen = new Set<string>();
    for (let page = 0; page < 20; page += 1) {
      const response = await deps
        .repository()
        .categories({ limit: 50, ...(cursor ? { cursor } : {}) });
      if (!current(captured, allowed)) return undefined;
      const owned = response.data.items.find((item) => item.id === boundId);
      if (owned !== undefined) return owned.revoked === true ? null : owned;
      if (response.data.nextCursor === null) return null;
      if (seen.has(response.data.nextCursor)) throw new Error('목록을 다시 확인해 주세요.');
      seen.add(response.data.nextCursor);
      cursor = response.data.nextCursor;
    }
    throw new Error('목록을 다시 확인해 주세요.');
  }
  async function refresh(): Promise<void> {
    if (disposed || state.phase === 'saving') return;
    const captured = ++generation;
    const allowed = deps.capture();
    update({ phase: 'checking', error: null });
    if (!current(captured, allowed)) {
      update({ phase: 'error', error: 'temporary' });
      return;
    }
    try {
      const identity = await deps.repository().me();
      if (!current(captured, allowed)) return;
      const confirmed =
        identity.data.profile === null ? null : await ownerProjection(allowed, captured);
      if (!current(captured, allowed) || confirmed === undefined) return;
      if (!(await deps.persist(confirmed))) throw new Error('확인 결과를 저장하지 못했어요.');
      if (!current(captured, allowed)) return;
      checked = true;
      boundId = confirmed?.id;
      update({
        phase: 'ready',
        confirmed,
        profile: identity.data.profile,
        mode: identity.data.mode,
        error: null,
      });
    } catch (error) {
      if (current(captured, allowed)) update({ phase: 'error', error: codeOf(error) });
    }
  }
  async function complete(command: Pending): Promise<boolean> {
    const captured = ++generation;
    const allowed = deps.capture();
    if (!current(captured, allowed)) {
      update({ phase: 'error', error: 'temporary' });
      return false;
    }
    pending = command;
    update({ phase: 'saving', error: null });
    try {
      const repository = deps.repository();
      const response =
        command.kind === 'save'
          ? await repository.saveCategory(command.input, { key: command.key })
          : await repository.revokeCategory(command.input, { key: command.key });
      if (!current(captured, allowed)) return false;
      const canonical =
        command.kind === 'revoke' || response.data.revoked === true ? null : response.data;
      if (!(await deps.persist(canonical))) throw new Error('확인 결과를 저장하지 못했어요.');
      if (!current(captured, allowed)) return false;
      pending = null;
      boundId = canonical?.id;
      checked = true;
      const matches =
        command.kind === 'revoke' || (canonical !== null && sameIntent(command.input, canonical));
      update({ phase: 'ready', confirmed: canonical, error: matches ? null : 'conflict' });
      return matches;
    } catch (error) {
      if (!current(captured, allowed)) return false;
      const code = codeOf(error);
      update({ phase: 'error', error: code });
      if (
        code === 'conflict' ||
        code === 'idempotency-conflict' ||
        code === 'request-expired' ||
        code === 'unavailable'
      ) {
        pending = null;
        await refresh();
        if (current(generation, allowed)) update({ error: code });
      } else if (code === 'unauthorized' || code === 'account-deleted') invalidate(code);
      else if (code !== 'temporary' && code !== 'request-pending') pending = null;
      return false;
    }
  }
  async function change(
    visibility: CategoryVisibility,
    metadata?: CategoryAudienceMetadata,
  ): Promise<boolean> {
    if (
      disposed ||
      !checked ||
      !deps.capture()() ||
      state.phase === 'saving' ||
      state.phase === 'checking'
    )
      return false;
    const confirmed = state.confirmed;
    const values = metadata ?? confirmed ?? category;
    const input: SocialCategoryInput = {
      ...(confirmed ? { id: confirmed.id } : {}),
      expectedVersion: confirmed?.version ?? 0,
      name: values.name,
      color: values.color,
      ...(values.emoji === undefined ? {} : { emoji: values.emoji }),
      visibility,
    };
    if (pending !== null) {
      if (pending.kind !== 'save' || !sameIntent(pending.input, input)) {
        update({ error: 'request-pending' });
        return false;
      }
      return complete(pending);
    }
    if (confirmed === null && visibility === 'private') return deps.persist(null);
    if (state.profile === null || state.mode === null) return false;
    const metadataChanged =
      confirmed === null ||
      input.name !== confirmed.name ||
      input.color !== confirmed.color ||
      input.emoji !== confirmed.emoji;
    if (state.mode !== 'enabled' && (visibility !== 'private' || metadataChanged)) {
      update({ error: 'social-disabled' });
      return false;
    }
    return complete({ kind: 'save', input, key: key() });
  }
  async function revoke(): Promise<boolean> {
    if (
      disposed ||
      !checked ||
      !deps.capture()() ||
      state.phase === 'saving' ||
      state.phase === 'checking'
    )
      return false;
    if (pending !== null) {
      if (pending.kind !== 'revoke') {
        update({ error: 'request-pending' });
        return false;
      }
      return complete(pending);
    }
    if (state.confirmed === null) return deps.persist(null);
    return complete({
      kind: 'revoke',
      input: { id: state.confirmed.id, expectedVersion: state.confirmed.version },
      key: key(),
    });
  }
  return {
    getSnapshot,
    resume: () => {
      disposed = false;
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
    change,
    revoke,
    invalidate,
    dispose: () => {
      disposed = true;
      generation += 1;
      pending = null;
      state = INITIAL;
      listeners.clear();
    },
  };
}
