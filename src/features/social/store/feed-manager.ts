import type { PageInput, PostView } from '@/domain/social/social';

import type { PublicSocialRepository, SocialRepository } from '@/repositories/social-repository';

import {
  socialErrorCode,
  uniquePosts,
  type FeedSnapshot,
  type FeedView,
} from '@/features/social/lib/feed-validation';
import { validatePage, type FeedClock } from '@/features/social/lib/validate-page';
import type {
  SocialInvalidation,
  SocialSessionClient,
  SocialSessionScope,
} from '@/features/social/session-lifecycle';

type ReadDependencies = { clock: FeedClock; online: () => boolean; visible: () => boolean };
export type FeedDependencies = ReadDependencies & {
  anonymous?: false;
  repository: () => SocialRepository;
  publicRepository?: () => PublicSocialRepository;
  capture: () => () => boolean;
  activate: () => Promise<SocialSessionScope | null>;
  deactivate: () => void;
  attach: (client: SocialSessionClient) => () => void;
  invalidateSession: (reason: SocialInvalidation) => void;
};
export type AnonymousFeedDependencies = ReadDependencies & {
  anonymous: true;
  repository: () => PublicSocialRepository;
};
const INITIAL: FeedSnapshot = {
  phase: 'blocked',
  view: 'friends',
  mode: null,
  profile: null,
  items: [],
  canShow: false,
  cursorStack: [null],
  pageIndex: 0,
  nextCursor: null,
  firstHeadId: null,
  hasNew: false,
  leaseUntil: 0,
  error: null,
};
export function createSocialFeedManager(
  deps: FeedDependencies | AnonymousFeedDependencies,
  onChange: (state: FeedSnapshot) => void,
  onInvalidate?: (reason: SocialInvalidation) => void,
) {
  let state: FeedSnapshot = { ...INITIAL, view: deps.anonymous ? 'public' : 'friends' };
  let generation = 0;
  let open = false;
  let viewEpoch = 0;
  let categoryId: string | undefined;
  let timer: unknown;
  let leaseTimer: unknown;
  let detach: (() => void) | null = null;
  const capture = () => (deps.anonymous ? () => true : deps.capture());
  function update(partial: Partial<FeedSnapshot>): void {
    state = { ...state, ...partial };
    onChange(state);
  }
  function stopTimer(): void {
    if (timer !== undefined) deps.clock.clear(timer);
    if (leaseTimer !== undefined) deps.clock.clear(leaseTimer);
    timer = undefined;
    leaseTimer = undefined;
  }
  function current(captured: number, allowed: () => boolean): boolean {
    return open && generation === captured && allowed() && deps.online() && deps.visible();
  }
  function invalidate(reason: SocialInvalidation): void {
    generation += 1;
    stopTimer();
    const purge = ['closed', 'auth', 'account', 'revoked', 'cross-tab', 'provider'].includes(
      reason,
    );
    update({
      phase: 'blocked',
      canShow: false,
      leaseUntil: 0,
      error: null,
      ...(purge ? { ...INITIAL, view: state.view } : {}),
    });
    onInvalidate?.(reason);
  }
  function source(): Pick<PublicSocialRepository, 'feed' | 'validatePosts'> {
    if (deps.anonymous) return deps.repository();
    if (state.view === 'public') {
      if (deps.publicRepository === undefined) throw new Error('공개 읽기가 연결되지 않았습니다.');
      return deps.publicRepository();
    }
    const repository = deps.repository();
    return {
      feed:
        state.view === 'mine'
          ? (page) => repository.myPosts(page)
          : (page) => repository.feed(page),
      validatePosts: (input) => repository.validatePosts(input),
    };
  }
  function readPage(cursor?: string | null) {
    const page: PageInput = cursor ? { cursor } : {};
    return source().feed(categoryId === undefined ? page : { ...page, categoryId });
  }
  async function checkIdentity(captured: number, allowed: () => boolean): Promise<boolean> {
    if (deps.anonymous) return true;
    const identity = await deps.repository().me();
    if (!current(captured, allowed)) return false;
    update({ mode: identity.data.mode, profile: identity.data.profile });
    if (identity.data.profile === null || (identity.data.mode === 'off' && state.view !== 'mine')) {
      update({ phase: 'ready', items: [], canShow: false, leaseUntil: 0, nextCursor: null });
      return false;
    }
    return true;
  }
  function schedulePoll(): void {
    stopTimer();
    const captured = generation;
    leaseTimer = deps.clock.schedule(
      () => {
        leaseTimer = undefined;
        if (open && generation === captured && deps.clock.now() >= state.leaseUntil)
          update({ canShow: false });
      },
      Math.max(0, state.leaseUntil - deps.clock.now()),
    );
    timer = deps.clock.schedule(
      () => {
        timer = undefined;
        if (deps.clock.now() >= state.leaseUntil && !deps.anonymous) {
          deps.invalidateSession('recheck');
          void deps.activate();
        } else void validateCurrent();
      },
      Math.max(0, state.leaseUntil - deps.clock.now() - 5_000),
    );
  }
  function failed(error: unknown, captured: number, allowed: () => boolean): void {
    if (!current(captured, allowed)) return;
    const code = socialErrorCode(error);
    if (!deps.anonymous && (code === 'unauthorized' || code === 'account-deleted')) {
      deps.invalidateSession(code === 'unauthorized' ? 'auth' : 'account');
      return;
    }
    generation += 1;
    stopTimer();
    update({ phase: 'error', items: [], canShow: false, leaseUntil: 0, error: code });
  }
  function show(items: readonly PostView[], startedAt: number): boolean {
    if (deps.clock.now() >= startedAt + 35_000) return false;
    update({ phase: 'ready', items, canShow: true, leaseUntil: startedAt + 35_000 });
    schedulePoll();
    return true;
  }
  async function loadPage(cursor: string | null, stack: readonly (string | null)[]): Promise<void> {
    const captured = ++generation;
    const allowed = capture();
    stopTimer();
    update({
      phase: 'loading',
      items: [],
      canShow: false,
      leaseUntil: 0,
      error: null,
      cursorStack: stack,
      pageIndex: stack.length - 1,
      nextCursor: null,
      hasNew: false,
    });
    if (!current(captured, allowed)) return;
    try {
      if (!(await checkIdentity(captured, allowed))) return;
      const response = await readPage(cursor);
      if (!current(captured, allowed)) return;
      const items = uniquePosts(response.data.items);
      const startedAt = deps.clock.now();
      const permitted = await validatePage(
        source(),
        items.map((post) => post.id),
        deps.clock,
      );
      if (!current(captured, allowed)) return;
      if (
        !show(
          items.filter((post) => permitted.has(post.id)),
          startedAt,
        )
      ) {
        failed(new Error('검증 유효 시간이 지났습니다.'), captured, allowed);
        return;
      }
      update({
        nextCursor: response.data.nextCursor,
        firstHeadId: cursor === null ? (items[0]?.id ?? null) : state.firstHeadId,
      });
    } catch (error) {
      failed(error, captured, allowed);
    }
  }
  async function validateCurrent(): Promise<void> {
    const captured = ++generation;
    const allowed = capture();
    stopTimer();
    update({ canShow: false, phase: 'loading' });
    if (!current(captured, allowed)) return;
    try {
      if (!(await checkIdentity(captured, allowed))) return;
      const startedAt = deps.clock.now();
      const permitted = await validatePage(
        source(),
        state.items.map((post) => post.id),
        deps.clock,
      );
      if (!current(captured, allowed)) return;
      const first = await readPage();
      if (!current(captured, allowed)) return;
      if (
        !show(
          state.items.filter((post) => permitted.has(post.id)),
          startedAt,
        )
      ) {
        failed(new Error('검증 유효 시간이 지났습니다.'), captured, allowed);
        return;
      }
      update({ hasNew: (first.data.items[0]?.id ?? null) !== state.firstHeadId });
    } catch (error) {
      failed(error, captured, allowed);
    }
  }
  const client: SocialSessionClient = {
    invalidate,
    resume: () => {
      if (state.items.length > 0) void validateCurrent();
      else void loadPage(state.cursorStack[state.pageIndex] ?? null, state.cursorStack);
    },
  };
  return {
    getSnapshot: () => state,
    visibleItems: () =>
      state.canShow &&
      deps.clock.now() < state.leaseUntil &&
      deps.online() &&
      deps.visible() &&
      capture()()
        ? state.items
        : [],
    open: async (filterCategoryId?: string) => {
      if (open) return;
      open = true;
      categoryId = filterCategoryId;
      const openedAt = ++viewEpoch;
      if (deps.anonymous) {
        await loadPage(null, [null]);
        return;
      }
      detach = deps.attach(client);
      const scope = await deps.activate();
      if (scope === null && open && viewEpoch === openedAt) invalidate('auth');
      else if (scope !== null && open && viewEpoch === openedAt && state.phase === 'blocked')
        client.resume?.(scope);
    },
    close: () => {
      if (!open) return;
      open = false;
      viewEpoch += 1;
      if (!deps.anonymous) deps.deactivate();
      detach?.();
      detach = null;
      invalidate('closed');
    },
    refresh: () => loadPage(null, [null]),
    refreshCurrent: () => loadPage(state.cursorStack[state.pageIndex] ?? null, state.cursorStack),
    setView: async (view: FeedView) => {
      if (deps.anonymous || view === state.view) return;
      update({ view });
      if (open) await loadPage(null, [null]);
    },
    next: () =>
      state.nextCursor === null
        ? Promise.resolve()
        : loadPage(state.nextCursor, [...state.cursorStack, state.nextCursor]),
    previous: () =>
      state.pageIndex === 0
        ? Promise.resolve()
        : loadPage(
            state.cursorStack[state.pageIndex - 1] ?? null,
            state.cursorStack.slice(0, state.pageIndex),
          ),
    validate: validateCurrent,
    invalidate,
  };
}
