import type { Category } from '@/domain/category/category';
import type { CategoryId } from '@/domain/ids';
import type {
  ProfileView,
  SocialCategoryView,
  SocialErrorCode,
  SocialMode,
} from '@/domain/social/social';

import {
  readOwnedCategory,
  publicationOriginMatches,
  publicationError,
  reportPublicationError,
  type PublicationDependencies,
} from '@/features/category/store/category-publication-contract';
import {
  publicationRecovery,
  startPublicationCommand,
  type PublicationEntry,
} from '@/features/category/store/category-publication-recovery';
export type PreparedPublication = {
  kind: 'attach' | 'revoke';
  canonical: SocialCategoryView;
  origin?: Category;
};
export type PublicationManagerDependencies = PublicationDependencies & {
  getLocal: (id: CategoryId) => Category | undefined;
  listLocal: () => readonly Category[];
};
type ManagerSnapshot = {
  items: readonly SocialCategoryView[];
  nextCursor: string | null;
  phase: 'checking' | 'ready' | 'saving' | 'error';
  mode: SocialMode | null;
  profile: ProfileView | null;
  error: SocialErrorCode | null;
  prepared: PreparedPublication | null;
  uncertain: boolean;
};
export function createCategoryPublicationManager(deps: PublicationManagerDependencies) {
  const recovery = deps.recovery ?? publicationRecovery;
  const key = deps.key ?? (() => `v1.${Date.now()}.${crypto.randomUUID().replaceAll('-', '')}`);
  let snapshot: ManagerSnapshot = {
    items: [],
    nextCursor: null,
    phase: 'ready',
    mode: null,
    profile: null,
    error: null,
    prepared: null,
    uncertain: false,
  };
  let generation = 0;
  let disposed = false;
  let cancel: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<ManagerSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };
  let stopRecovery: (() => void) | null = recovery.subscribe(() => update({}));
  const capture = () => {
    const current = ++generation;
    const allowed = deps.capture();
    return () => !disposed && current === generation && allowed() && deps.online();
  };
  async function verify(allowed: () => boolean) {
    const proof = recovery.proof();
    const me = await deps.repository().me();
    if (!allowed()) throw publicationError('temporary');
    if (me.data.profile === null) throw publicationError('validation');
    if (!recovery.verifyActor(me.data.profile.id, proof, allowed))
      throw publicationError('temporary');
    update({ profile: me.data.profile, mode: me.data.mode });
  }
  async function run(
    work: (allowed: () => boolean) => Promise<boolean>,
    phase: ManagerSnapshot['phase'] = 'checking',
  ) {
    if (disposed || snapshot.phase === 'saving') return false;
    const allowed = capture();
    update({ phase, error: null });
    try {
      const result = await work(allowed);
      if (allowed()) update({ phase: 'ready' });
      return result;
    } catch (error) {
      if (allowed()) {
        const code = reportPublicationError(error, allowed, deps.onSessionFailure);
        if (code === 'unauthorized' || code === 'account-deleted') recovery.lock(code);
        if (allowed()) update({ phase: 'error', error: code });
      }
      return false;
    }
  }
  async function load(cursor?: string) {
    return run(async (allowed) => {
      await verify(allowed);
      const page = await deps.repository().categories({ limit: 50, ...(cursor ? { cursor } : {}) });
      if (!allowed()) return false;
      update({ items: page.data.items, nextCursor: page.data.nextCursor, prepared: null });
      return true;
    });
  }
  const localAllowed = (original: Category, remoteId: string) => {
    return (
      original.socialCategoryId === undefined &&
      publicationOriginMatches(deps.getLocal(original.id), original) &&
      recovery.get(`local:${original.id}`) === null &&
      !deps.listLocal().some((item) => item.socialCategoryId === remoteId)
    );
  };
  async function prepareAttach(remoteId: string, localId: CategoryId) {
    return run(async (allowed) => {
      await verify(allowed);
      const local = deps.getLocal(localId);
      if (local === undefined || !localAllowed(local, remoteId)) throw publicationError('conflict');
      const canonical = await readOwnedCategory(deps.repository(), remoteId, allowed);
      if (!allowed()) return false;
      if (canonical === null || canonical === undefined || canonical.revoked === true)
        throw publicationError('unavailable');
      update({
        prepared: Object.freeze({
          kind: 'attach',
          canonical: Object.freeze({ ...canonical }),
          origin: Object.freeze({ ...local }),
        }),
      });
      return true;
    });
  }
  async function confirmAttach(prepared: PreparedPublication) {
    if (
      snapshot.prepared !== prepared ||
      prepared.kind !== 'attach' ||
      prepared.origin === undefined
    )
      return false;
    return run(async (allowed) => {
      await verify(allowed);
      const canonical = await readOwnedCategory(deps.repository(), prepared.canonical.id, allowed);
      if (!allowed()) return false;
      if (canonical === null || canonical === undefined || canonical.revoked === true)
        throw publicationError('unavailable');
      if (
        canonical.version !== prepared.canonical.version ||
        canonical.visibility !== prepared.canonical.visibility
      ) {
        update({ prepared: Object.freeze({ ...prepared, canonical }) });
        throw publicationError('conflict');
      }
      const original = prepared.origin!;
      const guard = () =>
        allowed() &&
        recovery.actor() === snapshot.profile?.id &&
        localAllowed(original, canonical.id);
      if (!guard() || !(await deps.persist(canonical, original, guard)))
        throw publicationError('conflict');
      if (!allowed()) return false;
      update({ prepared: null });
      return true;
    }, 'saving');
  }
  async function prepareRevoke(remoteId: string) {
    return run(async (allowed) => {
      await verify(allowed);
      const canonical = await readOwnedCategory(deps.repository(), remoteId, allowed);
      if (!allowed()) return false;
      const existing = recovery.get(`remote:${remoteId}`);
      if (existing !== null && canonical !== null && canonical !== undefined) {
        update({
          uncertain: true,
          error: existing.blocked,
          prepared: { kind: 'revoke', canonical },
        });
        return true;
      }
      if (canonical === null || canonical === undefined || canonical.revoked === true)
        throw publicationError('unavailable');
      update({
        prepared: Object.freeze({ kind: 'revoke', canonical: Object.freeze({ ...canonical }) }),
        uncertain: false,
      });
      return true;
    });
  }
  async function execute(entry: PublicationEntry, allowed: () => boolean) {
    const observation = startPublicationCommand(entry, recovery, deps.repository(), allowed);
    cancel = observation.cancel;
    const result = await observation.promise;
    cancel = null;
    if (!allowed() || result.type === 'stale') return false;
    if (result.type === 'error') {
      update({ uncertain: result.uncertain });
      if (result.code === 'conflict') {
        const canonical = await readOwnedCategory(
          deps.repository(),
          entry.intent.input.id!,
          allowed,
        );
        if (allowed()) update({ prepared: canonical ? { kind: 'revoke', canonical } : null });
      }
      throw publicationError(result.code);
    }
    let localSaved = true;
    for (const original of entry.intent.kind === 'revoke' ? (entry.intent.originals ?? []) : []) {
      const guard = () =>
        allowed() &&
        result.allowed() &&
        publicationOriginMatches(deps.getLocal(original.id), original);
      if (!guard() || !(await deps.persist(null, original, guard))) localSaved = false;
    }
    if (!allowed() || !result.allowed()) return false;
    result.resolve();
    update({ prepared: null, uncertain: false });
    if (!localSaved) throw publicationError('conflict');
    return true;
  }
  const confirmRevoke = (prepared: PreparedPublication) => {
    if (snapshot.prepared !== prepared || prepared.kind !== 'revoke') return Promise.resolve(false);
    return run(async (allowed) => {
      await verify(allowed);
      const namespace = `remote:${prepared.canonical.id}`;
      const previous = recovery.get(namespace);
      const entry =
        previous ??
        recovery.reserve(
          namespace,
          {
            kind: 'revoke',
            input: { id: prepared.canonical.id, expectedVersion: prepared.canonical.version },
            originals: deps
              .listLocal()
              .filter((item) => item.socialCategoryId === prepared.canonical.id),
          },
          key,
        );
      return execute(entry, allowed);
    }, 'saving');
  };
  function invalidate(reason: string) {
    generation += 1;
    cancel?.();
    cancel = null;
    recovery.lock(reason);
    update({
      items: [],
      nextCursor: null,
      prepared: null,
      phase: 'error',
      error: 'temporary',
      uncertain: false,
    });
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh: () => load(),
    next: () => (snapshot.nextCursor === null ? Promise.resolve(false) : load(snapshot.nextCursor)),
    prepareAttach,
    confirmAttach,
    prepareRevoke,
    confirmRevoke,
    retryPending: () =>
      run(async (allowed) => {
        await verify(allowed);
        const prepared = snapshot.prepared;
        const pending =
          prepared?.kind === 'revoke' ? recovery.get(`remote:${prepared.canonical.id}`) : null;
        return pending === null ? false : execute(pending, allowed);
      }, 'saving'),
    hasPending: (id: CategoryId) => recovery.get(`local:${id}`) !== null,
    hasPendingRemote: (id: string) => recovery.get(`remote:${id}`) !== null,
    clearPrepared: () => update({ prepared: null, uncertain: false }),
    invalidate,
    resume: () => {
      disposed = false;
      stopRecovery ??= recovery.subscribe(() => update({}));
    },
    dispose: () => {
      disposed = true;
      stopRecovery?.();
      stopRecovery = null;
      generation += 1;
      cancel?.();
      listeners.clear();
    },
  };
}
