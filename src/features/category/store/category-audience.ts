import type { Category } from '@/domain/category/category';
import type { CategoryVisibility } from '@/domain/category/visibility';
import type {
  ProfileView,
  SocialCategoryInput,
  SocialCategoryView,
  SocialErrorCode,
  SocialMode,
} from '@/domain/social/social';

import {
  readOwnedCategory,
  samePublicationIntent,
  publicationErrorCode,
  reportPublicationError,
  type PublicationDependencies,
} from '@/features/category/store/category-publication-contract';
import {
  publicationRecovery,
  startPublicationCommand,
  type PublicationEntry,
  type PublicationIntent,
} from '@/features/category/store/category-publication-recovery';

export type CategoryAudienceSnapshot = {
  phase: 'checking' | 'ready' | 'saving' | 'error';
  confirmed: SocialCategoryView | null;
  mode: SocialMode | null;
  profile: ProfileView | null;
  error: SocialErrorCode | null;
  uncertain: boolean;
  pending: PublicationIntent | null;
};
export type CategoryAudienceMetadata = { name: string; color: string; emoji?: string };
export type CategoryAudienceDependencies = PublicationDependencies;
const INITIAL: CategoryAudienceSnapshot = {
  phase: 'checking',
  confirmed: null,
  mode: null,
  profile: null,
  error: null,
  uncertain: false,
  pending: null,
};
/** 별도 공개 조회가 아닌 소유자 관리 목록으로 복원된 연결의 소유권을 확인한다. */
export function createCategoryAudienceController(
  category: Category,
  deps: CategoryAudienceDependencies,
) {
  let state = INITIAL;
  let generation = 0;
  let disposed = false;
  const recovery = deps.recovery ?? publicationRecovery;
  const namespace = `local:${category.id}`;
  let pending: PublicationEntry | null = null;
  let cancelObservation: (() => void) | null = null;
  let lastMode: SocialMode | null = null;
  let checked = false;
  let boundId = category.socialCategoryId;
  const listeners = new Set<() => void>();
  const key = deps.key ?? (() => `v1.${Date.now()}.${crypto.randomUUID().replaceAll('-', '')}`);
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
    recovery.lock(reason);
    cancelObservation?.();
    cancelObservation = null;
    pending = null;
    update({ ...INITIAL, error: reason === 'account' ? 'unauthorized' : 'temporary' });
  }
  async function refresh(automatic = false): Promise<void> {
    if (disposed || state.phase === 'saving' || (automatic && lastMode === 'off')) return;
    const captured = ++generation;
    const allowed = deps.capture();
    const proof = recovery.proof();
    update({ phase: 'checking', error: null });
    if (!current(captured, allowed)) {
      update({ phase: 'error', error: 'temporary' });
      return;
    }
    try {
      const identity = await deps.repository().me();
      if (!current(captured, allowed)) return;
      lastMode = identity.data.mode;
      if (identity.data.profile === null) recovery.lock('auth');
      if (
        identity.data.profile === null ||
        !recovery.verifyActor(identity.data.profile.id, proof, allowed)
      ) {
        update({
          ...INITIAL,
          phase: 'ready',
          profile: identity.data.profile,
          mode: identity.data.mode,
        });
        return;
      }
      pending = recovery.get(namespace);
      const owned =
        boundId === undefined
          ? null
          : await readOwnedCategory(deps.repository(), boundId, () => current(captured, allowed));
      const confirmed = owned?.revoked === true ? null : owned;
      if (!current(captured, allowed) || confirmed === undefined) return;
      if (pending === null && !(await deps.persist(confirmed)))
        throw new Error('확인 결과를 저장하지 못했어요.');
      if (!current(captured, allowed)) return;
      checked = true;
      boundId = confirmed?.id;
      update({
        phase: 'ready',
        confirmed,
        profile: identity.data.profile,
        mode: identity.data.mode,
        error: pending === null ? null : (pending.blocked ?? 'request-pending'),
        uncertain: pending !== null,
        pending: pending?.intent ?? null,
      });
    } catch (error) {
      if (current(captured, allowed)) {
        const code = reportPublicationError(error, allowed, deps.onSessionFailure);
        if (code === 'unauthorized' || code === 'account-deleted') recovery.lock(code);
        if (current(captured, allowed)) update({ phase: 'error', error: code });
      }
    }
  }
  async function complete(entry: PublicationEntry): Promise<boolean> {
    const captured = ++generation;
    const allowed = deps.capture();
    if (!current(captured, allowed)) return false;
    const command = entry.intent;
    let observation: ReturnType<typeof startPublicationCommand>;
    try {
      observation = startPublicationCommand(entry, recovery, deps.repository(), () =>
        current(captured, allowed),
      );
    } catch (error) {
      update({ phase: 'error', error: publicationErrorCode(error) });
      return false;
    }
    pending = entry;
    update({ phase: 'saving', error: null, uncertain: false, pending: command });
    cancelObservation = observation.cancel;
    const result = await observation.promise;
    cancelObservation = null;
    if (!current(captured, allowed) || result.type === 'stale') return false;
    if (result.type === 'error') {
      const { code, uncertain } = result;
      reportPublicationError({ code }, allowed, deps.onSessionFailure);
      if (!current(captured, allowed)) return false;
      if (!uncertain) pending = null;
      update({ phase: 'error', error: code, uncertain, pending: uncertain ? command : null });
      if (
        !uncertain &&
        ['conflict', 'idempotency-conflict', 'request-expired', 'unavailable'].includes(code)
      ) {
        await refresh();
        if (current(generation, allowed)) update({ error: code });
      }
      return false;
    }
    const canonical = result.canonical;
    let saved = false;
    try {
      saved = await deps.persist(
        canonical,
        command.original,
        () => current(captured, allowed) && result.allowed(),
      );
    } catch {
      /* 서버 결과는 확인했지만 개인 연결을 쓰지 못한 상태다. */
    }
    if (!current(captured, allowed) || !result.allowed()) return false;
    result.resolve();
    pending = null;
    boundId = saved ? canonical?.id : boundId;
    const matches =
      saved &&
      (command.kind === 'revoke' ||
        (canonical !== null && samePublicationIntent(command.input, canonical)));
    update({
      phase: 'ready',
      confirmed: canonical,
      error: matches ? null : 'conflict',
      uncertain: false,
      pending: null,
    });
    return matches;
  }
  function submit(intent: PublicationIntent): Promise<boolean> {
    try {
      return complete(recovery.reserve(namespace, intent, key));
    } catch (error) {
      update({ phase: 'error', error: publicationErrorCode(error) });
      return Promise.resolve(false);
    }
  }
  const canChange = () =>
    !disposed &&
    checked &&
    deps.capture()() &&
    state.phase !== 'saving' &&
    state.phase !== 'checking';
  async function change(
    visibility: CategoryVisibility,
    metadata?: CategoryAudienceMetadata,
  ): Promise<boolean> {
    if (!canChange()) return false;
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
      if (state.mode !== 'enabled') {
        update({ error: 'social-disabled' });
        return false;
      }
      if (pending.intent.kind !== 'save' || !samePublicationIntent(pending.intent.input, input)) {
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
    return submit({ kind: 'save', input, original: category });
  }
  async function revoke(): Promise<boolean> {
    if (!canChange()) return false;
    if (pending !== null) {
      if (pending.intent.kind !== 'revoke') {
        update({ error: 'request-pending' });
        return false;
      }
      return complete(pending);
    }
    if (state.confirmed === null) return deps.persist(null);
    return submit({
      kind: 'revoke',
      input: { id: state.confirmed.id, expectedVersion: state.confirmed.version },
      original: category,
    });
  }
  return {
    getSnapshot: () => state,
    retry: () =>
      pending === null ||
      state.phase === 'saving' ||
      (pending.intent.kind === 'save' && state.mode !== 'enabled')
        ? Promise.resolve(false)
        : complete(pending),
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
      cancelObservation?.();
      cancelObservation = null;
      pending = null;
      state = INITIAL;
      listeners.clear();
    },
  };
}
